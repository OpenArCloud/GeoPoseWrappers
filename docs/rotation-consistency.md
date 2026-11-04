# Rotation consistency audit and migration

The convention throughout the source is active, right-handed, intrinsic Z–Y–X:
`q = qz(yaw) * qy(pitch) * qx(roll)`. GeoPose orientation maps **body axes into
local ENU**. Positive yaw rotates East toward North, counterclockwise when
viewed from +Up toward the origin. Pitch and roll use the rotated body axes.
See the [illustrated guide](enu-ypr-quaternion.md) for the math and golden JSON.

## Review findings and changes

The audit started from `b06f05e5a1792030ae655ec7fe947afa176fae1d` and covered
the core TypeScript package, standalone Cesium converter/serializer, packaged
Cesium adapter/controller, Kotlin and Swift wrappers, all three sandbox apps,
duplicate demo entry points, and the fixture/test code. Historical devlogs
remain historical; they are not current API contracts.

| Area | Finding | Corrected source behavior |
| --- | --- | --- |
| Core and native YPR → quaternion | Formulas already agreed with the guide | Signs/order retained; misleading compass and pitch comments corrected |
| Quaternion → YPR | Mixed angles at ±90° pitch could reconstruct the wrong rotation | Normalize input, reject undefined rotations, choose roll zero at gimbal lock consistently across languages |
| Cesium camera | Compass heading was passed directly to mathematical yaw | Convert actual camera world basis to/from ENU; setView/flyTo receive ECEF direction/up vectors |
| Cesium entity and ENU/ECEF | Quaternion composition already correct | Retained; tested against physical axes at northern/southern locations |
| Fixed East/North rotation helpers | Added Euler components, rotating about body axes after an initial yaw | Premultiply rotations about the named fixed ENU axes |
| Relative orientation | Ignored base orientation; identity reset a rotated base | `relative = inverse(base) * target`; apply as `base * relative`, transporting tangent frames via ECEF |
| Small-angle interpolation | Used the midpoint regardless of `t` | Normalized interpolation with the requested `t`, including endpoints |
| AR demo | Used a reflected East/Up/North frame, yaw sign flips, and discarded pitch/roll | Right-handed East/Up/South scene, full quaternion composition, common transforms for all views |
| Native wrapper compilation | Kotlin imports were below declarations; Swift used unsupported float/double quaternion initializers and exposed iOS-only types on macOS | Imports moved, components converted explicitly, iOS APIs platform-gated; executable wrapper tests added |
| Duplicate demos | Independent adapter/component copies could drift | Compatibility entries delegate to maintained implementations |
| Projected positions | Comments implied grid axes always align with ENU | Orientation remains true local ENU; no grid-convergence correction is implied |

## Compatibility and body axes

These are corrections to alpha APIs. No npm release is made by this change.
Build the local packages below to try the corrected source.

**Cesium cameras (3D mode):** body +X is screen-right, +Y screen-up, −Z the
view direction. Identity GeoPose looks down with screen-up North. YPR
`(0, 0, 90)` looks North along the horizon; `(-90, 0, 90)` looks East.
Native Cesium compass heading still increases clockwise from North. Do not
pass its HPR values to GeoPose YPR helpers. To migrate old adapter output,
recover the old numeric YPR with the old helper, apply those values as native
Cesium camera heading/pitch/roll, then read the camera with the corrected
`getCameraGeoPose`. Simply negating the quaternion's z component is insufficient.
The adapters are for 3D world poses; the demos keep the viewer in 3D mode.

**Entities/models:** preserve the entity's body axes. A model's visual nose
can differ from its body +X; any model-specific fixed rotation belongs in
the model setup. The AR demo's asset arrow explicitly points along body +X.

**ARCore/ARKit:** EUS↔ENU basis changes already used the correct premultiplied
±90° X rotation. They preserve body axes, including camera −Z forward.
The Swift data wrapper requires a georeferenced true-EUS rotation. An
arbitrary `.gravity` session needs a separate session-to-geographic transform;
merely having Y up does not establish North. `createGeoAnchor` is position-only
because the ARGeoAnchor initializer does not accept arbitrary orientation;
preserve/apply the supplied rotation separately to content. This change does
not claim new support for arbitrary unaligned AR sessions.

**Heading aliases:** `GeoPoseBasic.heading`, `headingDegrees`, `headingRad`,
and the standalone legacy `hprToQuaternion`/`quaternionToHpr` helpers keep
their mathematical-yaw semantics. They do not implement compass heading.

**Fixed vs body axes:** `rotateAroundNorthAxis` and `rotateAroundEastAxis`
now honor their names even after a yaw. To reproduce the guide's intrinsic
sequence, set its absolute YPR triples, or postmultiply body-axis rotations.
`rotateByQuaternion` premultiplies a fixed-ENU rotation.

**Relative poses:** translation retains its existing `east/north/up` fields
and means displacement in the base position's ENU tangent plane. Rotation
is now relative to the base body, so identity preserves the base orientation.
This API is not a body-coordinate translation vector. If you relied on its
old absolute ENU orientation behavior, use `geoPoseToLocalENU` and
`localENUToGeoPose` directly. ECEF interpolation follows a straight chord;
it is not a surface-following geodesic.

## Build and verify

From the repository root (Node.js 22 or newer):

```sh
npm ci --prefix packages/geopose-lib
npm test --prefix packages/geopose-lib
npm run build --prefix packages/geopose-lib
npm ci --prefix integrations/cesium/cesium-geopose
npm test --prefix integrations/cesium/cesium-geopose
npm run build --prefix integrations/cesium/cesium-geopose
npm ci --prefix sandbox/ar-local-frame-demo
npm test --prefix sandbox/ar-local-frame-demo
npm run build --prefix sandbox/ar-local-frame-demo
npm ci --prefix sandbox/cesium-demo
npm run build --prefix sandbox/cesium-demo
npm ci --prefix sandbox/cesium-transforms-test
npm run build --prefix sandbox/cesium-transforms-test
```

The integration's development dependency and the sandbox dependencies point
to these local packages. Build the core before the adapter and both before
the demos. Rebuild them after changing library source. Library peer dependencies
still use published version ranges for downstream installations.

With a JDK and Python 3, compile and exercise the real Kotlin wrapper:

```sh
python3 wrappers/arcore/test/run.py
```

On macOS with the Swift toolchain, compile and exercise the real Swift wrapper:

```sh
swiftc wrappers/arkit/GeoPoseConverter.swift wrappers/arkit/test/RotationTest.swift -o /tmp/geopose-swift-test
/tmp/geopose-swift-test docs/examples/enu-rotation-poses.json
```

The CI workflow repeats these tests and builds. Tests check physical axis
directions against the guide's golden fixtures, not just round trips.
Cesium checks use the real Camera math without a WebGL scene and include a
nonidentity camera reference transform. AR demo tests verify position and
full orientation agree between its session and geographic views.

Native tests exercise wrapper math and serialization, not live tracking or
localization accuracy. Device AR sessions, hardware sensors, remote imagery
and model-specific mesh axes still need application/device validation.
