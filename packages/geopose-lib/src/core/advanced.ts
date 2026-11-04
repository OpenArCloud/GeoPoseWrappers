import { GeoPose, ENU, Quaternion } from '../types.js';
import { geoPoseToLocalENU, localENUToGeoPose } from './local.js';
import { multiplyQuaternions } from './conversions.js';

/**
 * Compute the relative pose between two GeoPoses (from -> to).
 * Translation stays in the ENU tangent frame at `from.position` (meters).
 * Rotation maps target body axes into the base body frame: inverse(q_from) * q_to.
 * For an absolute orientation at an ENU origin, use geoPoseToLocalENU instead.
 */
export function getRelativePose(from: GeoPose, to: GeoPose): { translation: ENU; rotation: Quaternion } {
    const local = geoPoseToLocalENU(to, from.position);
    const q = from.quaternion;
    const norm2 = q.x*q.x + q.y*q.y + q.z*q.z + q.w*q.w;
    const inverse = { x: -q.x/norm2, y: -q.y/norm2, z: -q.z/norm2, w: q.w/norm2 };
    return { translation: local.position, rotation: multiplyQuaternions(inverse, local.orientation) };
}

/**
 * Apply a relative transformation (translation + rotation) to a base GeoPose.
 */
export function applyRelativePose(base: GeoPose, relative: { translation: ENU; rotation: Quaternion }): GeoPose {
    // ENU displacement; body-relative rotation is postmultiplied.
    const orientation = multiplyQuaternions(base.quaternion, relative.rotation);
    return localENUToGeoPose(relative.translation, orientation, base.position);
}

/**
 * Spherical linear interpolation between two poses.
 * @param t Interpolation factor in [0, 1].
 */
export function interpolatePose(from: GeoPose, to: GeoPose, t: number): GeoPose {
    // ECEF chord interpolation, suitable for short distances. It can pass below
    // the surface for widely separated positions; this is not a geodesic.
    const fromEcef = import_conversions.geoPoseToECEF(from);
    const toEcef = import_conversions.geoPoseToECEF(to);

    const x = lerp(fromEcef.position.x, toEcef.position.x, t);
    const y = lerp(fromEcef.position.y, toEcef.position.y, t);
    const z = lerp(fromEcef.position.z, toEcef.position.z, t);

    // Orientation Slerp
    const q = slerp(fromEcef.orientation, toEcef.orientation, t);

    return import_conversions.ecefToGeoPose({ x, y, z }, q);
}

import * as import_conversions from './conversions.js';

/**
 * Linear interpolation helper.
 */
function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

/**
 * Spherical linear interpolation (SLERP) between two unit quaternions.
 */
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
        const q = { x: lerp(x, bx, t), y: lerp(y, by, t), z: lerp(z, bz, t), w: lerp(w, bw, t) };
        const length = Math.hypot(q.x, q.y, q.z, q.w);
        return { x: q.x / length, y: q.y / length, z: q.z / length, w: q.w / length };
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
