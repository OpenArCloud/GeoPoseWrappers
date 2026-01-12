/**
 * GeoPose ↔ ARCore GeospatialPose Converter
 *
 * Converts between OGC GeoPose (Basic Quaternion) and ARCore's GeospatialPose.
 *
 * Coordinate System Differences:
 * - OGC GeoPose: Uses ENU (East-North-Up) frame
 *   - X+ points East
 *   - Y+ points North
 *   - Z+ points Up
 *   - Quaternion format: {x, y, z, w}
 *
 * - ARCore GeospatialPose: Uses EUS (East-Up-South) frame
 *   - X+ points East
 *   - Y+ points Up
 *   - Z+ points South
 *   - Quaternion from getEastUpSouthQuaternion(): {x, y, z, w}
 *
 * Transformation:
 * To convert from ENU to EUS, we need to rotate -90° around the X-axis (East):
 *   EUS.x = ENU.x (East stays East)
 *   EUS.y = ENU.z (Up in ENU becomes Up in EUS, but ENU's Z is Up)
 *   EUS.z = -ENU.y (South in EUS is -North from ENU)
 *
 * For quaternions, this is achieved by pre-multiplying with a rotation quaternion
 * representing -90° around X-axis: q_rot = (sin(-45°), 0, 0, cos(-45°)) = (-√2/2, 0, 0, √2/2)
 */
package org.ogc.geopose.wrappers.arcore

import kotlin.math.sqrt

/**
 * OGC GeoPose Basic Quaternion representation
 * Position in WGS84 geodetic coordinates, orientation as quaternion in ENU frame
 */
data class GeoPose(
    val position: Position,
    val quaternion: Quaternion
) {
    data class Position(
        val lat: Double,  // Latitude in degrees (WGS84)
        val lon: Double,  // Longitude in degrees (WGS84)
        val h: Double     // Height in meters above WGS84 ellipsoid
    )

    data class Quaternion(
        val x: Double,
        val y: Double,
        val z: Double,
        val w: Double
    ) {
        fun normalized(): Quaternion {
            val mag = sqrt(x * x + y * y + z * z + w * w)
            return if (mag > 0) Quaternion(x / mag, y / mag, z / mag, w / mag) else this
        }
    }
}

/**
 * ARCore GeospatialPose representation
 * Mirrors the structure returned by ARCore's Earth.getCameraGeospatialPose()
 */
data class GeospatialPose(
    val latitude: Double,           // Degrees, WGS84
    val longitude: Double,          // Degrees, WGS84
    val altitude: Double,           // Meters above WGS84 ellipsoid
    val eastUpSouthQuaternion: FloatArray,  // [x, y, z, w] in EUS frame
    val heading: Double = 0.0,      // Deprecated, degrees clockwise from north
    val horizontalAccuracy: Double = 0.0,
    val verticalAccuracy: Double = 0.0,
    val orientationYawAccuracy: Double = 0.0
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is GeospatialPose) return false
        return latitude == other.latitude &&
               longitude == other.longitude &&
               altitude == other.altitude &&
               eastUpSouthQuaternion.contentEquals(other.eastUpSouthQuaternion)
    }

    override fun hashCode(): Int {
        var result = latitude.hashCode()
        result = 31 * result + longitude.hashCode()
        result = 31 * result + altitude.hashCode()
        result = 31 * result + eastUpSouthQuaternion.contentHashCode()
        return result
    }
}

/**
 * Converter object for transforming between GeoPose and GeospatialPose
 */
object GeoPoseConverter {

    // Rotation quaternion for ENU → EUS transformation (-90° around X-axis)
    // q = (sin(θ/2), 0, 0, cos(θ/2)) where θ = -90° = -π/2
    // sin(-π/4) = -√2/2, cos(-π/4) = √2/2
    private val SQRT2_OVER_2 = sqrt(2.0) / 2.0
    private val Q_ENU_TO_EUS = GeoPose.Quaternion(
        x = -SQRT2_OVER_2,
        y = 0.0,
        z = 0.0,
        w = SQRT2_OVER_2
    )

    // Inverse rotation for EUS → ENU (+90° around X-axis)
    private val Q_EUS_TO_ENU = GeoPose.Quaternion(
        x = SQRT2_OVER_2,
        y = 0.0,
        z = 0.0,
        w = SQRT2_OVER_2
    )

    /**
     * Converts an ARCore GeospatialPose to OGC GeoPose (Basic Quaternion)
     *
     * @param geospatialPose ARCore GeospatialPose with EUS orientation
     * @return GeoPose with ENU orientation
     */
    fun toGeoPose(geospatialPose: GeospatialPose): GeoPose {
        // Position maps directly (both use WGS84)
        val position = GeoPose.Position(
            lat = geospatialPose.latitude,
            lon = geospatialPose.longitude,
            h = geospatialPose.altitude
        )

        // Convert quaternion from EUS to ENU frame
        val eusQuat = GeoPose.Quaternion(
            x = geospatialPose.eastUpSouthQuaternion[0].toDouble(),
            y = geospatialPose.eastUpSouthQuaternion[1].toDouble(),
            z = geospatialPose.eastUpSouthQuaternion[2].toDouble(),
            w = geospatialPose.eastUpSouthQuaternion[3].toDouble()
        )

        // Transform: q_enu = q_rotation * q_eus
        // This rotates the orientation from EUS frame to ENU frame
        val enuQuat = multiplyQuaternions(Q_EUS_TO_ENU, eusQuat).normalized()

        return GeoPose(position, enuQuat)
    }

    /**
     * Converts an OGC GeoPose to ARCore GeospatialPose
     *
     * @param geoPose OGC GeoPose with ENU orientation
     * @return GeospatialPose with EUS orientation
     */
    fun fromGeoPose(geoPose: GeoPose): GeospatialPose {
        // Transform quaternion from ENU to EUS frame
        // q_eus = q_rotation * q_enu
        val eusQuat = multiplyQuaternions(Q_ENU_TO_EUS, geoPose.quaternion).normalized()

        return GeospatialPose(
            latitude = geoPose.position.lat,
            longitude = geoPose.position.lon,
            altitude = geoPose.position.h,
            eastUpSouthQuaternion = floatArrayOf(
                eusQuat.x.toFloat(),
                eusQuat.y.toFloat(),
                eusQuat.z.toFloat(),
                eusQuat.w.toFloat()
            )
        )
    }

    /**
     * Hamilton quaternion multiplication: q1 * q2
     * Result represents rotation q2 followed by rotation q1
     */
    private fun multiplyQuaternions(
        q1: GeoPose.Quaternion,
        q2: GeoPose.Quaternion
    ): GeoPose.Quaternion {
        return GeoPose.Quaternion(
            x = q1.w * q2.x + q1.x * q2.w + q1.y * q2.z - q1.z * q2.y,
            y = q1.w * q2.y - q1.x * q2.z + q1.y * q2.w + q1.z * q2.x,
            z = q1.w * q2.z + q1.x * q2.y - q1.y * q2.x + q1.z * q2.w,
            w = q1.w * q2.w - q1.x * q2.x - q1.y * q2.y - q1.z * q2.z
        )
    }
}

/**
 * Extension function for convenient conversion from GeospatialPose
 */
fun GeospatialPose.toGeoPose(): GeoPose = GeoPoseConverter.toGeoPose(this)

/**
 * Extension function for convenient conversion from GeoPose
 */
fun GeoPose.toGeospatialPose(): GeospatialPose = GeoPoseConverter.fromGeoPose(this)
