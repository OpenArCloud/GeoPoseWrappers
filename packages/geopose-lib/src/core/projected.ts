/**
 * Projected coordinate system transforms using proj4.
 * Enables conversion between GeoPose (WGS84) and projected CRS (e.g., UTM).
 */

import proj4 from 'proj4';
import { GeoPose, ProjectedPose, Quaternion, LLH } from '../types.js';

/**
 * WGS84 geographic CRS definition for proj4.
 */
const WGS84_PROJ = 'EPSG:4326';

/**
 * Projected position (without orientation).
 */
export interface ProjectedPosition {
    /** Easting in meters. */
    x: number;
    /** Northing in meters. */
    y: number;
    /** Height in meters. */
    z: number;
    /** EPSG code of the projected CRS. */
    epsg: string;
}

/**
 * Transform a WGS84 lat/lon/height position to a projected coordinate system.
 *
 * @param lat - Latitude in degrees (WGS84).
 * @param lon - Longitude in degrees (WGS84).
 * @param h - Height in meters above the WGS84 ellipsoid.
 * @param epsg - Target EPSG code, e.g., "EPSG:32632" for UTM zone 32N.
 * @returns Projected position with x (easting), y (northing), z (height), and epsg.
 */
export function positionToProjected(
    lat: number,
    lon: number,
    h: number,
    epsg: string
): ProjectedPosition {
    // proj4 expects [lon, lat] order for geographic coordinates
    const [x, y] = proj4(WGS84_PROJ, epsg, [lon, lat]);
    return { x, y, z: h, epsg };
}

/**
 * Transform a projected position back to WGS84 lat/lon/height.
 *
 * @param x - Easting in meters.
 * @param y - Northing in meters.
 * @param z - Height in meters.
 * @param epsg - Source EPSG code of the projected CRS.
 * @returns WGS84 position as { lat, lon, h }.
 */
export function projectedToPosition(
    x: number,
    y: number,
    z: number,
    epsg: string
): LLH {
    // proj4 returns [lon, lat] order
    const [lon, lat] = proj4(epsg, WGS84_PROJ, [x, y]);
    return { lat, lon, h: z };
}

/**
 * Transform a GeoPose (WGS84 + quaternion) to a projected 6DOF pose.
 *
 * The position is transformed using proj4. The orientation quaternion is
 * preserved as-is, assuming the projected coordinate system is approximately
 * aligned with ENU (East-North-Up), which is true for most projected CRS
 * like UTM where X≈East and Y≈North.
 *
 * @param geoPose - Source GeoPose in WGS84.
 * @param epsg - Target EPSG code, e.g., "EPSG:32632".
 * @returns ProjectedPose with x, y, z coordinates and quaternion orientation.
 */
export function geoPoseToProjected(geoPose: GeoPose, epsg: string): ProjectedPose {
    const { x, y, z } = positionToProjected(
        geoPose.position.lat,
        geoPose.position.lon,
        geoPose.position.h,
        epsg
    );
    return {
        x,
        y,
        z,
        quaternion: { ...geoPose.quaternion },
        epsg
    };
}

/**
 * Transform a projected 6DOF pose back to a GeoPose (WGS84).
 *
 * The position is transformed using proj4. The orientation quaternion is
 * preserved as-is, assuming the projected coordinate system is approximately
 * aligned with ENU.
 *
 * @param pose - Source ProjectedPose (includes epsg).
 * @returns GeoPose in WGS84.
 */
export function projectedToGeoPose(pose: ProjectedPose): GeoPose {
    const { lat, lon, h } = projectedToPosition(pose.x, pose.y, pose.z, pose.epsg);
    return {
        position: { lat, lon, h },
        quaternion: { ...pose.quaternion }
    };
}

/**
 * Transform a ProjectedPose from one CRS to another.
 *
 * @param pose - Source ProjectedPose.
 * @param targetEpsg - Target EPSG code.
 * @returns ProjectedPose in the target CRS.
 */
export function transformProjectedPose(
    pose: ProjectedPose,
    targetEpsg: string
): ProjectedPose {
    // Transform position via WGS84 intermediate
    const [lon, lat] = proj4(pose.epsg, WGS84_PROJ, [pose.x, pose.y]);
    const [x, y] = proj4(WGS84_PROJ, targetEpsg, [lon, lat]);
    return {
        x,
        y,
        z: pose.z,
        quaternion: { ...pose.quaternion },
        epsg: targetEpsg
    };
}

/**
 * Register a custom CRS definition with proj4.
 *
 * Use this to add support for EPSG codes not built into proj4.
 *
 * @param epsg - EPSG code, e.g., "EPSG:32632".
 * @param definition - proj4 definition string (WKT or proj4 format).
 *
 * @example
 * ```ts
 * // Register UTM zone 32N
 * registerCRS('EPSG:32632', '+proj=utm +zone=32 +datum=WGS84 +units=m +no_defs');
 * ```
 */
export function registerCRS(epsg: string, definition: string): void {
    proj4.defs(epsg, definition);
}

/**
 * Check if a CRS is registered/supported by proj4.
 *
 * @param epsg - EPSG code to check.
 * @returns True if the CRS is available.
 */
export function isCRSSupported(epsg: string): boolean {
    try {
        return proj4.defs(epsg) !== undefined;
    } catch {
        return false;
    }
}

/**
 * Get a list of commonly used UTM zone EPSG codes for a given longitude.
 *
 * @param lon - Longitude in degrees.
 * @param northern - True for northern hemisphere, false for southern.
 * @returns EPSG code for the appropriate UTM zone.
 */
export function getUTMZoneEPSG(lon: number, northern: boolean): string {
    // UTM zone calculation: zone = floor((lon + 180) / 6) + 1
    const zone = Math.floor((lon + 180) / 6) + 1;
    // Northern hemisphere: EPSG:326xx, Southern: EPSG:327xx
    const base = northern ? 32600 : 32700;
    return `EPSG:${base + zone}`;
}

/**
 * Get the UTM zone EPSG code for a GeoPose based on its position.
 *
 * @param geoPose - GeoPose to determine UTM zone for.
 * @returns EPSG code for the appropriate UTM zone.
 */
export function getUTMZoneForGeoPose(geoPose: GeoPose): string {
    return getUTMZoneEPSG(
        geoPose.position.lon,
        geoPose.position.lat >= 0
    );
}
