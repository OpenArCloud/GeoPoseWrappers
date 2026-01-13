/**
 * GeoPose JSON Serialization/Deserialization
 *
 * Provides OGC-compliant JSON serialization and deserialization for GeoPose
 * Basic-Quaternion and Basic-YPR formats.
 *
 * OGC GeoPose 1.0 Standard: https://docs.ogc.org/is/21-056r11/21-056r11.html
 * JSON Schemas: https://schemas.opengis.net/geopose/1.0/schemata/
 */

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * OGC GeoPose (Basic Quaternion) representation
 */
export interface GeoPose {
  position: {
    lat: number; // Latitude in degrees (WGS84), -90 to 90
    lon: number; // Longitude in degrees (WGS84), -180 to 180
    h: number; // Height in meters above WGS84 ellipsoid
  };
  quaternion: {
    x: number;
    y: number;
    z: number;
    w: number;
  };
}

/**
 * OGC GeoPose Basic YPR (Yaw-Pitch-Roll) representation
 */
export interface GeoPoseBYPR {
  position: {
    lat: number; // Latitude in degrees (WGS84), -90 to 90
    lon: number; // Longitude in degrees (WGS84), -180 to 180
    h: number; // Height in meters above WGS84 ellipsoid
  };
  angles: {
    yaw: number; // Rotation around Z (up), degrees
    pitch: number; // Rotation around Y (north), degrees
    roll: number; // Rotation around X (east), degrees
  };
}

/**
 * Validation result with detailed error information
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// ============================================================================
// Serialization Functions
// ============================================================================

/**
 * Serialize GeoPose (Basic Quaternion) to OGC-compliant JSON string
 * @param geoPose - GeoPose object to serialize
 * @param prettyPrint - If true, format with indentation (default: false)
 * @returns JSON string
 */
export function serializeGeoPose(
  geoPose: GeoPose,
  prettyPrint: boolean = false
): string {
  return prettyPrint ? JSON.stringify(geoPose, null, 2) : JSON.stringify(geoPose);
}

/**
 * Serialize GeoPose Basic-YPR to OGC-compliant JSON string
 * @param geoPose - GeoPoseYPR object to serialize
 * @param prettyPrint - If true, format with indentation (default: false)
 * @returns JSON string
 */
export function serializeGeoPoseYPR(
  geoPose: GeoPoseBYPR,
  prettyPrint: boolean = false
): string {
  return prettyPrint ? JSON.stringify(geoPose, null, 2) : JSON.stringify(geoPose);
}

/**
 * Serialize array of GeoPoses to JSON string
 * @param poses - Array of GeoPose objects
 * @param prettyPrint - If true, format with indentation (default: false)
 * @returns JSON array string
 */
export function serializeGeoPoseArray(
  poses: GeoPose[],
  prettyPrint: boolean = false
): string {
  return prettyPrint ? JSON.stringify(poses, null, 2) : JSON.stringify(poses);
}

// ============================================================================
// Deserialization Functions
// ============================================================================

/**
 * Deserialize GeoPose (Basic Quaternion) from JSON string
 * @param json - OGC-compliant GeoPose JSON string
 * @returns GeoPose or null if parsing fails
 */
export function deserializeGeoPose(json: string): GeoPose | null {
  try {
    const parsed = JSON.parse(json);
    if (!isGeoPoseStructure(parsed)) {
      return null;
    }
    return parsed as GeoPose;
  } catch {
    return null;
  }
}

/**
 * Deserialize GeoPose Basic-YPR from JSON string
 * @param json - OGC-compliant GeoPose YPR JSON string
 * @returns GeoPoseBYPR or null if parsing fails
 */
export function deserializeGeoPoseYPR(json: string): GeoPoseBYPR | null {
  try {
    const parsed = JSON.parse(json);
    if (!isGeoPoseBYPRStructure(parsed)) {
      return null;
    }
    return parsed as GeoPoseBYPR;
  } catch {
    return null;
  }
}

/**
 * Deserialize array of GeoPoses from JSON string
 * @param json - JSON array string
 * @returns Array of GeoPose (empty if parsing fails)
 */
export function deserializeGeoPoseArray(json: string): GeoPose[] {
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(isGeoPoseStructure) as GeoPose[];
  } catch {
    return [];
  }
}

// ============================================================================
// Conversion Functions (Basic Quaternion <-> Basic YPR)
// ============================================================================

/**
 * Convert GeoPose (Basic Quaternion) to Basic-YPR
 * @param geoPose - GeoPose with quaternion orientation
 * @returns GeoPose with yaw/pitch/roll angles in degrees
 */
export function quaternionToYPR(geoPose: GeoPose): GeoPoseBYPR {
  const { x, y, z, w } = geoPose.quaternion;

  // Roll (x-axis rotation)
  const sinr_cosp = 2 * (w * x + y * z);
  const cosr_cosp = 1 - 2 * (x * x + y * y);
  const roll = Math.atan2(sinr_cosp, cosr_cosp);

  // Pitch (y-axis rotation)
  const sinp = 2 * (w * y - z * x);
  let pitch: number;
  if (Math.abs(sinp) >= 1) {
    pitch = Math.sign(sinp) * (Math.PI / 2); // Clamp to ±90°
  } else {
    pitch = Math.asin(sinp);
  }

  // Yaw (z-axis rotation)
  const siny_cosp = 2 * (w * z + x * y);
  const cosy_cosp = 1 - 2 * (y * y + z * z);
  const yaw = Math.atan2(siny_cosp, cosy_cosp);

  // Convert radians to degrees
  return {
    position: { ...geoPose.position },
    angles: {
      yaw: (yaw * 180) / Math.PI,
      pitch: (pitch * 180) / Math.PI,
      roll: (roll * 180) / Math.PI,
    },
  };
}

/**
 * Convert GeoPose Basic-YPR to Basic-Quaternion
 * @param geoPose - GeoPose with yaw/pitch/roll angles in degrees
 * @returns GeoPose with quaternion orientation
 */
export function yprToQuaternion(geoPose: GeoPoseBYPR): GeoPose {
  // Convert degrees to radians
  const yawRad = (geoPose.angles.yaw * Math.PI) / 180;
  const pitchRad = (geoPose.angles.pitch * Math.PI) / 180;
  const rollRad = (geoPose.angles.roll * Math.PI) / 180;

  // Half angles
  const cy = Math.cos(yawRad / 2);
  const sy = Math.sin(yawRad / 2);
  const cp = Math.cos(pitchRad / 2);
  const sp = Math.sin(pitchRad / 2);
  const cr = Math.cos(rollRad / 2);
  const sr = Math.sin(rollRad / 2);

  // ZYX rotation order quaternion
  const quaternion = {
    x: sr * cp * cy - cr * sp * sy,
    y: cr * sp * cy + sr * cp * sy,
    z: cr * cp * sy - sr * sp * cy,
    w: cr * cp * cy + sr * sp * sy,
  };

  // Normalize
  const mag = Math.sqrt(
    quaternion.x ** 2 + quaternion.y ** 2 + quaternion.z ** 2 + quaternion.w ** 2
  );

  return {
    position: { ...geoPose.position },
    quaternion:
      mag > 0
        ? {
            x: quaternion.x / mag,
            y: quaternion.y / mag,
            z: quaternion.z / mag,
            w: quaternion.w / mag,
          }
        : { x: 0, y: 0, z: 0, w: 1 },
  };
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Check if a JSON string is valid GeoPose (Basic Quaternion) format
 * @param json - JSON string to validate
 * @returns true if valid GeoPose (Basic Quaternion) JSON
 */
export function isValidGeoPoseJSON(json: string): boolean {
  try {
    const parsed = JSON.parse(json);
    return isGeoPoseStructure(parsed);
  } catch {
    return false;
  }
}

/**
 * Check if a JSON string is valid GeoPose YPR format
 * @param json - JSON string to validate
 * @returns true if valid GeoPose YPR JSON
 */
export function isValidGeoPoseYPRJSON(json: string): boolean {
  try {
    const parsed = JSON.parse(json);
    return isGeoPoseBYPRStructure(parsed);
  } catch {
    return false;
  }
}

/**
 * Validate a GeoPose object with detailed error messages
 * @param geoPose - GeoPose object to validate
 * @returns ValidationResult with valid flag and error messages
 */
export function validateGeoPose(geoPose: GeoPose): ValidationResult {
  const errors: string[] = [];

  // Check position exists
  if (!geoPose.position) {
    errors.push("Missing 'position' object");
  } else {
    // Check latitude
    if (typeof geoPose.position.lat !== "number") {
      errors.push("position.lat must be a number");
    } else if (geoPose.position.lat < -90 || geoPose.position.lat > 90) {
      errors.push("position.lat must be between -90 and 90 degrees");
    } else if (!isFinite(geoPose.position.lat)) {
      errors.push("position.lat must be a finite number");
    }

    // Check longitude
    if (typeof geoPose.position.lon !== "number") {
      errors.push("position.lon must be a number");
    } else if (geoPose.position.lon < -180 || geoPose.position.lon > 180) {
      errors.push("position.lon must be between -180 and 180 degrees");
    } else if (!isFinite(geoPose.position.lon)) {
      errors.push("position.lon must be a finite number");
    }

    // Check height
    if (typeof geoPose.position.h !== "number") {
      errors.push("position.h must be a number");
    } else if (!isFinite(geoPose.position.h)) {
      errors.push("position.h must be a finite number");
    }
  }

  // Check quaternion exists
  if (!geoPose.quaternion) {
    errors.push("Missing 'quaternion' object");
  } else {
    const { x, y, z, w } = geoPose.quaternion;

    // Check all components are numbers
    if (typeof x !== "number") errors.push("quaternion.x must be a number");
    if (typeof y !== "number") errors.push("quaternion.y must be a number");
    if (typeof z !== "number") errors.push("quaternion.z must be a number");
    if (typeof w !== "number") errors.push("quaternion.w must be a number");

    // Check for finite values
    if (!isFinite(x)) errors.push("quaternion.x must be a finite number");
    if (!isFinite(y)) errors.push("quaternion.y must be a finite number");
    if (!isFinite(z)) errors.push("quaternion.z must be a finite number");
    if (!isFinite(w)) errors.push("quaternion.w must be a finite number");

    // Check quaternion is normalized (magnitude ≈ 1)
    if (
      typeof x === "number" &&
      typeof y === "number" &&
      typeof z === "number" &&
      typeof w === "number"
    ) {
      const mag = Math.sqrt(x * x + y * y + z * z + w * w);
      if (Math.abs(mag - 1) > 0.001) {
        errors.push(
          `Quaternion is not normalized (magnitude: ${mag.toFixed(6)}, expected: 1.0)`
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate a GeoPose YPR object with detailed error messages
 * @param geoPose - GeoPoseYPR object to validate
 * @returns ValidationResult with valid flag and error messages
 */
export function validateGeoPoseYPR(geoPose: GeoPoseBYPR): ValidationResult {
  const errors: string[] = [];

  // Check position exists
  if (!geoPose.position) {
    errors.push("Missing 'position' object");
  } else {
    // Check latitude
    if (typeof geoPose.position.lat !== "number") {
      errors.push("position.lat must be a number");
    } else if (geoPose.position.lat < -90 || geoPose.position.lat > 90) {
      errors.push("position.lat must be between -90 and 90 degrees");
    } else if (!isFinite(geoPose.position.lat)) {
      errors.push("position.lat must be a finite number");
    }

    // Check longitude
    if (typeof geoPose.position.lon !== "number") {
      errors.push("position.lon must be a number");
    } else if (geoPose.position.lon < -180 || geoPose.position.lon > 180) {
      errors.push("position.lon must be between -180 and 180 degrees");
    } else if (!isFinite(geoPose.position.lon)) {
      errors.push("position.lon must be a finite number");
    }

    // Check height
    if (typeof geoPose.position.h !== "number") {
      errors.push("position.h must be a number");
    } else if (!isFinite(geoPose.position.h)) {
      errors.push("position.h must be a finite number");
    }
  }

  // Check angles exists
  if (!geoPose.angles) {
    errors.push("Missing 'angles' object");
  } else {
    const { yaw, pitch, roll } = geoPose.angles;

    // Check all components are numbers
    if (typeof yaw !== "number") errors.push("angles.yaw must be a number");
    if (typeof pitch !== "number") errors.push("angles.pitch must be a number");
    if (typeof roll !== "number") errors.push("angles.roll must be a number");

    // Check for finite values
    if (!isFinite(yaw)) errors.push("angles.yaw must be a finite number");
    if (!isFinite(pitch)) errors.push("angles.pitch must be a finite number");
    if (!isFinite(roll)) errors.push("angles.roll must be a finite number");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Normalize a GeoPose quaternion to unit length
 * @param geoPose - GeoPose with potentially non-normalized quaternion
 * @returns GeoPose with normalized quaternion
 */
export function normalizeGeoPose(geoPose: GeoPose): GeoPose {
  const { x, y, z, w } = geoPose.quaternion;
  const mag = Math.sqrt(x * x + y * y + z * z + w * w);

  if (mag === 0) {
    return {
      position: { ...geoPose.position },
      quaternion: { x: 0, y: 0, z: 0, w: 1 },
    };
  }

  return {
    position: { ...geoPose.position },
    quaternion: {
      x: x / mag,
      y: y / mag,
      z: z / mag,
      w: w / mag,
    },
  };
}

// ============================================================================
// Internal Helper Functions
// ============================================================================

/**
 * Check if an object has the structure of GeoPose (Basic Quaternion)
 */
function isGeoPoseStructure(obj: unknown): boolean {
  if (typeof obj !== "object" || obj === null) return false;
  const o = obj as Record<string, unknown>;

  // Check position
  if (typeof o.position !== "object" || o.position === null) return false;
  const pos = o.position as Record<string, unknown>;
  if (
    typeof pos.lat !== "number" ||
    typeof pos.lon !== "number" ||
    typeof pos.h !== "number"
  ) {
    return false;
  }

  // Check quaternion
  if (typeof o.quaternion !== "object" || o.quaternion === null) return false;
  const quat = o.quaternion as Record<string, unknown>;
  if (
    typeof quat.x !== "number" ||
    typeof quat.y !== "number" ||
    typeof quat.z !== "number" ||
    typeof quat.w !== "number"
  ) {
    return false;
  }

  return true;
}

/**
 * Check if an object has the structure of GeoPoseBYPR
 */
function isGeoPoseBYPRStructure(obj: unknown): boolean {
  if (typeof obj !== "object" || obj === null) return false;
  const o = obj as Record<string, unknown>;

  // Check position
  if (typeof o.position !== "object" || o.position === null) return false;
  const pos = o.position as Record<string, unknown>;
  if (
    typeof pos.lat !== "number" ||
    typeof pos.lon !== "number" ||
    typeof pos.h !== "number"
  ) {
    return false;
  }

  // Check angles
  if (typeof o.angles !== "object" || o.angles === null) return false;
  const angles = o.angles as Record<string, unknown>;
  if (
    typeof angles.yaw !== "number" ||
    typeof angles.pitch !== "number" ||
    typeof angles.roll !== "number"
  ) {
    return false;
  }

  return true;
}

// ============================================================================
// Convenience Exports
// ============================================================================

export const GeoPoseSerialization = {
  // Serialization
  serializeGeoPose,
  serializeGeoPoseYPR,
  serializeGeoPoseArray,

  // Deserialization
  deserializeGeoPose,
  deserializeGeoPoseYPR,
  deserializeGeoPoseArray,

  // Conversion
  quaternionToYPR,
  yprToQuaternion,

  // Validation
  isValidGeoPoseJSON,
  isValidGeoPoseYPRJSON,
  validateGeoPose,
  validateGeoPoseYPR,
  normalizeGeoPose,
};

export default GeoPoseSerialization;
