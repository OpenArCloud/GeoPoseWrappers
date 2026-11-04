import { GeoPose, GeoPoseBYPR, ECEF, Quaternion, WGS84 } from '../types.js';

/** Degrees-to-radians conversion factor. */
const DEG_TO_RAD = Math.PI / 180;
/** Radians-to-degrees conversion factor. */
const RAD_TO_DEG = 180 / Math.PI;

/**
 * Convert degrees to radians.
 */
function degToRad(deg: number): number {
    return deg * DEG_TO_RAD;
}

/**
 * Convert radians to degrees.
 */
function radToDeg(rad: number): number {
    return rad * RAD_TO_DEG;
}

/**
 * Convert Basic Quaternion to Basic YPR.
 * Uses intrinsic Z-Y-X rotations (Yaw -> Pitch -> Roll).
 */
export function quaternionToYPR(geoPose: GeoPose): GeoPoseBYPR {
    const input = geoPose.quaternion;
    const length = Math.hypot(input.x, input.y, input.z, input.w);
    if (!Number.isFinite(length) || length === 0) {
        throw new RangeError('Orientation must be a finite, nonzero quaternion');
    }
    const q = { x: input.x / length, y: input.y / length, z: input.z / length, w: input.w / length };
    const sinp = Math.max(-1, Math.min(1, 2 * (q.w * q.y - q.z * q.x)));
    // At gimbal lock choose roll = 0 and absorb the coupled rotation into yaw.
    // 1e-12 is a tolerance on sin(pitch), not on the angle in degrees.
    const locked = 1 - Math.abs(sinp) <= 1e-12;
    const pitch = locked ? Math.sign(sinp) * Math.PI / 2 : Math.asin(sinp);
    const roll = locked ? 0 : Math.atan2(2 * (q.w * q.x + q.y * q.z), 1 - 2 * (q.x * q.x + q.y * q.y));
    const rawYaw = locked ? 2 * Math.atan2(q.z, q.w)
        : Math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.y * q.y + q.z * q.z));
    const yaw = Math.atan2(Math.sin(rawYaw), Math.cos(rawYaw));
    return {
        position: { ...geoPose.position },
        angles: { yaw: yaw * 180 / Math.PI, pitch: pitch * 180 / Math.PI, roll: roll * 180 / Math.PI }
    };
}

/**
 * Convert Basic YPR to Basic Quaternion.
 * Uses intrinsic Z-Y-X rotations (Yaw -> Pitch -> Roll).
 */
export function yprToQuaternion(geoPose: GeoPoseBYPR): GeoPose {
    const yaw = degToRad(geoPose.angles.yaw);
    const pitch = degToRad(geoPose.angles.pitch);
    const roll = degToRad(geoPose.angles.roll);

    const cy = Math.cos(yaw * 0.5);
    const sy = Math.sin(yaw * 0.5);
    const cp = Math.cos(pitch * 0.5);
    const sp = Math.sin(pitch * 0.5);
    const cr = Math.cos(roll * 0.5);
    const sr = Math.sin(roll * 0.5);

    const w = cr * cp * cy + sr * sp * sy;
    const x = sr * cp * cy - cr * sp * sy;
    const y = cr * sp * cy + sr * cp * sy;
    const z = cr * cp * sy - sr * sp * cy;

    return {
        position: { ...geoPose.position },
        quaternion: { x, y, z, w }
    };
}

/**
 * Convert geodetic WGS84 (lat/lon/height) to ECEF (meters).
 * Orientation is rotated from local ENU into the ECEF frame.
 */
export function geoPoseToECEF(geoPose: GeoPose): { position: ECEF; orientation: Quaternion } {
    const lat = degToRad(geoPose.position.lat);
    const lon = degToRad(geoPose.position.lon);
    const h = geoPose.position.h;

    const sinLat = Math.sin(lat);
    const cosLat = Math.cos(lat);
    const sinLon = Math.sin(lon);
    const cosLon = Math.cos(lon);

    const N = WGS84.a / Math.sqrt(1 - WGS84.e2 * sinLat * sinLat);

    const x = (N + h) * cosLat * cosLon;
    const y = (N + h) * cosLat * sinLon;
    const z = (N * (1 - WGS84.e2) + h) * sinLat;

    // q_ECEF_object = q_ECEF_ENU * q_ENU_object.
    const qLocal = geoPose.quaternion;
    const qEnuToEcef = getEnuToEcefRotation(lat, lon);
    const qGlobal = multiplyQuaternions(qEnuToEcef, qLocal);

    return {
        position: { x, y, z },
        orientation: qGlobal
    };
}

/**
 * Convert ECEF (meters) to geodetic WGS84 (lat/lon/height).
 * Uses an iterative solver for improved accuracy and rotates orientation back
 * into the local ENU frame.
 */
export function ecefToGeoPose(ecef: ECEF, orientation: Quaternion): GeoPose {
    const x = ecef.x;
    const y = ecef.y;
    const z = ecef.z;

    const lam = Math.atan2(y, x);
    const p = Math.sqrt(x * x + y * y);

    // Initial guess
    let phi = Math.atan2(z, p * (1 - WGS84.e2));
    let h = 0;

    // Iteration (usually converges in 3-4 steps)
    let N = 0;
    for (let i = 0; i < 5; i++) {
        const sinPhi = Math.sin(phi);
        N = WGS84.a / Math.sqrt(1 - WGS84.e2 * sinPhi * sinPhi);
        h = p / Math.cos(phi) - N;
        phi = Math.atan2(z, p * (1 - WGS84.e2 * (N / (N + h))));
    }

    const lat = radToDeg(phi);
    const lon = radToDeg(lam);

    // Convert ECEF orientation back to Local ENU orientation
    const qEcefToEnu = getEcefToEnuRotation(phi, lam); // pass radians
    const qLocal = multiplyQuaternions(qEcefToEnu, orientation);

    return {
        position: { lat, lon, h },
        quaternion: qLocal
    };
}

// --- Helpers ---

/**
 * Return the rotation from ENU to ECEF at a given lat/lon (radians).
 */
function getEnuToEcefRotation(lat: number, lon: number): Quaternion {
    // ENU to ECEF rotation matrix columns:
    // East:  [-sin(lon),           cos(lon),            0      ]
    // North: [-sin(lat)cos(lon),  -sin(lat)sin(lon),    cos(lat)]
    // Up:    [ cos(lat)cos(lon),   cos(lat)sin(lon),    sin(lat)]

    const cl = Math.cos(lat);
    const sl = Math.sin(lat);
    const cL = Math.cos(lon);
    const sL = Math.sin(lon);

    // Matrix M_enu_to_ecef
    const m00 = -sL, m01 = -sl * cL, m02 = cl * cL;
    const m10 = cL, m11 = -sl * sL, m12 = cl * sL;
    const m20 = 0, m21 = cl, m22 = sl;

    return matrixToQuaternion(m00, m01, m02, m10, m11, m12, m20, m21, m22);
}

/**
 * Return the rotation from ECEF to ENU at a given lat/lon (radians).
 */
function getEcefToEnuRotation(lat: number, lon: number): Quaternion {
    // Inverse of EnuToEcef (transpose)
    const cl = Math.cos(lat);
    const sl = Math.sin(lat);
    const cL = Math.cos(lon);
    const sL = Math.sin(lon);

    // Transpose
    const m00 = -sL, m01 = cL, m02 = 0;
    const m10 = -sl * cL, m11 = -sl * sL, m12 = cl;
    const m20 = cl * cL, m21 = cl * sL, m22 = sl;

    return matrixToQuaternion(m00, m01, m02, m10, m11, m12, m20, m21, m22);
}

/**
 * Convert a 3x3 rotation matrix to a quaternion.
 */
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

/**
 * Multiply two quaternions (a * b).
 */
export function multiplyQuaternions(a: Quaternion, b: Quaternion): Quaternion {
    return {
        x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
        y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
        z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
        w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z
    };
}
