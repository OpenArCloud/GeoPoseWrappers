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
 *
 * Transformation Strategy:
 * - For entities: Convert between ENU-relative quaternion and ECEF quaternion
 *   using the local ENU-to-ECEF rotation matrix at the position
 * - For camera: Cesium's heading/pitch/roll are already ENU-relative,
 *   so we convert directly to/from quaternion
 */

import {
  Cartesian3,
  Cartographic,
  Math as CesiumMath,
  Quaternion,
  Matrix3,
  Matrix4,
  Transforms,
  HeadingPitchRoll,
  Camera,
  Entity,
} from "cesium";

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * OGC GeoPose Basic Quaternion representation
 * Position in WGS84 geodetic coordinates, orientation as quaternion in ENU frame
 */
export interface GeoPoseBQ {
  position: {
    lat: number; // Latitude in degrees (WGS84)
    lon: number; // Longitude in degrees (WGS84)
    h: number; // Height in meters above WGS84 ellipsoid
  };
  quaternion: {
    x: number;
    y: number;
    z: number;
    w: number;
  };
}

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
  // Half angles
  const cy = Math.cos(heading / 2);
  const sy = Math.sin(heading / 2);
  const cp = Math.cos(pitch / 2);
  const sp = Math.sin(pitch / 2);
  const cr = Math.cos(roll / 2);
  const sr = Math.sin(roll / 2);

  // Combine rotations (ZYX order for heading-pitch-roll)
  return normalizeQuaternion({
    x: sr * cp * cy - cr * sp * sy,
    y: cr * sp * cy + sr * cp * sy,
    z: cr * cp * sy - sr * sp * cy,
    w: cr * cp * cy + sr * sp * sy,
  });
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
  const { x, y, z, w } = q;

  // Roll (x-axis rotation)
  const sinr_cosp = 2 * (w * x + y * z);
  const cosr_cosp = 1 - 2 * (x * x + y * y);
  const roll = Math.atan2(sinr_cosp, cosr_cosp);

  // Pitch (y-axis rotation)
  const sinp = 2 * (w * y - z * x);
  let pitch: number;
  if (Math.abs(sinp) >= 1) {
    pitch = (Math.sign(sinp) * Math.PI) / 2; // Clamp to ±90°
  } else {
    pitch = Math.asin(sinp);
  }

  // Yaw/Heading (z-axis rotation)
  const siny_cosp = 2 * (w * z + x * y);
  const cosy_cosp = 1 - 2 * (y * y + z * z);
  const heading = Math.atan2(siny_cosp, cosy_cosp);

  return { heading, pitch, roll };
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

  // Get the ENU-to-ECEF transform matrix (4x4)
  const transform = Transforms.eastNorthUpToFixedFrame(position);

  // Extract the 3x3 rotation part
  const rotation = Matrix4.getMatrix3(transform, new Matrix3());

  // Convert to quaternion
  const quaternion = Quaternion.fromRotationMatrix(rotation);

  return { matrix: rotation, quaternion };
}

// ============================================================================
// Camera Operations
// ============================================================================

/**
 * Get the current camera pose as GeoPose
 *
 * @param camera - Cesium Camera instance
 * @returns GeoPose with the camera's position and orientation in ENU frame
 */
export function getCameraGeoPose(camera: Camera): GeoPoseBQ {
  // Get camera position in cartographic coordinates
  const cartographic = camera.positionCartographic;

  const position = {
    lat: CesiumMath.toDegrees(cartographic.latitude),
    lon: CesiumMath.toDegrees(cartographic.longitude),
    h: cartographic.height,
  };

  // Cesium's heading/pitch/roll are relative to local ENU
  // heading: clockwise from north (we need to convert to counter-clockwise)
  // pitch: angle from local horizon (negative = looking down)
  // roll: rotation around the view direction

  // Convert Cesium's heading (CW from North) to standard yaw (CCW from East)
  // GeoPose ENU: X=East, Y=North, Z=Up
  // Standard heading: 0° = North, increases CW
  // We store as quaternion directly

  const heading = camera.heading; // radians, CW from North
  const pitch = camera.pitch; // radians, negative = looking down
  const roll = camera.roll; // radians

  // Convert to quaternion (keeping Cesium's convention for now)
  // In GeoPose ENU frame, we interpret heading as rotation around Z (up)
  const quaternion = hprToQuaternion(heading, pitch, roll);

  return { position, quaternion };
}

/**
 * Set the camera pose from GeoPose
 *
 * @param camera - Cesium Camera instance
 * @param geoPose - GeoPose with position and orientation in ENU frame
 */
export function setCameraGeoPose(camera: Camera, geoPose: GeoPoseBQ): void {
  // Convert position to Cartesian3
  const destination = Cartesian3.fromDegrees(
    geoPose.position.lon,
    geoPose.position.lat,
    geoPose.position.h
  );

  // Convert quaternion to heading/pitch/roll
  const hpr = quaternionToHpr(geoPose.quaternion);

  // Set camera with flyTo for smooth transition, or setView for immediate
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
 *
 * @param camera - Cesium Camera instance
 * @param geoPose - Target GeoPose
 * @param duration - Flight duration in seconds (default 2)
 */
export function flyCameraToGeoPose(
  camera: Camera,
  geoPose: GeoPoseBQ,
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
 *
 * @param entity - Cesium Entity with position and orientation
 * @param time - JulianDate for time-dynamic entities (optional, uses current time)
 * @returns GeoPose with the entity's position and orientation in ENU frame
 */
export function getEntityGeoPose(
  entity: Entity,
  time?: any // JulianDate
): GeoPoseBQ | null {
  if (!entity.position) {
    return null;
  }

  // Get position at the specified time
  const positionEcef = entity.position.getValue(time);
  if (!positionEcef) {
    return null;
  }

  // Convert to cartographic
  const cartographic = Cartographic.fromCartesian(positionEcef);
  const position = {
    lat: CesiumMath.toDegrees(cartographic.latitude),
    lon: CesiumMath.toDegrees(cartographic.longitude),
    h: cartographic.height,
  };

  // Get orientation (ECEF quaternion)
  let quaternion = { x: 0, y: 0, z: 0, w: 1 }; // Identity = facing East in ENU

  if (entity.orientation) {
    const orientationEcef = entity.orientation.getValue(time);
    if (orientationEcef) {
      // Convert ECEF quaternion to ENU quaternion
      // q_enu = q_ecef_to_enu * q_ecef
      // where q_ecef_to_enu is the inverse of the ENU-to-ECEF rotation

      const { quaternion: enuToEcefQuat } = getEnuToEcefMatrix(
        position.lon,
        position.lat
      );

      // Inverse of enuToEcef rotation
      const ecefToEnuQuat = Quaternion.conjugate(
        enuToEcefQuat,
        new Quaternion()
      );

      // q_enu = q_ecef_to_enu * q_ecef
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
 *
 * @param entity - Cesium Entity to update
 * @param geoPose - GeoPose with position and orientation in ENU frame
 */
export function setEntityGeoPose(entity: Entity, geoPose: GeoPoseBQ): void {
  // Set position
  const positionEcef = Cartesian3.fromDegrees(
    geoPose.position.lon,
    geoPose.position.lat,
    geoPose.position.h
  );

  entity.position = positionEcef as any; // ConstantPositionProperty

  // Convert ENU quaternion to ECEF quaternion
  // q_ecef = q_enu_to_ecef * q_enu
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

  entity.orientation = ecefQuat as any; // ConstantProperty
}

/**
 * Create a new entity at a GeoPose
 *
 * @param geoPose - GeoPose for the entity's position and orientation
 * @returns Object with position and orientation suitable for Entity constructor
 */
export function createEntityFromGeoPose(geoPose: GeoPoseBQ): {
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
  // Camera operations
  getCameraGeoPose,
  setCameraGeoPose,
  flyCameraToGeoPose,

  // Entity operations
  getEntityGeoPose,
  setEntityGeoPose,
  createEntityFromGeoPose,

  // Utilities
  normalizeQuaternion,
  hprToQuaternion,
  quaternionToHpr,
};

export default GeoPoseConverter;
