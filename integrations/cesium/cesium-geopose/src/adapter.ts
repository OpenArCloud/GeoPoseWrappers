import {
  Cartesian3,
  Cartographic,
  Math as CesiumMath,
  Matrix3,
  Matrix4,
  Quaternion as CesiumQuaternion,
  Transforms,
  type Camera,
  type Entity,
  type JulianDate
} from "cesium";
import { quaternionToYPR, yprToQuaternion } from "geopose-lib";
import type { GeoPose, LLH, Quaternion } from "geopose-lib";

const IDENTITY_QUATERNION = { x: 0, y: 0, z: 0, w: 1 };

/**
 * Convert a Cesium camera pose to GeoPose (Basic Quaternion).
 */
export function getCameraGeoPose(camera: Camera): GeoPose {
  const cartographic = camera.positionCartographic;
  const position = {
    lat: CesiumMath.toDegrees(cartographic.latitude),
    lon: CesiumMath.toDegrees(cartographic.longitude),
    h: cartographic.height
  };

  const ypr = {
    yaw: CesiumMath.toDegrees(camera.heading),
    pitch: CesiumMath.toDegrees(camera.pitch),
    roll: CesiumMath.toDegrees(camera.roll)
  };

  return yprToQuaternion({ position, angles: ypr });
}

/**
 * Set a Cesium camera pose from GeoPose (Basic Quaternion).
 */
export function setCameraGeoPose(camera: Camera, geoPose: GeoPose): void {
  const destination = Cartesian3.fromDegrees(
    geoPose.position.lon,
    geoPose.position.lat,
    geoPose.position.h
  );

  const ypr = quaternionToYPR(geoPose);

  camera.setView({
    destination,
    orientation: {
      heading: CesiumMath.toRadians(ypr.angles.yaw),
      pitch: CesiumMath.toRadians(ypr.angles.pitch),
      roll: CesiumMath.toRadians(ypr.angles.roll)
    }
  });
}

/**
 * Fly the Cesium camera to a GeoPose (Basic Quaternion).
 */
export function flyCameraToGeoPose(
  camera: Camera,
  geoPose: GeoPose,
  duration: number = 2
): void {
  const destination = Cartesian3.fromDegrees(
    geoPose.position.lon,
    geoPose.position.lat,
    geoPose.position.h
  );

  const ypr = quaternionToYPR(geoPose);

  camera.flyTo({
    destination,
    orientation: {
      heading: CesiumMath.toRadians(ypr.angles.yaw),
      pitch: CesiumMath.toRadians(ypr.angles.pitch),
      roll: CesiumMath.toRadians(ypr.angles.roll)
    },
    duration
  });
}

/**
 * Convert a Cesium entity pose to GeoPose (Basic Quaternion).
 */
export function getEntityGeoPose(entity: Entity, time?: JulianDate): GeoPose | null {
  if (!entity.position) return null;
  const positionEcef = entity.position.getValue(time);
  if (!positionEcef) return null;

  const cartographic = Cartographic.fromCartesian(positionEcef);
  const position = {
    lat: CesiumMath.toDegrees(cartographic.latitude),
    lon: CesiumMath.toDegrees(cartographic.longitude),
    h: cartographic.height
  };

  let quaternion: Quaternion = { ...IDENTITY_QUATERNION };
  if (entity.orientation) {
    const orientationEcef = entity.orientation.getValue(time);
    if (orientationEcef) {
      const ecefToEnu = CesiumQuaternion.conjugate(
        getEnuToEcefQuaternion(position),
        new CesiumQuaternion()
      );
      const enuQuat = CesiumQuaternion.multiply(
        ecefToEnu,
        orientationEcef,
        new CesiumQuaternion()
      );
      CesiumQuaternion.normalize(enuQuat, enuQuat);
      quaternion = { x: enuQuat.x, y: enuQuat.y, z: enuQuat.z, w: enuQuat.w };
    }
  }

  return { position, quaternion };
}

/**
 * Set a Cesium entity pose from GeoPose (Basic Quaternion).
 */
export function setEntityGeoPose(entity: Entity, geoPose: GeoPose): void {
  const position = Cartesian3.fromDegrees(
    geoPose.position.lon,
    geoPose.position.lat,
    geoPose.position.h
  );

  // @ts-expect-error Cesium accepts Cartesian3 for entity.position
  entity.position = position;

  const ecefQuat = toEcefQuaternion(geoPose.position, geoPose.quaternion);
  // @ts-expect-error Cesium accepts Quaternion for entity.orientation
  entity.orientation = ecefQuat;
}

/**
 * Create Cesium entity properties from GeoPose (Basic Quaternion).
 */
export function createEntityFromGeoPose(geoPose: GeoPose): {
  position: Cartesian3;
  orientation: CesiumQuaternion;
} {
  const position = Cartesian3.fromDegrees(
    geoPose.position.lon,
    geoPose.position.lat,
    geoPose.position.h
  );

  const orientation = toEcefQuaternion(geoPose.position, geoPose.quaternion);
  return { position, orientation };
}

function getEnuToEcefQuaternion(position: LLH): CesiumQuaternion {
  const origin = Cartesian3.fromDegrees(position.lon, position.lat, position.h);
  const transform = Transforms.eastNorthUpToFixedFrame(origin);
  const rotation = Matrix4.getRotation(transform, new Matrix3());
  return CesiumQuaternion.fromRotationMatrix(rotation);
}

function toEcefQuaternion(position: LLH, enuQuaternion: Quaternion): CesiumQuaternion {
  const enuToEcef = getEnuToEcefQuaternion(position);
  const enuQuat = new CesiumQuaternion(
    enuQuaternion.x,
    enuQuaternion.y,
    enuQuaternion.z,
    enuQuaternion.w
  );
  const ecefQuat = CesiumQuaternion.multiply(
    enuToEcef,
    enuQuat,
    new CesiumQuaternion()
  );
  CesiumQuaternion.normalize(ecefQuat, ecefQuat);
  return ecefQuat;
}
