# OSCP GeoPose AR demo

This sample captures an AR camera background, calls an OARC OSCP GeoPose service, aligns a shared geographic scene, then loads three bundled GLBs a few metres in front of the localized camera. An optional second mode discovers geographically anchored GLBs through an OSCP Spatial Content Discovery Service (CDS).

MultiSet's **OSCP** endpoint is the default. Live use requires your own active, georeferenced map and credentials. The sample has not been validated on a physical device or against a live VPS account; complete the checks below before relying on its alignment.

## Create the Unity project

1. Use a Unity 6 project with the Built-in Render Pipeline. Install the [wrapper](../../README.md), AR Foundation 6, Input System, XR Core Utilities, the matching ARCore or ARKit XR Plugin, and `com.unity.cloud.gltfast` 6.x. Enable your platform's XR provider in XR Plug-in Management and enable the new Input System in Player settings. Use matching AR Foundation/provider versions.
2. Import **OSCP AR localization and GLB content** from the package's Samples tab. The base wrapper can be used without importing this sample or its AR/glTF dependencies.
3. Run **GeoPose → Create OSCP AR demo scene**, then save the scene and include it in the build. This creates an AR Session, tracked camera, plane manager, geographic root, lighting and demo controls. It copies the two bundled GLBs into `Assets/StreamingAssets/GeoPoseDemo` for runtime loading. Existing files of those two names are replaced when you run the scene builder again.
4. Edit the imported `Config/geopose-demo.json`. Set the MultiSet `mapCode`, leaving `mapSetCode` empty, or use `mapSetCode` alone. Add other endpoint objects with distinct IDs to the `endpoints` array; select one via `selectedEndpoint` or the demo UI.
5. Configure camera permission descriptions for iOS / Android, and location permission only if using the optional location hint. Include glTFast's runtime shaders in the player as described in its [shader documentation](https://github.com/Unity-Technologies/com.unity.cloud.gltfast/blob/main/Packages/com.unity.cloud.gltfast/Documentation~/ProjectSetup.md); assets loaded solely at runtime cannot keep otherwise-unused shader variants from being stripped. The sample scene builder does not edit your platform signing, permissions or render-pipeline configuration.
6. Build to an AR-capable device. If adapting to URP, add the AR background renderer feature and use the matching glTFast materials. Validate the captured preview again after changing render pipelines.

There are no secret values in the supplied configuration. `.env.example` lists the supported variable names, but Unity does not automatically load `.env` files.

## Authentication

For a desktop development session, obtain a short-lived token using Node 20+:

```sh
# Set MULTISET_CLIENT_ID and MULTISET_CLIENT_SECRET securely in this shell first.
export MULTISET_ACCESS_TOKEN="$(node wrappers/unity/Tools~/multiset-token.mjs)"
# Start Unity from this environment, or paste the resulting short-lived token in the device demo.
```

The helper calls MultiSet's M2M token endpoint with HTTP Basic authentication and prints only the token to stdout; expiry goes to stderr. Never commit the resulting values. Do not put a MultiSet client secret into Unity assets, Resources, StreamingAssets, player settings or a mobile binary.

For a quick device test, paste a **short-lived bearer token** into the demo's masked input. It is held only in memory. The environment variable is a desktop fallback; a mobile build does not inherit the developer's shell environment. A separate field/environment variable supplies CDS authentication when needed. Each endpoint can name its own `bearerTokenEnvironment`.

For an application, implement `IAccessTokenProvider` and assign `OscpArDemo.TokenProvider` before `Start`. It receives the configured credential name and a cancellation token. Fetch/refresh credentials through your authenticated backend or platform-secure credential flow; keep M2M credentials on the backend, cache the server's `expiresOn`, and refresh before expiry. The demo's pasted-token mode does not refresh automatically. `OscpClient` attaches credentials only to the corresponding service request; it does not give VPS/CDS tokens to GLB hosts. The sample uses no HTTP redirects for authenticated service requests.

## Localization and the initial origin

Tap **Capture preview**. Check that the image is upright and readable text is not mirrored. Tap **Localize — send preview image** to submit it to the selected endpoint.

The image comes from the provider's display-oriented AR background, without virtual assets or UI. Intrinsics are derived from the corresponding camera projection at the same output aspect ratio, so they describe the displayed crop rather than the raw sensor buffer. Capture retains that frame's Unity camera pose before the HTTP request. On a production capture path, verify sensor-time versus displayed-pose synchronization on each device; the sample's timestamp is wall-clock time at capture, not a hardware sensor timestamp.

On the **first successful VPS response**, the origin is:

```text
latitude  = VPS latitude
longitude = VPS longitude
height    = VPS ellipsoidal height − estimated camera-to-ground distance
```

The default distance is **1.5 m**, configurable through `eyeHeightMetres`. When enabled, the sample searches tracked upward-facing horizontal planes directly under the captured camera, within 0.3–3 m and inside each plane's boundary. It uses the nearest such surface. This is a geometric estimate: a tabletop can qualify. The UI displays the chosen distance; disable surface estimation to use the explicit fallback, or replace this selection with your application's floor-classification/user-selection logic. It never substitutes AR's arbitrary world Y coordinate for WGS84 height.

The camera's GeoPose retains its full returned height. Only the scene origin moves down, making the initial camera roughly `(0,1.5,0)` in local Unity coordinates. Later localization responses update alignment while preserving the initial origin and existing asset GeoPoses. **Rebase near current camera** is an explicit, separate operation.

AR Foundation continues to drive the camera. Let `T_C` be the tracked camera pose at capture and `G_C` the converted geographic camera pose in the local scene. The content root receives:

```math
T_{world\leftarrow scene}=T_C G_C^{-1}.
```

Using the camera's pose when the response arrives would incorrectly attach network-latency motion to the localization. The sample preserves the captured pose instead. Loss of tracking invalidates an outstanding capture/result and hides previously aligned content until re-localization. If your app explicitly resets or moves the XR Origin, invalidate captures and re-localize too.

### Endpoint camera axes

Every endpoint must return ordinary Basic Quaternion GeoPose in right-handed **East/North/Up**. `cameraAxes` separately states the body's axes:

| Config value | Returned camera body |
|---|---|
| `RightUpBack` (sample default) | +X right, +Y up, −Z optical view |
| `RightDownForward` | +X right, +Y down, +Z optical view |
| `ForwardLeftUp` | +X optical view, +Y left, +Z up |

The camera preset is an **explicit integration assumption to verify with the provider**; the OSCP JSON shape alone does not declare it. `CameraConventions.ToRightUpBack` normalizes the selected body to the wrapper camera convention. This does not convert a provider-specific world frame. In particular, MultiSet's native Map Query documentation also describes a nested `GeoPose` with `frame_spec: Y-Up-ENU`; that is not the Basic ENU OSCP response consumed here. Do not copy that native field into this parser or assume the two endpoints have identical frame semantics.

The client sends OSCP v2 typed readings, a PINHOLE model `[fx,fy,cx,cy]`, and an already-normalized image with `rotation:0, mirrored:false`. Empty privacy arrays make no retention-policy claims; agree an appropriate policy with the service for your application. MultiSet's map selectors are query parameters. Alternatively remove both selectors and enable `includeLocationHint` for coordinate-based map selection; validate the device location permission/coverage first. A `no_map_in_range` error is retained separately from an ordinary localization failure. Nominal response accuracy is not treated as per-request confidence.

## Bundled GLBs and discovery variant

The sample creates three object GeoPoses from the localized camera's horizontal viewing direction: 3, 4 and 5 m forward, with lateral offsets −1.5, 0 and +1.5 m. Height uses the same estimated camera-to-ground distance. These are illustrative placements on an approximate plane, not terrain following. Assets use the semantic `ForwardLeftUp` preset and retain their original geographic poses during subsequent localization.

`Assets/marker.glb` and `Assets/arrow.glb` are original MIT-licensed meshes, generated by `Tools~/generate-assets.py` with metres, +Y up and +Z model-forward. Replace these files or call the sample's GLB loading pattern with other assets. Each imported hierarchy sits below a geographic anchor; no extra handedness scale is applied.

For CDS mode, set `discovery.enabled=true`, your CDS `url`, `topic`, `h3Indexes`, and an `assetBaseUrl` for relative content URLs. Generate the venue's coverage cells once during setup:

```sh
cd wrappers/unity/Tools~
npm ci
node h3-coverage.mjs 60 10 1 8
```

Copy `h3Indexes` from the output into the config. These cover the configured venue; they do not automatically follow the user worldwide. Regenerate them for another venue or have your application update the coverage cells as the user moves. Resolution must match your CDS deployment's indexing policy.

The client calls `GET /scrs/{topic}?h3Index={cell}`, deduplicates SCR IDs, and reads `content.geopose` and `content.refs` entries with `contentType: model/gltf-binary`. Call `Discover(config, camera.position, cancellationToken)` with the localized camera position: it filters by ECEF distance **before** applying `maxAssets`, so distant records and duplicates cannot crowd out nearby content. It continues through the configured cells until the limit is filled with eligible assets or coverage is exhausted. Results follow service/cell order; they are not sorted by nearest distance. This sample loads GLB references; JSON `.gltf` resources and arbitrary `framedPose` definitions are not interpreted. Use public or appropriately signed asset URLs; service credentials are not forwarded to content hosts.

Set `discovery.bodyAxes` to match the content publisher's body convention. The default `ForwardLeftUp` means semantic upright model poses. Choose `GltfSourceXReflection` if the GeoPose was assigned to raw glTF source axes. The content record does not let the wrapper infer an asset's visual front.

## Checks before a device demo

- Run core/protocol CI and Unity EditMode tests, then build the player. The .NET tests do not compile Unity-specific code.
- Verify preview orientation and camera intrinsics on both portrait and landscape configurations you intend to support. Do not compensate for a mirrored image by changing only its metadata.
- At a known site, check the provider's camera body convention and ellipsoidal height. Compare a level north-facing camera against the documented quaternion fixture.
- After capture, move the device before the result arrives: fixed content should remain anchored. Test loss/recovery of tracking and explicit XR Origin resets.
- Check the initial surface estimate, bundled GLB orientation, CDS asset orientation, and shader inclusion in an actual build.
- Rebase with centimetre-separated anchors and confirm their relative spacing is retained. Test any application-specific physics or unmanaged objects separately.

No live credentials, VPS requests or physical-device test results are included in this repository.

## Protocol and implementation references

- [OARC GeoPose Protocol](https://github.com/OpenArCloud/oscp-geopose-protocol)
- [MultiSet OSCP endpoint](https://docs.multiset.ai/fundamentals/rest-api-docs/oscp-geopose)
- [MultiSet authentication](https://docs.multiset.ai/fundamentals/rest-api-docs/authentication)
- [MultiSet native GeoPose field](https://docs.multiset.ai/fundamentals/localization/geopose-support)
- [OSCP Spatial Content Discovery](https://github.com/OpenArCloud/oscp-spatial-content-discovery)
- [Unity AR background image capture](https://docs.unity3d.com/Packages/com.unity.xr.arfoundation@6.0/manual/features/camera/image-capture.html)
- [glTFast runtime loading](https://github.com/Unity-Technologies/com.unity.cloud.gltfast/blob/main/Packages/com.unity.cloud.gltfast/Documentation~/ImportRuntime.md)
