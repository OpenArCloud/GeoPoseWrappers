package org.ogc.geopose.wrappers.arcore

import java.io.File
import org.json.JSONObject
import kotlin.math.abs

private fun near(a: Double, b: Double, tolerance: Double = 1e-10) {
    check(abs(a-b) < tolerance) { "$a != $b" }
}
private fun same(a: GeoPose.Quaternion, b: GeoPose.Quaternion, tolerance: Double = 1e-10) {
    near(abs(a.x*b.x+a.y*b.y+a.z*b.z+a.w*b.w), 1.0, tolerance)
}
fun main(args: Array<String>) {
    val sequences = JSONObject(File(args[0]).readText()).getJSONArray("sequences")
    var count = 0
    for (i in 0 until sequences.length()) {
        val poses = sequences.getJSONObject(i).getJSONArray("poses")
        for (j in 0 until poses.length()) {
            val sample = poses.getJSONObject(j)
            val input = GeoPoseYPR.fromJson(sample.getJSONObject("basicYPR").toString())!!
            val expected = GeoPoseSerialization.fromJson(sample.getJSONObject("basicQuaternion").toString())!!
            val result = input.toQuaternion()
            same(result.quaternion, expected.quaternion)
            val q = result.quaternion
            val axes = arrayOf(
                doubleArrayOf(1-2*(q.y*q.y+q.z*q.z), 2*(q.x*q.y+q.w*q.z), 2*(q.x*q.z-q.w*q.y)),
                doubleArrayOf(2*(q.x*q.y-q.w*q.z), 1-2*(q.x*q.x+q.z*q.z), 2*(q.y*q.z+q.w*q.x)),
                doubleArrayOf(2*(q.x*q.z+q.w*q.y), 2*(q.y*q.z-q.w*q.x), 1-2*(q.x*q.x+q.y*q.y))
            )
            for ((axis, key) in listOf("x", "y", "z").withIndex()) {
                val golden = sample.getJSONObject("axesInENU").getJSONArray(key)
                for (k in 0..2) near(axes[axis][k], golden.getDouble(k))
            }
            same(result.toYPR().toQuaternion().quaternion, q)
            // EUS changes the reference frame, preserving the object/body axes.
            same(result.toGeospatialPose().toGeoPose().quaternion, q, 1e-7)
            count++
        }
    }
    val position = GeoPose.Position(60.0,10.0,100.0)
    for (pitch in listOf(-90.0,90.0)) for (yaw in listOf(-170.0,20.0,110.0)) for (roll in listOf(-80.0,30.0,160.0)) {
        val pose = GeoPoseYPR(position,GeoPoseYPR.Angles(yaw,pitch,roll)).toQuaternion()
        val recovered = pose.toYPR()
        near(recovered.angles.roll,0.0)
        same(pose.quaternion,recovered.toQuaternion().quaternion)
        val q = pose.quaternion
        val negative = GeoPose(position,GeoPose.Quaternion(-3*q.x,-3*q.y,-3*q.z,-3*q.w))
        same(q,negative.toYPR().toQuaternion().quaternion)
        count++
    }
    val eusIdentity = GeospatialPose(60.0,10.0,100.0,floatArrayOf(0f,0f,0f,1f)).toGeoPose().quaternion
    same(eusIdentity,GeoPose.Quaternion(kotlin.math.sqrt(0.5),0.0,0.0,kotlin.math.sqrt(0.5)))
    println("ARCore: $count fixture/singularity cases and EUS basis passed")
}
