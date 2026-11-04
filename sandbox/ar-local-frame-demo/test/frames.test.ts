import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { localENUToGeoPose } from 'geopose-lib';
import { ENU_TO_EUS, EUS_TO_ENU, quat, sessionPlacement, ypr } from '../src/lib/frames';

const position = { lat:60, lon:10, h:100 };
function vector(a:Vector3, b:number[]) { a.toArray().forEach((v,i)=>expect(v).toBeCloseTo(b[i],8)); }
function rotation(a:Quaternion,b:Quaternion) { expect(Math.abs(a.dot(b))).toBeCloseTo(1,10); }
it('uses a right-handed EUS scene and maps North to negative Z',()=>{
  const e=new Vector3(1,0,0).applyQuaternion(ENU_TO_EUS);
  const n=new Vector3(0,1,0).applyQuaternion(ENU_TO_EUS);
  const u=new Vector3(0,0,1).applyQuaternion(ENU_TO_EUS);
  vector(e,[1,0,0]); vector(n,[0,0,-1]); vector(u,[0,1,0]);
  vector(e.clone().cross(n),u.toArray());
});
describe('shared session transforms',()=>{
  for (const yaw of [0,90,-90,37]) {
    it(`preserves full position and orientation across the two views at session yaw ${yaw}`,()=>{
      const device={position,quaternion:ypr(25,30,70)};
      const asset=localENUToGeoPose({east:5,north:10,up:2}, ypr(90,45,90),position);
      const local=new Vector3(2,1,-3);
      const p=sessionPlacement(device,asset,local,yaw);
      const rebuilt=p.assetPosition.clone().applyQuaternion(p.enuFromSession).add(p.originOffset);
      vector(rebuilt,[5,10,2]);
      rotation(p.enuFromSession.clone().multiply(p.assetOrientation),quat(p.localAsset.orientation));
      rotation(p.enuFromSession.clone().multiply(p.cameraOrientation),quat(device.quaternion));
      // Camera-relative asset transform is independent of the chosen session frame.
      const viewPosition=p.assetPosition.clone().sub(local).applyQuaternion(p.cameraOrientation.clone().invert());
      const expectedPosition=new Vector3(5,10,2).applyQuaternion(quat(device.quaternion).invert());
      vector(viewPosition,expectedPosition.toArray());
      rotation(p.cameraOrientation.clone().invert().multiply(p.assetOrientation),
        quat(device.quaternion).invert().multiply(quat(p.localAsset.orientation)));
    });
  }
});
it('+90 session yaw rotates session +X from East toward North',()=>{
  const device={position,quaternion:EUS_TO_ENU};
  const p=sessionPlacement(device,device,new Vector3(),90);
  vector(new Vector3(1,0,0).applyQuaternion(p.enuFromSession),[0,1,0]);
  vector(new Vector3(0,0,1).applyQuaternion(p.enuFromSession),[1,0,0]);
});
