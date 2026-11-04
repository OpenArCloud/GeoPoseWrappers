import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GeoPoseBasic, quaternionToYPR, yprToQuaternion, type Quaternion } from '../src/index.js';

const fixtures = JSON.parse(readFileSync(
  new URL('../../../docs/examples/enu-rotation-poses.json', import.meta.url), 'utf8'
));

function axesInENU({ x, y, z, w }: Quaternion) {
  return {
    x: [1 - 2*(y*y + z*z), 2*(x*y + w*z), 2*(x*z - w*y)],
    y: [2*(x*y - w*z), 1 - 2*(x*x + z*z), 2*(y*z + w*x)],
    z: [2*(x*z + w*y), 2*(y*z - w*x), 1 - 2*(x*x + y*y)]
  };
}

describe('Illustrated ENU rotation examples', () => {
  for (const sequence of fixtures.sequences) {
    for (const sample of sequence.poses) {
      it(`${sample.id}: agrees with the golden quaternion and physical axis directions`, () => {
        const pose = yprToQuaternion(sample.basicYPR);
        const expected = sample.basicQuaternion.quaternion;
        const dot = (['x', 'y', 'z', 'w'] as const).reduce(
          (s, key) => s + pose.quaternion[key]*expected[key], 0
        );
        expect(Math.abs(dot)).toBeCloseTo(1, 12);
        expect(pose.position).toEqual(sample.basicQuaternion.position);
        const axes = axesInENU(pose.quaternion);
        for (const key of ['x', 'y', 'z'] as const) {
          axes[key].forEach((component, i) => expect(component).toBeCloseTo(sample.axesInENU[key][i], 12));
        }
        const recovered = quaternionToYPR(sample.basicQuaternion);
        const { yaw, pitch, roll } = sample.basicYPR.angles;
        expect(recovered.angles.yaw).toBeCloseTo(yaw, 12);
        expect(recovered.angles.pitch).toBeCloseTo(pitch, 12);
        expect(recovered.angles.roll).toBeCloseTo(roll, 12);
        const convenient = GeoPoseBasic.fromYPR(sample.basicYPR.position, yaw, pitch, roll);
        expect(convenient.toGeoPoseYPR().angles.yaw).toBeCloseTo(yaw, 12);
        expect(convenient.toGeoPoseYPR().angles.pitch).toBeCloseTo(pitch, 12);
        expect(convenient.toGeoPoseYPR().angles.roll).toBeCloseTo(roll, 12);
      });
    }
  }

  it('keeps every JSON pose printed in the explainer in sync with the fixtures', () => {
    const markdown = readFileSync(new URL('../../../docs/enu-ypr-quaternion.md', import.meta.url), 'utf8');
    const printed = [...markdown.matchAll(/```json\n([\s\S]*?)\n```/g)].map(match => JSON.parse(match[1]));
    expect(printed).toHaveLength(8); // Four distinct orientations, in both Basic forms.
    const golden = fixtures.sequences.flatMap((sequence: any) => sequence.poses.flatMap(
      (sample: any) => [sample.basicYPR, sample.basicQuaternion]
    ));
    for (const pose of printed) expect(golden).toContainEqual(pose);
  });
});
