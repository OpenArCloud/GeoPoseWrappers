import { GeoPoseBQ, ENU, Quaternion } from '../types.js';
import { geoPoseToLocalENU, localENUToGeoPose } from './local.js';

/**
 * Calculate the relative pose between two GeoPoses (from -> to).
 * Returns the translation and rotation required to get from 'from' to 'to'
 * in the local frame of 'from'.
 */
export function getRelativePose(from: GeoPoseBQ, to: GeoPoseBQ): { translation: ENU; rotation: Quaternion } {
    // This is effectively describing 'to' in the local frame of 'from'.
    return geoPoseToLocalENU(to, from.position);
}

/**
 * Apply a relative transformation to a base GeoPose.
 */
export function applyRelativePose(base: GeoPoseBQ, relative: { translation: ENU; rotation: Quaternion }): GeoPoseBQ {
    // This is effectively converting a local coordinate back to global.
    return localENUToGeoPose(relative.translation, relative.rotation, base.position);
}

/**
 * Spherical linear interpolation between two poses.
 * t: 0.0 to 1.0
 */
export function interpolatePose(from: GeoPoseBQ, to: GeoPoseBQ, t: number): GeoPoseBQ {
    // 1. Interpolate Position
    // Simple linear interpolation of ECEF is usually safest to avoid "going through the earth" for large distances,
    // although for surface movement, Great Circle is better.
    // For general short-range (AR/Digital Twin), Linear ECEF is standard.
    // However, if we interpolate Lat/Lon directly it fails at dateline.
    // Let's use ECEF LERP + Slerp.

    // We don't have direct ECEF access here easily without importing conversions.
    // Let's rely on Lat/Lon lerp for now (simple) but handle date line?
    // Actually, properly: convert to ECEF, lerp, convert back.
    // Implementation requires `geoPoseToECEF`, `ecefToGeoPose` which are in conversions.
    // To avoid circular dependency, advanced should import conversions.

    // BUT conversions imports nothing. local imports conversions. advanced imports local.
    // It's safe to import conversions here.
    const fromEcef = import_conversions.geoPoseToECEF(from);
    const toEcef = import_conversions.geoPoseToECEF(to);

    const x = lerp(fromEcef.position.x, toEcef.position.x, t);
    const y = lerp(fromEcef.position.y, toEcef.position.y, t);
    const z = lerp(fromEcef.position.z, toEcef.position.z, t);

    // Orientation Slerp
    const q = slerp(fromEcef.orientation, toEcef.orientation, t);

    return import_conversions.ecefToGeoPose({ x, y, z }, q);
}

// Workaround for import to avoid circular dependency issues at runtime if any?
// ES modules handle cyclic deps well usually, but let's be explicit.
import * as import_conversions from './conversions.js';

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

function slerp(qa: Quaternion, qb: Quaternion, t: number): Quaternion {
    // standard slerp
    let x = qa.x, y = qa.y, z = qa.z, w = qa.w;
    let bx = qb.x, by = qb.y, bz = qb.z, bw = qb.w;

    let cosHalfTheta = w * bw + x * bx + y * by + z * bz;

    if (cosHalfTheta < 0) {
        w = -w; x = -x; y = -y; z = -z;
        cosHalfTheta = -cosHalfTheta;
    }

    if (Math.abs(cosHalfTheta) >= 1.0) {
        return qa;
    }

    const halfTheta = Math.acos(cosHalfTheta);
    const sinHalfTheta = Math.sqrt(1.0 - cosHalfTheta * cosHalfTheta);

    if (Math.abs(sinHalfTheta) < 0.001) {
        return {
            x: (x * 0.5 + bx * 0.5),
            y: (y * 0.5 + by * 0.5),
            z: (z * 0.5 + bz * 0.5),
            w: (w * 0.5 + bw * 0.5)
        };
    }

    const ratioA = Math.sin((1 - t) * halfTheta) / sinHalfTheta;
    const ratioB = Math.sin(t * halfTheta) / sinHalfTheta;

    return {
        w: (w * ratioA + bw * ratioB),
        x: (x * ratioA + bx * ratioB),
        y: (y * ratioA + by * ratioB),
        z: (z * ratioA + bz * ratioB)
    };
}
