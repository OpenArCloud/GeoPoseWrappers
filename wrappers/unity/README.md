# Unity GeoPose wrapper

A shared, metre-scale ENU scene for Unity cameras and multiple geographic assets. WGS84 geodetic and ECEF calculations use `double`; Unity `float` values appear only **after the ECEF origin has been subtracted and the displacement rotated into the local frame**.

The [OSCP AR sample](Samples~/OscpAr/README.md) adds VPS localization, a ground-level origin, bundled GLBs and optional content discovery. The base package has no AR Foundation or glTFast dependency.

This is an alpha implementation. CI compiles and executes the actual C# math and service sources; Unity Editor and physical-device validation are separate requirements described below.

## Install

Unity 2022.3 or newer, using Package Manager → Add package from Git URL:

```text
https://github.com/OpenArCloud/GeoPoseWrappers.git?path=/wrappers/unity
```

While this change is under review, append `#feat/unity-geopose-enu-ar`; after merging, pin a reviewed commit or release tag for reproducible builds. The package depends on Unity's Newtonsoft JSON package. The optional AR sample targets Unity 6 / AR Foundation 6.

## Frames and body axes

Basic GeoPose uses WGS84 latitude/longitude in degrees and **ellipsoidal** height in metres. Its orientation is relative to ENU **at that pose's position**, not automatically at the scene origin. The wrapper includes the rotation between these tangent frames, even when poses are far apart.

| Frame | X | Y | Z | Handedness |
|---|---|---|---|---|
| GeoPose reference / scene ENU | East | North | Up | Right |
| Unity scene coordinates | East | Up | North | Left |
| ECEF (EPSG:4978) | Equator, longitude 0° | Equator, longitude 90° E | North pole | Right |

ENU offsets are `(east,north,up)`; Unity local positions are `(east,up,north)`. Earth-centred positions never go directly into a `Transform`.

Orientation follows the [repository's right-handed explanation](../../docs/enu-ypr-quaternion.md): active Hamilton quaternions `(x,y,z,w)`, body → ENU, with `Rz(yaw) Ry(pitch) Rx(roll)`. Positive yaw turns East toward North, counterclockwise when looking from above. Basic YPR angles are degrees. `Quaternion.Euler` and `Transform.eulerAngles` are **not GeoPose YPR converters**.

The body's axes are a separate choice:

| `BodyAxes` preset | GeoPose body meaning | Expected Unity object |
|---|---|---|
| `ForwardLeftUp` (default) | +X forward, +Y left, +Z up | Prefab +Z forward, +X right, +Y up |
| `CameraRightUpBack` | +X image-right, +Y image-up, −Z view | Unity camera looking along +Z |
| `GltfSourceXReflection` | Original glTF source coordinates | glTFast ≥4 imported hierarchy, whose geometry already has its X basis reflected |
| `EnuAxes` | Generic body X/Y/Z | Unity body coordinates are `(x,z,y)` |

For an upright asset, identity GeoPose faces East; yaw +90° faces North. A camera with identity GeoPose looks Down, with its image-up pointing North. A level camera facing North has GeoPose YPR `(yaw=0,pitch=0,roll=90)` in the right/up/back preset. These are different bodies, not inconsistent rotations.

Use `ForwardLeftUp` for semantic asset placement, including the sample GLBs. Choose `GltfSourceXReflection` only when the publisher's quaternion is explicitly in the **raw glTF source body frame**. Its identity pose puts glTF +Y along North and +Z along Up. Do not apply another negative scale to an imported hierarchy. Models whose authoring axes differ can be placed under a correction child; the geographic anchor remains unit scale.

## Position and orientation convenience methods

```csharp
using OpenArCloud.GeoPose;

var origin = new GeoPosition(60, 10, 100);
var frame = new GeoReference(origin);
var pose = new BasicPose(origin, Quaterniond.FromYpr(90, 45, 90));

// Geodetic ↔ ECEF; the pose overload also changes the orientation reference frame.
Vector3d ecefPosition = Wgs84.ToEcef(origin);
GeoPosition geodetic = Wgs84.FromEcef(ecefPosition);
Pose3d ecefPose = Wgs84.ToEcef(pose);
BasicPose restored = Wgs84.FromEcef(ecefPose);

Vector3d enu = frame.EcefToEnu(ecefPosition);
Vector3d ecefAgain = frame.EnuToEcefPosition(enu);
GeoPosition twoMetresEast = frame.EnuToGeodetic(new Vector3d(2, 0, 0));
Vector3d localUnity = frame.GeodeticToUnity(twoMetresEast);
GeoPosition positionAgain = frame.UnityToGeodetic(localUnity);

Vector3d unityAxes = UnityBasis.FromEnu(new Vector3d(2, 3, 4)); // (2,4,3)
Vector3d enuAgain = UnityBasis.ToEnu(unityAxes);
Vector3d localFromEcef = frame.EcefToUnity(ecefPosition);
Vector3d ecefFromLocal = frame.UnityToEcef(localFromEcef);

Pose3d unityPose = frame.GeoPoseToUnity(pose, BodyAxes.ForwardLeftUp);
BasicPose poseAgain = frame.UnityToGeoPose(unityPose, BodyAxes.ForwardLeftUp);
Pose3d localEcefPose = frame.EcefToUnity(ecefPose, BodyAxes.ForwardLeftUp);
Pose3d ecefPoseAgain = frame.UnityToEcef(localEcefPose, BodyAxes.ForwardLeftUp);
```

`Pose3d` is a position plus a proper rotation in whichever frame the method names specify; it is not an alternative Basic GeoPose JSON encoding. `GeoPoseJson.Parse` accepts Basic Quaternion **or** Basic YPR and validates required finite fields. `GeoPoseJson.Write(pose)` exports Quaternion; `Write(pose, true)` exports YPR. Quaternion inputs are normalized, zero/nonfinite inputs are rejected. At pitch ±90°, the YPR converter sets roll to zero and returns an equivalent yaw; Euler angles cannot uniquely recover both there. `q` and `−q` represent the same orientation.

## Place assets and cameras

Create **GameObject → GeoPose → Shared ENU scene**, set its origin, and use:

```csharp
using OpenArCloud.GeoPose;
using OpenArCloud.GeoPose.Unity;

// `scene` is a GeoPoseScene, `prefab` is a Unity GameObject.
var position = scene.Frame.EnuToGeodetic(new Vector3d(3, 5, 0));
var assetPose = new BasicPose(position, Quaterniond.FromYpr(90, 0, 0));
GeoPoseAnchor asset = scene.Place(prefab, assetPose);
string yprJson = GeoPoseJson.Write(asset.geoPose, true);

// A normal, non-AR-tracked camera:
scene.ApplyWorld(camera.transform, cameraGeoPose, BodyAxes.CameraRightUpBack);
BasicPose cameraAgain = scene.CaptureCamera(camera);

// If gameplay moves an anchor, explicitly record the new geographic pose:
asset.CaptureTransform();
Pose3d assetEcef = asset.EcefPose;
asset.SetEcef(assetEcef);
```

`Place` creates a dedicated pose anchor and puts the imported prefab beneath it. Anchors must be direct children of their `GeoPoseScene`. Scene/anchor ancestors must have positive unit scale; model children may have their own scale. Inspector context menus apply/export JSON, apply geographic poses and capture edited transforms. Scene gizmos label East, North and Up.

## Origin changes and float precision

At Earth-sized magnitudes a float can lose centimetres or more. The implementation evaluates this in double precision:

```math
p_U = S B_o^{T}(p_{ECEF}-o_{ECEF}),\qquad
S=\begin{pmatrix}1&0&0\\0&0&1\\0&1&0\end{pmatrix}.
```

Here `B_o` has East, North and Up ECEF unit vectors as columns. The inverse is `pECEF = oECEF + B_o S pU`. Only the final small `pU` becomes a Unity `Vector3`.

`scene.Rebase(newOrigin)` changes the local frame and reprojects registered anchors from their stored **double geographic poses**, including their orientations. Call `CaptureTransform` first for anchors that have moved; static anchors never need float round trips. All managed objects, including an ordinary camera anchor, change Unity coordinates together. Unmanaged objects and physics state are the application's responsibility.

`scene.RebasePreservingTracking(newOrigin, trackedCamera)` preserves an AR tracking world's alignment while moving the geographic origin. It does not reset the AR session. Local anchoring cannot fix precision already lost in an extremely large AR tracking world; long-distance applications must also manage tracking-world resets and recapture after those resets. A 10 km anchor warning is a reminder to choose a nearer origin, not a guaranteed accuracy threshold.

For rotations, the complete mapping is:

```math
R_U = S B_o^{T} B_p R_G C,\qquad
R_G = B_p^{T} B_o S R_U C^{T}.
```

`B_p` is the ENU basis at the pose, `R_G` is its GeoPose quaternion matrix, and `C` maps the chosen Unity body into the GeoPose body. Both `S` and `C` have determinant −1. Their combination gives a proper rotation that can be represented by a quaternion. A single handedness reflection cannot be encoded as a quaternion. Copying quaternion components or swapping position axes alone does not perform this operation.

Height remains WGS84 ellipsoidal height. Floor estimates and terrain/sea-level heights do not change that datum. The ECEF inverse supports surface and near-Earth positions, including poles; the Earth's deep interior is intentionally unsupported, and longitude at an exact pole defaults to zero.

## Validation

From the repository root:

```sh
dotnet run --project wrappers/unity/Tests~/Core/CoreTests.csproj --configuration Release
python3 wrappers/unity/Tools~/generate-assets.py --check
```

The CI workflow checks the existing explainer JSON fixtures, all three body axes, +90° yaw, camera/glTF mappings, randomized WGS84 and full-pose round trips, pole handling, singularities, centimetre-scale ECEF displacements, rebasing, capture-time alignment, and mocked OSCP HTTP contracts. Mocked localization never uploads a real image.

For Unity tests, add `"testables": ["org.openarcloud.geopose"]` to the project manifest and run the package's **EditMode** tests. Those verify real `Transform` placement, rebase precision and AR content-root alignment. The sample README provides device checks. Neither Unity Editor compilation nor a real VPS/device localization is represented by the .NET CI result.

## Sources

- [Repository rotation explainer](../../docs/enu-ypr-quaternion.md)
- [Unity coordinate and rotation conventions](https://docs.unity3d.com/Manual/QuaternionAndEulerRotationsInUnity.html)
- [glTF coordinate system](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#coordinate-system-and-units)
- [glTFast X-reflection change](https://github.com/Unity-Technologies/com.unity.cloud.gltfast/blob/main/Packages/com.unity.cloud.gltfast/Documentation~/UpgradeGuides.md)

MIT licensed, including the generated sample assets.
