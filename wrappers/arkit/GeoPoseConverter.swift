/**
 * GeoPose ↔ ARKit ARGeoAnchor Converter
 *
 * Converts between OGC GeoPose (Basic Quaternion) and ARKit's ARGeoAnchor.
 *
 * Coordinate System Comparison:
 * - OGC GeoPose: Uses ENU (East-North-Up) frame
 *   - X+ points East
 *   - Y+ points North
 *   - Z+ points Up
 *   - Quaternion format: {x, y, z, w}
 *
 * - ARKit (with .gravityAndHeading alignment): Uses a right-handed Y-up system
 *   - X+ points East
 *   - Y+ points Up
 *   - Z+ points South (toward viewer when facing north)
 *
 * This is effectively EUS (East-Up-South), similar to ARCore.
 *
 * Transformation:
 * To convert from ARKit's EUS to GeoPose's ENU:
 *   ENU.x = EUS.x (East stays East)
 *   ENU.y = -EUS.z (North in ENU is -South from EUS)
 *   ENU.z = EUS.y (Up in ENU comes from Up in EUS)
 *
 * For quaternions, we pre-multiply with a rotation of +90° around X-axis.
 */

import Foundation
import simd
import CoreLocation

// MARK: - GeoPose Types

/// OGC GeoPose Basic Quaternion representation
/// Position in WGS84 geodetic coordinates, orientation as quaternion in ENU frame
public struct GeoPose: Codable, Equatable {
    public let position: Position
    public let quaternion: Quaternion

    public init(position: Position, quaternion: Quaternion) {
        self.position = position
        self.quaternion = quaternion
    }

    public struct Position: Codable, Equatable {
        public let lat: Double  // Latitude in degrees (WGS84)
        public let lon: Double  // Longitude in degrees (WGS84)
        public let h: Double    // Height in meters above WGS84 ellipsoid

        public init(lat: Double, lon: Double, h: Double) {
            self.lat = lat
            self.lon = lon
            self.h = h
        }
    }

    public struct Quaternion: Codable, Equatable {
        public let x: Double
        public let y: Double
        public let z: Double
        public let w: Double

        public init(x: Double, y: Double, z: Double, w: Double) {
            self.x = x
            self.y = y
            self.z = z
            self.w = w
        }

        public var normalized: Quaternion {
            let mag = sqrt(x * x + y * y + z * z + w * w)
            guard mag > 0 else { return self }
            return Quaternion(x: x / mag, y: y / mag, z: z / mag, w: w / mag)
        }

        /// Convert to simd_quatd
        public var simdQuaternion: simd_quatd {
            simd_quatd(ix: x, iy: y, iz: z, r: w)
        }

        /// Create from simd_quatd
        public init(simd: simd_quatd) {
            self.x = simd.imag.x
            self.y = simd.imag.y
            self.z = simd.imag.z
            self.w = simd.real
        }

        /// Create from simd_quatf
        public init(simd: simd_quatf) {
            self.x = Double(simd.imag.x)
            self.y = Double(simd.imag.y)
            self.z = Double(simd.imag.z)
            self.w = Double(simd.real)
        }
    }
}

// MARK: - ARGeoAnchor Data Wrapper

/// Wrapper for ARGeoAnchor data that can be used without importing ARKit
/// (useful for testing or when ARKit is not available)
public struct GeoAnchorData: Equatable {
    public let coordinate: CLLocationCoordinate2D
    public let altitude: CLLocationDistance
    public let altitudeSource: AltitudeSource
    public let transform: simd_float4x4

    public enum AltitudeSource: Int {
        case unknown = 0
        case coarse = 1
        case precise = 2
        case userDefined = 3
    }

    public init(
        coordinate: CLLocationCoordinate2D,
        altitude: CLLocationDistance,
        altitudeSource: AltitudeSource = .userDefined,
        transform: simd_float4x4
    ) {
        self.coordinate = coordinate
        self.altitude = altitude
        self.altitudeSource = altitudeSource
        self.transform = transform
    }
}

// MARK: - GeoPose Converter

/// Converter for transforming between GeoPose and ARKit's ARGeoAnchor
public enum GeoPoseConverter {

    // Rotation quaternion for ENU → EUS transformation (-90° around X-axis)
    // ARKit uses Y-up (EUS-like), GeoPose uses Z-up (ENU)
    private static let sqrt2Over2 = sqrt(2.0) / 2.0

    // -90° around X: rotates ENU to EUS
    private static let qEnuToEus = simd_quatd(
        ix: -sqrt2Over2,
        iy: 0,
        iz: 0,
        r: sqrt2Over2
    )

    // +90° around X: rotates EUS to ENU
    private static let qEusToEnu = simd_quatd(
        ix: sqrt2Over2,
        iy: 0,
        iz: 0,
        r: sqrt2Over2
    )

    /// Converts ARGeoAnchor data to OGC GeoPose (Basic Quaternion)
    ///
    /// - Parameter geoAnchorData: The ARGeoAnchor data with EUS-like orientation
    /// - Returns: GeoPose with ENU orientation
    public static func toGeoPose(from geoAnchorData: GeoAnchorData) -> GeoPose {
        // Extract position (direct mapping, both use WGS84)
        let position = GeoPose.Position(
            lat: geoAnchorData.coordinate.latitude,
            lon: geoAnchorData.coordinate.longitude,
            h: geoAnchorData.altitude
        )

        // Extract quaternion from transform matrix
        let eusQuat = simd_quatd(simd_quatf(geoAnchorData.transform))

        // Transform from EUS to ENU frame
        let enuQuat = simd_mul(qEusToEnu, eusQuat)
        let normalizedQuat = simd_normalize(enuQuat)

        let quaternion = GeoPose.Quaternion(simd: normalizedQuat)

        return GeoPose(position: position, quaternion: quaternion)
    }

    /// Converts OGC GeoPose to ARGeoAnchor-compatible data
    ///
    /// - Parameter geoPose: The GeoPose with ENU orientation
    /// - Returns: GeoAnchorData suitable for creating an ARGeoAnchor
    public static func fromGeoPose(_ geoPose: GeoPose) -> GeoAnchorData {
        // Convert position
        let coordinate = CLLocationCoordinate2D(
            latitude: geoPose.position.lat,
            longitude: geoPose.position.lon
        )

        // Transform quaternion from ENU to EUS frame
        let enuQuat = geoPose.quaternion.simdQuaternion
        let eusQuat = simd_mul(qEnuToEus, enuQuat)
        let normalizedQuat = simd_normalize(eusQuat)

        // Build transform matrix from quaternion
        // The rotation part comes from the quaternion
        let rotationMatrix = simd_float3x3(simd_quatf(normalizedQuat))

        // Create full 4x4 transform (rotation only, no translation in local space)
        var transform = simd_float4x4(1.0) // Identity
        transform.columns.0 = simd_float4(rotationMatrix.columns.0, 0)
        transform.columns.1 = simd_float4(rotationMatrix.columns.1, 0)
        transform.columns.2 = simd_float4(rotationMatrix.columns.2, 0)

        return GeoAnchorData(
            coordinate: coordinate,
            altitude: geoPose.position.h,
            altitudeSource: .userDefined,
            transform: transform
        )
    }
}

// MARK: - Convenience Extensions

extension GeoAnchorData {
    /// Convert to GeoPose
    public func toGeoPose() -> GeoPose {
        GeoPoseConverter.toGeoPose(from: self)
    }
}

extension GeoPose {
    /// Convert to GeoAnchorData
    public func toGeoAnchorData() -> GeoAnchorData {
        GeoPoseConverter.fromGeoPose(self)
    }
}

// MARK: - ARKit Integration (when ARKit is available)

#if canImport(ARKit)
import ARKit

@available(iOS 14.0, *)
extension GeoPoseConverter {

    /// Converts an ARGeoAnchor to OGC GeoPose (Basic Quaternion)
    ///
    /// - Parameter geoAnchor: ARKit's ARGeoAnchor
    /// - Returns: GeoPose with ENU orientation
    public static func toGeoPose(from geoAnchor: ARGeoAnchor) -> GeoPose {
        let data = GeoAnchorData(
            coordinate: geoAnchor.coordinate,
            altitude: geoAnchor.altitude,
            altitudeSource: GeoAnchorData.AltitudeSource(rawValue: geoAnchor.altitudeSource.rawValue) ?? .unknown,
            transform: geoAnchor.transform
        )
        return toGeoPose(from: data)
    }

    /// Creates an ARGeoAnchor from OGC GeoPose
    ///
    /// Note: ARGeoAnchor orientation is determined by the session's world alignment,
    /// so the returned anchor will have identity orientation. Use the GeoAnchorData
    /// if you need to preserve the full orientation.
    ///
    /// - Parameter geoPose: The GeoPose to convert
    /// - Returns: ARGeoAnchor positioned at the GeoPose location
    public static func createGeoAnchor(from geoPose: GeoPose) -> ARGeoAnchor {
        let coordinate = CLLocationCoordinate2D(
            latitude: geoPose.position.lat,
            longitude: geoPose.position.lon
        )
        return ARGeoAnchor(coordinate: coordinate, altitude: geoPose.position.h)
    }
}

@available(iOS 14.0, *)
extension ARGeoAnchor {
    /// Convert to GeoPose
    public func toGeoPose() -> GeoPose {
        GeoPoseConverter.toGeoPose(from: self)
    }
}
#endif
