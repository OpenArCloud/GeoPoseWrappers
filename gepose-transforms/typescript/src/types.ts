// OGC GeoPose Basic Quaternion
export interface GeoPoseBQ {
    position: {
        lat: number; // Latitude in degrees
        lon: number; // Longitude in degrees
        h: number;   // Height in meters above WGS84 ellipsoid
    };
    quaternion: {
        x: number;
        y: number;
        z: number;
        w: number;
    };
}

// OGC GeoPose Basic YPR (Yaw-Pitch-Roll)
export interface GeoPoseBYPR {
    position: {
        lat: number;
        lon: number;
        h: number;
    };
    angles: {
        yaw: number;   // degrees, 0 = North, 90 = East
        pitch: number; // degrees, positive = looking up
        roll: number;  // degrees, positive = banking right
    };
}

// ECEF Cartesian coordinates (Earth-Centered Earth-Fixed)
export interface ECEF {
    x: number;
    y: number;
    z: number;
}

// ENU local tangent plane (East-North-Up)
export interface ENU {
    east: number;
    north: number;
    up: number;
}

// Global WGS84 Constants
export const WGS84 = {
    a: 6378137.0,              // Semi-major axis
    b: 6356752.314245,         // Semi-minor axis
    f: 1 / 298.257223563,      // Flattening
    e: 0.0818191908426,        // First eccentricity
    e2: 0.00669437999014,      // First eccentricity squared
};

// Generic Quaternion interface
export interface Quaternion {
    x: number;
    y: number;
    z: number;
    w: number;
}

// Generic Lat/Lon/Height interface
export interface LLH {
    lat: number;
    lon: number;
    h: number;
}
