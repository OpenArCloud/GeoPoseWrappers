import { GeoPoseBQ, ENU, LLH, Quaternion, WGS84 } from '../types.js';
import { geoPoseToECEF, ecefToGeoPose } from './conversions.js';

/**
 * Express a GeoPose relative to a local ENU tangent plane at a given origin.
 */
export function geoPoseToLocalENU(geoPose: GeoPoseBQ, origin: LLH): { position: ENU; orientation: Quaternion } {
    // 1. Convert Target and Origin to ECEF
    const targetEcef = geoPoseToECEF(geoPose);
    const originPose: GeoPoseBQ = {
        position: origin,
        quaternion: { x: 0, y: 0, z: 0, w: 1 } // orientation doesn't matter for the point conversion
    };
    const originEcef = geoPoseToECEF(originPose);

    // 2. Vector from Origin to Target in ECEF
    const dx = targetEcef.position.x - originEcef.position.x;
    const dy = targetEcef.position.y - originEcef.position.y;
    const dz = targetEcef.position.z - originEcef.position.z;

    // 3. Rotate vector into ENU frame of the Origin
    const latRad = origin.lat * Math.PI / 180;
    const lonRad = origin.lon * Math.PI / 180;

    const cl = Math.cos(latRad);
    const sl = Math.sin(latRad);
    const cL = Math.cos(lonRad);
    const sL = Math.sin(lonRad);

    // ENU Rotation Matrix rows (ECEF -> ENU)
    // East:  [-sinLon,              cosLon,             0      ]
    // North: [-sinLat*cosLon,      -sinLat*sinLon,      cosLat ]
    // Up:    [ cosLat*cosLon,       cosLat*sinLon,      sinLat ]

    const east = -sL * dx + cL * dy;
    const north = -sl * cL * dx - sl * sL * dy + cl * dz;
    const up = cl * cL * dx + cl * sL * dy + sl * dz;

    // 4. Orientation: transform target's orientation into local frame?
    // The target orientation is "relative to ECEF" (from geoPoseToECEF).
    // We want it relative to the Local ENU frame.
    // q_local = q_enu_earth_inv * q_target_earth
    // Actually simplicity: usage usually implies we want the orientation relative to the axes.
    // If geoPose.quaternion is already ENU-based (Local Tangent Plane at Target), 
    // And we want (Local Tangent Plane at Origin),
    // We need to account for the curvature (difference in Up vectors).
    // For now, let's strictly follow the transform chain: 
    // Target Local -> ECEF -> Origin Local

    // We have targetEcef.orientation (Target Local -> ECEF)
    // We need Target Local -> Origin Local
    // q_out = (Origin Local -> ECEF)^-1 * (Target Local -> ECEF)

    // Origin Local -> ECEF quaternion
    const originEnuToEcef = getEnuToEcefRotation(latRad, lonRad);
    const ecefToOriginEnu = conjugateQuaternion(originEnuToEcef);

    const relativeOrientation = multiplyQuaternions(ecefToOriginEnu, targetEcef.orientation);

    return {
        position: { east, north, up },
        orientation: relativeOrientation
    };
}

/**
 * Convert local ENU coordinates back to global GeoPose.
 */
export function localENUToGeoPose(enu: ENU, orientation: Quaternion, origin: LLH): GeoPoseBQ {
    // 1. Convert Origin to ECEF
    const originPose: GeoPoseBQ = {
        position: origin,
        quaternion: { x: 0, y: 0, z: 0, w: 1 }
    };
    const originEcef = geoPoseToECEF(originPose);

    // 2. Rotate ENU vector into ECEF
    const latRad = origin.lat * Math.PI / 180;
    const lonRad = origin.lon * Math.PI / 180;

    const cl = Math.cos(latRad);
    const sl = Math.sin(latRad);
    const cL = Math.cos(lonRad);
    const sL = Math.sin(lonRad);

    // ECEF = ECEF_origin + R_enu_to_ecef * vec_enu
    // col 0 (East):  [-sL, cL, 0]
    // col 1 (North): [-sl*cL, -sl*sL, cl]
    // col 2 (Up):    [ cl*cL,  cl*sL, sl]

    const dx = -sL * enu.east - sl * cL * enu.north + cl * cL * enu.up;
    const dy = cL * enu.east - sl * sL * enu.north + cl * sL * enu.up;
    const dz = cl * enu.north + sl * enu.up;

    const targetX = originEcef.position.x + dx;
    const targetY = originEcef.position.y + dy;
    const targetZ = originEcef.position.z + dz;

    // 3. Orientation
    // We have (Target Local -> Origin Local)
    // We want (Target Local -> Target Tangent Plane?) 
    // Use ecefToGeoPose to handle ECEF -> Target Local Tangent

    // First get Target Local -> ECEF
    // q_target_ecef = q_origin_enu_to_ecef * q_target_local_to_origin_local
    const originEnuToEcef = getEnuToEcefRotation(latRad, lonRad);
    const targetToEcef = multiplyQuaternions(originEnuToEcef, orientation);

    return ecefToGeoPose(
        { x: targetX, y: targetY, z: targetZ },
        targetToEcef
    );
}

/**
 * Move a GeoPose by an ENU offset.
 */
export function translateGeoPose(geoPose: GeoPoseBQ, translation: ENU): GeoPoseBQ {
    // 1. Convert to Local ENU at its OWN position (Origin = self)
    // 2. Apply translation
    // 3. Convert back
    // Since origin is self, initial position is (0,0,0) and orientation is (0,0,0,1) relative to self? 
    // No, orientation is preserved.
    return localENUToGeoPose(translation, geoPose.quaternion, geoPose.position);
}

// --- Helpers duplicate from conversions (to avoid circular deps if I used them, but I can copy for speed) ---
// Actually, I should export them or make a common utils. 
// For now, I'll re-implement the matrix helpers locally or move them to a utils file.
// Ideally, `conversions.ts` should export them. I'll duplicate strictly for speed and isolation now.

function getEnuToEcefRotation(lat: number, lon: number): Quaternion {
    const cl = Math.cos(lat);
    const sl = Math.sin(lat);
    const cL = Math.cos(lon);
    const sL = Math.sin(lon);

    const m00 = -sL, m01 = -sl * cL, m02 = cl * cL;
    const m10 = cL, m11 = -sl * sL, m12 = cl * sL;
    const m20 = 0, m21 = cl, m22 = sl;

    return matrixToQuaternion(m00, m01, m02, m10, m11, m12, m20, m21, m22);
}

function matrixToQuaternion(
    m00: number, m01: number, m02: number,
    m10: number, m11: number, m12: number,
    m20: number, m21: number, m22: number
): Quaternion {
    const trace = m00 + m11 + m22;
    let s;
    let w, x, y, z;

    if (trace > 0) {
        s = 0.5 / Math.sqrt(trace + 1.0);
        w = 0.25 / s;
        x = (m21 - m12) * s;
        y = (m02 - m20) * s;
        z = (m10 - m01) * s;
    } else {
        if (m00 > m11 && m00 > m22) {
            s = 2.0 * Math.sqrt(1.0 + m00 - m11 - m22);
            w = (m21 - m12) / s;
            x = 0.25 * s;
            y = (m01 + m10) / s;
            z = (m02 + m20) / s;
        } else if (m11 > m22) {
            s = 2.0 * Math.sqrt(1.0 + m11 - m00 - m22);
            w = (m02 - m20) / s;
            x = (m01 + m10) / s;
            y = 0.25 * s;
            z = (m12 + m21) / s;
        } else {
            s = 2.0 * Math.sqrt(1.0 + m22 - m00 - m11);
            w = (m10 - m01) / s;
            x = (m02 + m20) / s;
            y = (m12 + m21) / s;
            z = 0.25 * s;
        }
    }
    return { x, y, z, w };
}

function multiplyQuaternions(a: Quaternion, b: Quaternion): Quaternion {
    return {
        x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
        y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
        z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
        w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z
    };
}

function conjugateQuaternion(q: Quaternion): Quaternion {
    return { x: -q.x, y: -q.y, z: -q.z, w: q.w };
}
