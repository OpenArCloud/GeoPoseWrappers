import { describe, expect, it } from 'vitest';
import { GeoPoseBasic, yprToQuaternion, quaternionToYPR, getRelativePose, applyRelativePose, interpolatePose, type Quaternion } from '../src/index.js';
import * as standalone from '../../../wrappers/cesium/GeoPoseSerialization.js';

const position = { lat: 60, lon: 10, h: 100 };
const pose = (yaw: number, pitch = 0, roll = 0) => yprToQuaternion({ position, angles: { yaw, pitch, roll } });
function sameRotation(a: Quaternion, b: Quaternion, digits = 10) {
  const dot = a.x*b.x+a.y*b.y+a.z*b.z+a.w*b.w;
  expect(Math.abs(dot)).toBeCloseTo(1, digits);
}
function xAxis(q: Quaternion) {
  return [1-2*(q.y*q.y+q.z*q.z), 2*(q.x*q.y+q.w*q.z), 2*(q.x*q.z-q.w*q.y)];
}
function vector(actual: number[], expected: number[]) {
  actual.forEach((v, i) => expect(v).toBeCloseTo(expected[i], 10));
}

describe('Fixed ENU rotations', () => {
  it('turns East toward North for +90 yaw', () => {
    vector(xAxis(GeoPoseBasic.fromYPR(position, 0, 0, 0).rotateAroundUpAxis(90).toGeoPose().quaternion), [0, 1, 0]);
  });
  it('rotates about fixed North after yaw, not the rotated body Y axis', () => {
    vector(xAxis(GeoPoseBasic.fromYPR(position, 90, 0, 0).rotateAroundNorthAxis(90).toGeoPose().quaternion), [0, 1, 0]);
  });
  it('rotates about fixed East after yaw, carrying North into Up', () => {
    vector(xAxis(GeoPoseBasic.fromYPR(position, 90, 0, 0).rotateAroundEastAxis(90).toGeoPose().quaternion), [0, 0, 1]);
  });
});

for (const [name, convert] of [['core', quaternionToYPR], ['standalone serializer', standalone.quaternionToYPR]] as const) {
  describe(name, () => {
    for (const pitch of [-90, 90]) {
      it(`preserves physical orientation at pitch ${pitch}, including q and -q`, () => {
        for (const yaw of [-170, 20, 110]) for (const roll of [-80, 30, 160]) for (const scale of [1, -3]) {
          const p = pose(yaw, pitch, roll);
          const q = p.quaternion;
          const result = convert({ position, quaternion: { x:q.x*scale, y:q.y*scale, z:q.z*scale, w:q.w*scale } });
          expect(result.angles.roll).toBe(0);
          sameRotation(yprToQuaternion(result).quaternion, q);
        }
      });
    }
    it('normalizes non-unit input and rejects undefined rotations', () => {
      const q = pose(30, 45, 60).quaternion;
      sameRotation(yprToQuaternion(convert({ position, quaternion: { x:2*q.x,y:2*q.y,z:2*q.z,w:2*q.w } })).quaternion, q);
      for (const w of [0, NaN, Infinity]) expect(() => convert({position, quaternion:{x:0,y:0,z:0,w}})).toThrow();
    });
  });
}

it('relative identity preserves a rotated base; relative rotation is body-relative', () => {
  const base = pose(90, 0, 0);
  const zero = { east:0, north:0, up:0 };
  sameRotation(getRelativePose(base, base).rotation, {x:0,y:0,z:0,w:1});
  sameRotation(applyRelativePose(base, { translation:zero, rotation:{x:0,y:0,z:0,w:1} }).quaternion, base.quaternion);
  const result = applyRelativePose(base, { translation:zero, rotation:pose(0, 45).quaternion });
  vector(xAxis(result.quaternion), [0, Math.SQRT1_2, -Math.SQRT1_2]);
  // Translation retains its documented ENU meaning even for a rotated base.
  const target = GeoPoseBasic.fromYPR({lat:60.001,lon:10.002,h:120}, -30, 40, 25).toGeoPose();
  const relative = getRelativePose(base, target);
  const recovered = applyRelativePose(base, relative);
  sameRotation(recovered.quaternion, target.quaternion);
  expect(recovered.position.lat).toBeCloseTo(target.position.lat, 9);
  expect(recovered.position.lon).toBeCloseTo(target.position.lon, 9);
});

it('small-angle SLERP honors t, including both endpoints', () => {
  for (const t of [0, 0.2, 0.8, 1]) {
    const result = interpolatePose(pose(0), pose(0.05), t);
    expect(quaternionToYPR(result).angles.yaw).toBeCloseTo(0.05*t, 8);
    expect(Math.hypot(...Object.values(result.quaternion))).toBeCloseTo(1, 12);
  }
});
