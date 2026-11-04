import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { Camera, Cartesian3, GeographicProjection, Matrix3, Matrix4, Transforms, Entity, SceneMode } from 'cesium';
import { yprToQuaternion } from 'geopose-lib';
import * as adapter from '../src/adapter.js';
import * as wrapper from '../../../../wrappers/cesium/GeoPoseConverter.js';

const fixtures = JSON.parse(readFileSync(new URL('../../../../docs/examples/enu-rotation-poses.json', import.meta.url), 'utf8'));
const positions = [{lat:60,lon:10,h:100}, {lat:-34,lon:151,h:200}];
const vector = (actual: Cartesian3, expected: number[]) => [actual.x,actual.y,actual.z].forEach((v,i)=>expect(v).toBeCloseTo(expected[i], 9));
function camera() {
  // Actual Cesium Camera math, with a minimal scene; no WebGL renderer needed.
  return new Camera({ drawingBufferWidth:800, drawingBufferHeight:600, mapProjection:new GeographicProjection(), mode:SceneMode.SCENE3D } as any);
}
function enuVector(v: Cartesian3, p: typeof positions[0]) {
  const transform = Transforms.eastNorthUpToFixedFrame(Cartesian3.fromDegrees(p.lon,p.lat,p.h));
  return Matrix4.multiplyByPointAsVector(Matrix4.inverseTransformation(transform,new Matrix4()),v,new Cartesian3());
}
for (const [name, api] of [['npm adapter',adapter], ['standalone wrapper',wrapper]] as const) {
  describe(name, () => {
    for (const p of positions) {
      it(`reads native North/East headings as physical ENU orientation at ${p.lat}`, () => {
        const cam=camera();
        for (const [heading,right,back] of [[0,[1,0,0],[0,-1,0]], [Math.PI/2,[0,-1,0],[-1,0,0]]] as const) {
          cam.setView({destination:Cartesian3.fromDegrees(p.lon,p.lat,p.h), orientation:{heading,pitch:0,roll:0}});
          const pose=api.getCameraGeoPose(cam);
          const q=pose.quaternion;
          vector(new Cartesian3(1-2*(q.y*q.y+q.z*q.z),2*(q.x*q.y+q.w*q.z),2*(q.x*q.z-q.w*q.y)), [...right]);
          vector(new Cartesian3(2*(q.x*q.z+q.w*q.y),2*(q.y*q.z-q.w*q.x),1-2*(q.x*q.x+q.y*q.y)), [...back]);
        }
      });
      for (const sample of fixtures.sequences.flatMap((s:any)=>s.poses)) {
        it(`${sample.id}: sets camera axes, flyTo vectors and entity axes at ${p.lat}`, () => {
          const pose={...sample.basicQuaternion,position:p};
          const cam=camera();
          api.setCameraGeoPose(cam,pose);
          vector(enuVector(cam.rightWC,p),sample.axesInENU.x);
          vector(enuVector(cam.upWC,p),sample.axesInENU.y);
          vector(enuVector(cam.directionWC,p),sample.axesInENU.z.map((n:number)=>-n));
          const read=api.getCameraGeoPose(cam).quaternion;
          const q=pose.quaternion;
          expect(Math.abs(read.x*q.x+read.y*q.y+read.z*q.z+read.w*q.w)).toBeCloseTo(1,10);
          const fly=vi.spyOn(cam,'flyTo').mockImplementation(()=>{});
          api.flyCameraToGeoPose(cam,pose,3);
          const options=fly.mock.calls[0][0];
          expect(options.duration).toBe(3);
          vector(enuVector((options.orientation as any).direction,p),sample.axesInENU.z.map((n:number)=>-n));
          vector(enuVector((options.orientation as any).up,p),sample.axesInENU.y);
          const props=api.createEntityFromGeoPose(pose);
          const matrix=Matrix3.fromQuaternion(props.orientation);
          for (const [column,axis] of ['x','y','z'].entries()) {
            vector(enuVector(Matrix3.getColumn(matrix,column,new Cartesian3()),p),sample.axesInENU[axis]);
          }
          const entity=new Entity();
          api.setEntityGeoPose(entity,pose);
          const entityMatrix=Matrix3.fromQuaternion(entity.orientation!.getValue()!);
          for (const [column,axis] of ['x','y','z'].entries()) {
            vector(enuVector(Matrix3.getColumn(entityMatrix,column,new Cartesian3()),p),sample.axesInENU[axis]);
          }
          const result=api.getEntityGeoPose(entity)!.quaternion;
          expect(Math.abs(result.x*q.x+result.y*q.y+result.z*q.z+result.w*q.w)).toBeCloseTo(1,10);
        });
      }
    }
    it('uses world axes when the camera has a nonidentity reference transform',()=>{
      const cam=camera(); const p=positions[0];
      const pose=yprToQuaternion({position:p,angles:{yaw:27,pitch:35,roll:63}});
      api.setCameraGeoPose(cam,pose);
      const transform=Transforms.eastNorthUpToFixedFrame(Cartesian3.fromDegrees(12,58,0));
      cam.lookAtTransform(transform);
      const q=api.getCameraGeoPose(cam).quaternion; const r=pose.quaternion;
      expect(Math.abs(q.x*r.x+q.y*r.y+q.z*r.z+q.w*r.w)).toBeCloseTo(1,10);
      api.setCameraGeoPose(cam,pose);
      const s=api.getCameraGeoPose(cam).quaternion;
      expect(Math.abs(s.x*r.x+s.y*r.y+s.z*r.z+s.w*r.w)).toBeCloseTo(1,10);
    });
  });
}
