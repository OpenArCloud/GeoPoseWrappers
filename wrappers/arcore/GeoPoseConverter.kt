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
 * OGC GeoPose (Basic Quaternion) representation
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

// ============================================================================
// JSON Serialization
// ============================================================================

import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONException

/**
 * Serialize GeoPose to OGC-compliant JSON string
 * @param prettyPrint If true, format with indentation for readability
 * @return JSON string
 */
fun GeoPose.toJson(prettyPrint: Boolean = false): String {
    val json = toJsonObject()
    return if (prettyPrint) json.toString(2) else json.toString()
}

/**
 * Serialize GeoPose to JSONObject
 * @return JSONObject representation
 */
fun GeoPose.toJsonObject(): JSONObject {
    return JSONObject().apply {
        put("position", JSONObject().apply {
            put("lat", position.lat)
            put("lon", position.lon)
            put("h", position.h)
        })
        put("quaternion", JSONObject().apply {
            put("x", quaternion.x)
            put("y", quaternion.y)
            put("z", quaternion.z)
            put("w", quaternion.w)
        })
    }
}

/**
 * Serialize list of GeoPoses to JSON array string
 * @param prettyPrint If true, format with indentation for readability
 * @return JSON array string
 */
fun List<GeoPose>.toJsonArray(prettyPrint: Boolean = false): String {
    val jsonArray = JSONArray()
    forEach { jsonArray.put(it.toJsonObject()) }
    return if (prettyPrint) jsonArray.toString(2) else jsonArray.toString()
}

/**
 * Companion object extensions for deserialization
 */
object GeoPoseSerialization {

    /**
     * Deserialize GeoPose from JSON string
     * @param jsonString OGC-compliant GeoPose JSON string
     * @return GeoPose or null if parsing fails
     */
    fun fromJson(jsonString: String): GeoPose? {
        return try {
            fromJsonObject(JSONObject(jsonString))
        } catch (e: JSONException) {
            null
        }
    }

    /**
     * Deserialize GeoPose from JSONObject
     * @param json JSONObject with position and quaternion
     * @return GeoPose or null if parsing fails
     */
    fun fromJsonObject(json: JSONObject): GeoPose? {
        return try {
            val positionJson = json.getJSONObject("position")
            val quaternionJson = json.getJSONObject("quaternion")

            val position = GeoPose.Position(
                lat = positionJson.getDouble("lat"),
                lon = positionJson.getDouble("lon"),
                h = positionJson.getDouble("h")
            )

            val quaternion = GeoPose.Quaternion(
                x = quaternionJson.getDouble("x"),
                y = quaternionJson.getDouble("y"),
                z = quaternionJson.getDouble("z"),
                w = quaternionJson.getDouble("w")
            )

            GeoPose(position, quaternion)
        } catch (e: JSONException) {
            null
        }
    }

    /**
     * Deserialize list of GeoPoses from JSON array string
     * @param jsonString JSON array string
     * @return List of GeoPose (empty if parsing fails)
     */
    fun listFromJsonArray(jsonString: String): List<GeoPose> {
        return try {
            val jsonArray = JSONArray(jsonString)
            (0 until jsonArray.length()).mapNotNull { i ->
                fromJsonObject(jsonArray.getJSONObject(i))
            }
        } catch (e: JSONException) {
            emptyList()
        }
    }

    /**
     * Validate that a GeoPose has valid coordinates and normalized quaternion
     */
    fun isValid(geoPose: GeoPose): Boolean {
        // Check latitude bounds (-90 to 90)
        if (geoPose.position.lat < -90 || geoPose.position.lat > 90) return false
        // Check longitude bounds (-180 to 180)
        if (geoPose.position.lon < -180 || geoPose.position.lon > 180) return false
        // Check quaternion is normalized (magnitude ≈ 1)
        val q = geoPose.quaternion
        val mag = sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w)
        if (kotlin.math.abs(mag - 1.0) > 0.001) return false
        return true
    }
}

// ============================================================================
// GeoPose YPR (Yaw-Pitch-Roll) Support
// ============================================================================

/**
 * OGC GeoPose Basic YPR representation
 * Position in WGS84 geodetic coordinates, orientation as yaw/pitch/roll angles in degrees
 */
data class GeoPoseYPR(
    val position: GeoPose.Position,
    val angles: Angles
) {
    data class Angles(
        val yaw: Double,   // Rotation around Z (up), degrees
        val pitch: Double, // Rotation around Y (north), degrees
        val roll: Double   // Rotation around X (east), degrees
    )

    /**
     * Convert YPR representation to Quaternion representation
     * Uses ZYX rotation order (yaw, then pitch, then roll)
     */
    fun toQuaternion(): GeoPose {
        // Convert degrees to radians
        val yawRad = Math.toRadians(angles.yaw)
        val pitchRad = Math.toRadians(angles.pitch)
        val rollRad = Math.toRadians(angles.roll)

        // Half angles
        val cy = kotlin.math.cos(yawRad / 2)
        val sy = kotlin.math.sin(yawRad / 2)
        val cp = kotlin.math.cos(pitchRad / 2)
        val sp = kotlin.math.sin(pitchRad / 2)
        val cr = kotlin.math.cos(rollRad / 2)
        val sr = kotlin.math.sin(rollRad / 2)

        // ZYX rotation order quaternion
        val quaternion = GeoPose.Quaternion(
            x = sr * cp * cy - cr * sp * sy,
            y = cr * sp * cy + sr * cp * sy,
            z = cr * cp * sy - sr * sp * cy,
            w = cr * cp * cy + sr * sp * sy
        ).normalized()

        return GeoPose(position, quaternion)
    }

    /**
     * Serialize to OGC-compliant JSON string
     */
    fun toJson(prettyPrint: Boolean = false): String {
        val json = JSONObject().apply {
            put("position", JSONObject().apply {
                put("lat", position.lat)
                put("lon", position.lon)
                put("h", position.h)
            })
            put("angles", JSONObject().apply {
                put("yaw", angles.yaw)
                put("pitch", angles.pitch)
                put("roll", angles.roll)
            })
        }
        return if (prettyPrint) json.toString(2) else json.toString()
    }

    companion object {
        /**
         * Create YPR representation from Quaternion representation
         */
        fun fromQuaternion(geoPose: GeoPose): GeoPoseYPR {
            val q = geoPose.quaternion

            // Roll (x-axis rotation)
            val sinrCosp = 2.0 * (q.w * q.x + q.y * q.z)
            val cosrCosp = 1.0 - 2.0 * (q.x * q.x + q.y * q.y)
            val roll = kotlin.math.atan2(sinrCosp, cosrCosp)

            // Pitch (y-axis rotation)
            val sinp = 2.0 * (q.w * q.y - q.z * q.x)
            val pitch = if (kotlin.math.abs(sinp) >= 1) {
                kotlin.math.copySign(Math.PI / 2, sinp) // Clamp to ±90°
            } else {
                kotlin.math.asin(sinp)
            }

            // Yaw (z-axis rotation)
            val sinyCosp = 2.0 * (q.w * q.z + q.x * q.y)
            val cosyCosp = 1.0 - 2.0 * (q.y * q.y + q.z * q.z)
            val yaw = kotlin.math.atan2(sinyCosp, cosyCosp)

            // Convert radians to degrees
            val angles = Angles(
                yaw = Math.toDegrees(yaw),
                pitch = Math.toDegrees(pitch),
                roll = Math.toDegrees(roll)
            )

            return GeoPoseYPR(geoPose.position, angles)
        }

        /**
         * Deserialize from JSON string
         */
        fun fromJson(jsonString: String): GeoPoseYPR? {
            return try {
                val json = JSONObject(jsonString)
                val positionJson = json.getJSONObject("position")
                val anglesJson = json.getJSONObject("angles")

                val position = GeoPose.Position(
                    lat = positionJson.getDouble("lat"),
                    lon = positionJson.getDouble("lon"),
                    h = positionJson.getDouble("h")
                )

                val angles = Angles(
                    yaw = anglesJson.getDouble("yaw"),
                    pitch = anglesJson.getDouble("pitch"),
                    roll = anglesJson.getDouble("roll")
                )

                GeoPoseYPR(position, angles)
            } catch (e: JSONException) {
                null
            }
        }
    }
}

/**
 * Extension function to convert GeoPose to YPR representation
 */
fun GeoPose.toYPR(): GeoPoseYPR = GeoPoseYPR.fromQuaternion(this)

/**
 * Extension function to convert GeoPoseYPR to Quaternion representation
 */
fun GeoPoseYPR.toBQ(): GeoPose = toQuaternion()
