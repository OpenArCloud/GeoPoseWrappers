/**
 * OGC GeoPose Basic Quaternion representation.
 * Use this for API and SDK integration where a quaternion is the source of truth.
 */
export interface GeoPose {
    position: {
        /** WGS84 latitude in degrees. */
        lat: number;
        /** WGS84 longitude in degrees. */
        lon: number;
        /** Height in meters above the WGS84 ellipsoid. */
        h: number;
    };
    quaternion: {
        /** Quaternion x component. */
        x: number;
        /** Quaternion y component. */
        y: number;
        /** Quaternion z component. */
        z: number;
        /** Quaternion w component. */
        w: number;
    };
}

/**
 * OGC GeoPose Basic YPR (Yaw/Pitch/Roll) representation.
 * Intended for UI and human-friendly orientation input.
 */
export interface GeoPoseBYPR {
    position: {
        /** WGS84 latitude in degrees. */
        lat: number;
        /** WGS84 longitude in degrees. */
        lon: number;
        /** Height in meters above the WGS84 ellipsoid. */
        h: number;
    };
    angles: {
        /** Yaw in degrees. 0 = North, 90 = East. */
        yaw: number;
        /** Pitch in degrees. Positive = looking up. */
        pitch: number;
        /** Roll in degrees. Positive = banking right. */
        roll: number;
    };
}

/**
 * Earth-Centered, Earth-Fixed (ECEF) Cartesian coordinates in meters.
 */
export interface ECEF {
    /** X axis in meters. */
    x: number;
    /** Y axis in meters. */
    y: number;
    /** Z axis in meters. */
    z: number;
}

/**
 * Local tangent plane coordinates (East, North, Up) in meters.
 */
export interface ENU {
    /** Easting in meters. */
    east: number;
    /** Northing in meters. */
    north: number;
    /** Up in meters. */
    up: number;
}

/**
 * WGS84 ellipsoid constants used for geodetic conversions.
 */
export const WGS84 = {
    /** Semi-major axis (meters). */
    a: 6378137.0,
    /** Semi-minor axis (meters). */
    b: 6356752.314245,
    /** Flattening. */
    f: 1 / 298.257223563,
    /** First eccentricity. */
    e: 0.0818191908426,
    /** First eccentricity squared. */
    e2: 0.00669437999014,
};

/**
 * Unit quaternion used to represent orientation.
 */
export interface Quaternion {
    /** Quaternion x component. */
    x: number;
    /** Quaternion y component. */
    y: number;
    /** Quaternion z component. */
    z: number;
    /** Quaternion w component. */
    w: number;
}

/**
 * Latitude/longitude/height triple in WGS84 (degrees/meters).
 */
export interface LLH {
    /** WGS84 latitude in degrees. */
    lat: number;
    /** WGS84 longitude in degrees. */
    lon: number;
    /** Height in meters above the WGS84 ellipsoid. */
    h: number;
}

/**
 * 6DOF pose in a projected coordinate reference system (e.g., UTM).
 * Position is in meters (easting, northing, height).
 * Orientation quaternion follows the same convention as GeoPose (ENU-aligned).
 */
export interface ProjectedPose {
    /** Easting in meters (X axis in projected CRS). */
    x: number;
    /** Northing in meters (Y axis in projected CRS). */
    y: number;
    /** Height in meters above the ellipsoid (Z axis). */
    z: number;
    /** Orientation quaternion (ENU-aligned). */
    quaternion: Quaternion;
    /** EPSG code identifying the coordinate reference system, e.g., "EPSG:32632". */
    epsg: string;
}
