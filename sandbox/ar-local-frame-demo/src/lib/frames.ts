import { Quaternion, Vector3 } from "three";
import { geoPoseToLocalENU, localENUToGeoPose, yprToQuaternion, quaternionToYPR } from "geopose-lib";
import type { GeoPose } from "geopose-lib";

// Right-handed scene coordinates: X=East, Y=Up, Z=South.
export const ENU_TO_EUS = new Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2);
export const EUS_TO_ENU = ENU_TO_EUS.clone().conjugate();
export function quat(q: GeoPose["quaternion"]): Quaternion {
  return new Quaternion(q.x, q.y, q.z, q.w).normalize();
}
export function ypr(yaw: number, pitch: number, roll: number) {
  return yprToQuaternion({ position: { lat: 0, lon: 0, h: 0 }, angles: { yaw, pitch, roll } }).quaternion;
}

/** A gravity-aligned synthetic session, yaw measured CCW East toward North
 * at the observed device position. Its native axes are EUS when yaw is zero.
 * The local camera orientation is derived from the same global observation,
 * so the two views cannot describe contradictory camera orientations. */
export function sessionPlacement(device: GeoPose, asset: GeoPose, deviceLocal: Vector3, yaw: number) {
  const enuFromSession = quat(ypr(yaw, 0, 0)).multiply(EUS_TO_ENU);
  const sessionFromEnu = enuFromSession.clone().invert();
  const originOffset = deviceLocal.clone().applyQuaternion(enuFromSession).negate();
  const origin = localENUToGeoPose(
    { east: originOffset.x, north: originOffset.y, up: originOffset.z },
    enuFromSession, device.position
  );
  const localAsset = geoPoseToLocalENU(asset, device.position);
  const assetPosition = new Vector3(localAsset.position.east, localAsset.position.north, localAsset.position.up)
    .applyQuaternion(sessionFromEnu).add(deviceLocal);
  const assetOrientation = sessionFromEnu.clone().multiply(quat(localAsset.orientation));
  const cameraOrientation = sessionFromEnu.clone().multiply(quat(device.quaternion));
  // Display local camera YPR in a Z-up basis parallel to the session's ground axes.
  const cameraYPR = quaternionToYPR({ position: device.position,
    quaternion: EUS_TO_ENU.clone().multiply(cameraOrientation) }).angles;
  const assetYPR = quaternionToYPR({ position: device.position,
    quaternion: EUS_TO_ENU.clone().multiply(assetOrientation) }).angles;
  return { origin, originOffset, enuFromSession, localAsset, assetPosition, assetOrientation, cameraOrientation, cameraYPR, assetYPR };
}
