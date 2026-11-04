import Foundation
import simd

private func near(_ a: Double, _ b: Double, tolerance: Double = 1e-10) {
    precondition(abs(a-b) < tolerance, "\(a) != \(b)")
}
private func same(_ a: GeoPose.Quaternion, _ b: GeoPose.Quaternion, tolerance: Double = 1e-10) {
    near(abs(a.x*b.x+a.y*b.y+a.z*b.z+a.w*b.w), 1, tolerance: tolerance)
}
@main
struct RotationTest {
    static func main() throws {
        let data = try Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))
        let fixtures = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        var count = 0
        for sequence in fixtures["sequences"] as! [[String: Any]] {
            for sample in sequence["poses"] as! [[String: Any]] {
                let decoder = JSONDecoder()
                let input = try decoder.decode(GeoPoseYPR.self, from: JSONSerialization.data(withJSONObject: sample["basicYPR"]!))
                let expected = try decoder.decode(GeoPose.self, from: JSONSerialization.data(withJSONObject: sample["basicQuaternion"]!))
                let pose = input.toQuaternion()
                same(pose.quaternion, expected.quaternion)
                let matrix = simd_double3x3(pose.quaternion.simdQuaternion)
                let axes = sample["axesInENU"] as! [String: [Double]]
                for (column, key) in ["x", "y", "z"].enumerated() {
                    for row in 0..<3 { near(matrix[column][row], axes[key]![row]) }
                }
                same(pose.toYPR().toQuaternion().quaternion, pose.quaternion)
                same(pose.toGeoAnchorData().toGeoPose().quaternion, pose.quaternion, tolerance: 1e-7)
                count += 1
            }
        }
        let position = GeoPose.Position(lat: 60, lon: 10, h: 100)
        for pitch in [-90.0, 90.0] {
            for yaw in [-170.0, 20.0, 110.0] {
                for roll in [-80.0, 30.0, 160.0] {
                    let pose = GeoPoseYPR(position: position, angles: .init(yaw: yaw, pitch: pitch, roll: roll)).toQuaternion()
                    let recovered = pose.toYPR()
                    near(recovered.angles.roll, 0)
                    same(pose.quaternion, recovered.toQuaternion().quaternion)
                    let q = pose.quaternion
                    let negative = GeoPose(position: position, quaternion: .init(x: -3*q.x, y: -3*q.y, z: -3*q.z, w: -3*q.w))
                    same(q, negative.toYPR().toQuaternion().quaternion)
                    count += 1
                }
            }
        }
        // A native identity EUS orientation becomes a +90 degree ENU X rotation.
        let eus = GeoPose(position: position, quaternion: .init(x: sqrt(0.5), y: 0, z: 0, w: sqrt(0.5))).toGeoAnchorData()
        let rotation = simd_quatf(eus.transform)
        near(Double(abs(rotation.real)), 1, tolerance: 1e-6)
        print("ARKit: \(count) fixture/singularity cases and EUS basis passed")
    }
}
