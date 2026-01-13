/**
 * GeoPose ↔ Cesium Converter
 *
 * Converts between OGC GeoPose (Basic Quaternion) and CesiumJS camera/entity poses.
 *
 * Coordinate System Differences:
 * - OGC GeoPose: Uses ENU (East-North-Up) local tangent plane frame
 *   - X+ points East
 *   - Y+ points North
 *   - Z+ points Up
 *   - Quaternion describes orientation relative to local ENU frame
 *
 * - Cesium: Uses ECEF (Earth-Centered Earth-Fixed) frame
 *   - X+ points to 0°N, 0°E (intersection of equator and prime meridian)
 *   - Y+ points to 0°N, 90°E
 *   - Z+ points to North Pole
 *   - Entity quaternions are in ECEF frame
 *   - Camera uses heading/pitch/roll relative to local ENU
 */

import {
  Cartesian3,
  Cartographic,
  Math as CesiumMath,
  Quaternion,
  Matrix3,
  Matrix4,
  Transforms,
  Camera,
  Entity,
  JulianDate,
} from "cesium";
import { quaternionToYPR, yprToQuaternion } from "geopose-lib";
import type { GeoPose } from "geopose-lib";

// ============================================================================
// Type Re-exports
// ============================================================================

export type { GeoPose } from "geopose-lib";

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Normalize a quaternion to unit length
 */
function normalizeQuaternion(q: {
  x: number;
  y: number;
  z: number;
  w: number;
}): { x: number; y: number; z: number; w: number } {
  const mag = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
  if (mag === 0) return { x: 0, y: 0, z: 0, w: 1 };
  return {
    x: q.x / mag,
    y: q.y / mag,
    z: q.z / mag,
    w: q.w / mag,
  };
}

/**
 * Convert heading/pitch/roll (in radians) to ENU quaternion
 * Using aerospace convention: yaw (heading), pitch, roll
 * Rotation order: Z (yaw) -> Y (pitch) -> X (roll)
 */
function hprToQuaternion(
  heading: number,
  pitch: number,
  roll: number
): { x: number; y: number; z: number; w: number } {
  const pose = yprToQuaternion({
    position: { lat: 0, lon: 0, h: 0 },
    angles: {
      yaw: CesiumMath.toDegrees(heading),
      pitch: CesiumMath.toDegrees(pitch),
      roll: CesiumMath.toDegrees(roll),
    },
  });

  return pose.quaternion;
}

/**
 * Convert ENU quaternion to heading/pitch/roll (in radians)
 */
function quaternionToHpr(q: {
  x: number;
  y: number;
  z: number;
  w: number;
}): { heading: number; pitch: number; roll: number } {
  const ypr = quaternionToYPR({
    position: { lat: 0, lon: 0, h: 0 },
    quaternion: q,
  });

  return {
    heading: CesiumMath.toRadians(ypr.angles.yaw),
    pitch: CesiumMath.toRadians(ypr.angles.pitch),
    roll: CesiumMath.toRadians(ypr.angles.roll),
  };
}

/**
 * Get the ENU-to-ECEF rotation matrix at a given position
 */
function getEnuToEcefMatrix(
  longitude: number,
  latitude: number
): { matrix: Matrix3; quaternion: Quaternion } {
  const cartographic = Cartographic.fromDegrees(longitude, latitude, 0);
  const position = Cartographic.toCartesian(cartographic);

  const transform = Transforms.eastNorthUpToFixedFrame(position);
  const rotation = Matrix4.getMatrix3(transform, new Matrix3());
  const quaternion = Quaternion.fromRotationMatrix(rotation);

  return { matrix: rotation, quaternion };
}

// ============================================================================
// Camera Operations
// ============================================================================

/**
 * Get the current camera pose as GeoPose
 */
export function getCameraGeoPose(camera: Camera): GeoPose {
  const cartographic = camera.positionCartographic;

  const position = {
    lat: CesiumMath.toDegrees(cartographic.latitude),
    lon: CesiumMath.toDegrees(cartographic.longitude),
    h: cartographic.height,
  };

  const heading = camera.heading;
  const pitch = camera.pitch;
  const roll = camera.roll;

  const quaternion = hprToQuaternion(heading, pitch, roll);

  return { position, quaternion };
}

/**
 * Set the camera pose from GeoPose
 */
export function setCameraGeoPose(camera: Camera, geoPose: GeoPose): void {
  const destination = Cartesian3.fromDegrees(
    geoPose.position.lon,
    geoPose.position.lat,
    geoPose.position.h
  );

  const hpr = quaternionToHpr(geoPose.quaternion);

  camera.setView({
    destination,
    orientation: {
      heading: hpr.heading,
      pitch: hpr.pitch,
      roll: hpr.roll,
    },
  });
}

/**
 * Fly the camera to a GeoPose with animation
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

  const hpr = quaternionToHpr(geoPose.quaternion);

  camera.flyTo({
    destination,
    orientation: {
      heading: hpr.heading,
      pitch: hpr.pitch,
      roll: hpr.roll,
    },
    duration,
  });
}

// ============================================================================
// Entity Operations
// ============================================================================

/**
 * Get an entity's pose as GeoPose
 */
export function getEntityGeoPose(
  entity: Entity,
  time?: JulianDate
): GeoPose | null {
  if (!entity.position) {
    return null;
  }

  const positionEcef = entity.position.getValue(time);
  if (!positionEcef) {
    return null;
  }

  const cartographic = Cartographic.fromCartesian(positionEcef);
  const position = {
    lat: CesiumMath.toDegrees(cartographic.latitude),
    lon: CesiumMath.toDegrees(cartographic.longitude),
    h: cartographic.height,
  };

  let quaternion = { x: 0, y: 0, z: 0, w: 1 };

  if (entity.orientation) {
    const orientationEcef = entity.orientation.getValue(time);
    if (orientationEcef) {
      const { quaternion: enuToEcefQuat } = getEnuToEcefMatrix(
        position.lon,
        position.lat
      );

      const ecefToEnuQuat = Quaternion.conjugate(
        enuToEcefQuat,
        new Quaternion()
      );

      const enuQuat = Quaternion.multiply(
        ecefToEnuQuat,
        orientationEcef,
        new Quaternion()
      );

      quaternion = normalizeQuaternion({
        x: enuQuat.x,
        y: enuQuat.y,
        z: enuQuat.z,
        w: enuQuat.w,
      });
    }
  }

  return { position, quaternion };
}

/**
 * Set an entity's pose from GeoPose
 */
export function setEntityGeoPose(entity: Entity, geoPose: GeoPose): void {
  const positionEcef = Cartesian3.fromDegrees(
    geoPose.position.lon,
    geoPose.position.lat,
    geoPose.position.h
  );

  // @ts-ignore - Cesium accepts Cartesian3 directly
  entity.position = positionEcef;

  const { quaternion: enuToEcefQuat } = getEnuToEcefMatrix(
    geoPose.position.lon,
    geoPose.position.lat
  );

  const enuQuat = new Quaternion(
    geoPose.quaternion.x,
    geoPose.quaternion.y,
    geoPose.quaternion.z,
    geoPose.quaternion.w
  );

  const ecefQuat = Quaternion.multiply(enuToEcefQuat, enuQuat, new Quaternion());
  Quaternion.normalize(ecefQuat, ecefQuat);

  // @ts-ignore - Cesium accepts Quaternion directly
  entity.orientation = ecefQuat;
}

/**
 * Create entity properties from GeoPose
 */
export function createEntityFromGeoPose(geoPose: GeoPose): {
  position: Cartesian3;
  orientation: Quaternion;
} {
  const position = Cartesian3.fromDegrees(
    geoPose.position.lon,
    geoPose.position.lat,
    geoPose.position.h
  );

  const { quaternion: enuToEcefQuat } = getEnuToEcefMatrix(
    geoPose.position.lon,
    geoPose.position.lat
  );

  const enuQuat = new Quaternion(
    geoPose.quaternion.x,
    geoPose.quaternion.y,
    geoPose.quaternion.z,
    geoPose.quaternion.w
  );

  const orientation = Quaternion.multiply(
    enuToEcefQuat,
    enuQuat,
    new Quaternion()
  );
  Quaternion.normalize(orientation, orientation);

  return { position, orientation };
}

// ============================================================================
// Convenience Exports
// ============================================================================

export const GeoPoseConverter = {
  getCameraGeoPose,
  setCameraGeoPose,
  flyCameraToGeoPose,
  getEntityGeoPose,
  setEntityGeoPose,
  createEntityFromGeoPose,
  normalizeQuaternion,
  hprToQuaternion,
  quaternionToHpr,
};

export default GeoPoseConverter;
