# GeoPose-Transforms Library Proposal

A core transformation library for working with OGC GeoPose data, providing essential coordinate system conversions and spatial operations.

## Design Goals

1. **Standards Compliant**: Full support for OGC GeoPose (Basic Quaternion) and Basic-YPR encodings
2. **High Precision**: Use double-precision floating point throughout
3. **Framework Agnostic**: No dependencies on AR/VR frameworks
4. **Multi-Language**: Initial TypeScript implementation, then port to other languages
5. **Well Tested**: Comprehensive test suite with known reference points

---

## Proposed API

### 1. Core Type Definitions

```typescript
// OGC GeoPose (Basic Quaternion)
interface GeoPose {
  position: { lat: number; lon: number; h: number };
  quaternion: { x: number; y: number; z: number; w: number };
}

// OGC GeoPose Basic YPR (Yaw-Pitch-Roll)
interface GeoPoseBYPR {
  position: { lat: number; lon: number; h: number };
  angles: { yaw: number; pitch: number; roll: number }; // degrees
}

// ECEF Cartesian coordinates
interface ECEF { x: number; y: number; z: number; }

// ENU local tangent plane
interface ENU { east: number; north: number; up: number; }

// UTM coordinates
interface UTM {
  easting: number;
  northing: number;
  zone: number;
  hemisphere: 'N' | 'S';
}
```

---

### 2. GeoPose ↔ GeoPose Conversions

#### `quaternionToYPR(geoPose: GeoPose): GeoPoseBYPR`
Convert Basic-Quaternion to Basic-YPR representation.

#### `yprToQuaternion(geoPose: GeoPoseBYPR): GeoPose`
Convert Basic-YPR to Basic-Quaternion representation.

**Use Case**: UI display (YPR is more human-readable), interoperability with systems preferring Euler angles.

---

### 3. GeoPose ↔ ECEF Conversions

#### `geoPoseToECEF(geoPose: GeoPose): { position: ECEF; orientation: Quaternion }`
Convert GeoPose to Earth-Centered Earth-Fixed coordinates with orientation expressed relative to ECEF axes.

#### `ecefToGeoPose(ecef: ECEF, orientation: Quaternion): GeoPose`
Convert ECEF position and orientation back to GeoPose.

**Use Case**: Integration with global 3D engines, satellite positioning systems, physics simulations in Earth-centered frames.

---

### 4. GeoPose ↔ Local Tangent Plane (ENU)

#### `geoPoseToLocalENU(geoPose: GeoPose, origin: LLH): { position: ENU; orientation: Quaternion }`
Express a GeoPose relative to a local ENU tangent plane at a given origin.

#### `localENUToGeoPose(enu: ENU, orientation: Quaternion, origin: LLH): GeoPose`
Convert local ENU coordinates back to global GeoPose.

**Use Case**: Local scene rendering, AR applications, surveying, robotics navigation.

---

### 5. GeoPose ↔ UTM Conversions

#### `geoPoseToUTM(geoPose: GeoPose): { position: UTM & { h: number }; orientation: Quaternion }`
Convert GeoPose position to UTM with height, orientation remains in local tangent frame.

#### `utmToGeoPose(utm: UTM, h: number, orientation: Quaternion): GeoPose`
Convert UTM coordinates back to GeoPose.

**Use Case**: GIS integration, mapping applications, large-area surveys.

---

### 6. Relative Pose Operations

#### `getRelativePose(from: GeoPose, to: GeoPose): { translation: ENU; rotation: Quaternion }`
Calculate the relative pose between two GeoPoses (how to get from `from` to `to`).

#### `applyRelativePose(base: GeoPose, relative: { translation: ENU; rotation: Quaternion }): GeoPose`
Apply a relative transformation to a base GeoPose.

#### `interpolatePose(from: GeoPose, to: GeoPose, t: number): GeoPose`
Spherical linear interpolation (SLERP) between two poses (t: 0-1).

**Use Case**: Animation, trajectory planning, pose averaging, smooth transitions.

---

### 7. Translation & Movement

#### `translateGeoPose(geoPose: GeoPose, translation: ENU): GeoPose`
Move a GeoPose by an ENU offset (in the local tangent plane).

#### `translateByBearingDistance(geoPose: GeoPose, bearing: number, distance: number, deltaH?: number): GeoPose`
Move along a bearing (degrees from north) by a distance (meters).

#### `rotateGeoPose(geoPose: GeoPose, rotation: Quaternion): GeoPose`
Apply an additional rotation to the pose's orientation.

**Use Case**: Path following, waypoint navigation, viewpoint adjustment.

---

### 8. Orientation Utilities

#### `getForwardVector(geoPose: GeoPose): ENU`
Get the unit vector pointing in the "forward" direction of the pose.

#### `getUpVector(geoPose: GeoPose): ENU`
Get the unit vector pointing "up" from the pose.

#### `getRightVector(geoPose: GeoPose): ENU`
Get the unit vector pointing "right" from the pose.

#### `lookAt(position: LLH, target: LLH, up?: ENU): GeoPose`
Create a GeoPose at `position` oriented to look at `target`.

#### `getHeading(geoPose: GeoPose): number`
Extract compass heading (degrees from north) from orientation.

#### `getPitch(geoPose: GeoPose): number`
Extract pitch angle (degrees, positive = looking up).

**Use Case**: Camera control, direction indicators, alignment operations.

---

### 9. Distance & Geometry

#### `distanceBetween(pose1: GeoPose, pose2: GeoPose): number`
Calculate geodesic distance between two poses (meters).

#### `bearing(from: GeoPose, to: GeoPose): number`
Calculate initial bearing from one pose to another (degrees).

#### `midpoint(pose1: GeoPose, pose2: GeoPose): GeoPose`
Calculate the geographic midpoint (orientation averaged).

**Use Case**: Proximity detection, navigation, spatial queries.

---

### 10. Validation & Normalization

#### `isValidGeoPose(geoPose: GeoPose): boolean`
Check if a GeoPose has valid coordinates and normalized quaternion.

#### `normalizeGeoPose(geoPose: GeoPose): GeoPose`
Normalize quaternion and clamp coordinates to valid ranges.

#### `areApproximatelyEqual(pose1: GeoPose, pose2: GeoPose, tolerance?: { position: number; angle: number }): boolean`
Check if two poses are approximately equal within tolerances.

**Use Case**: Input validation, data cleanup, comparison operations.

---

### 11. Frame Conversion Utilities

These support integration with external systems that use different axis conventions.

#### `convertFrameENU_to_EUS(quaternion: Quaternion): Quaternion`
Convert orientation from ENU (GeoPose) to EUS (ARCore/ARKit).

#### `convertFrameEUS_to_ENU(quaternion: Quaternion): Quaternion`
Convert orientation from EUS to ENU.

#### `convertFrameENU_to_NED(quaternion: Quaternion): Quaternion`
Convert to North-East-Down (aviation/aerospace convention).

#### `convertFrameNED_to_ENU(quaternion: Quaternion): Quaternion`
Convert from NED to ENU.

**Use Case**: Integration with AR platforms, aviation systems, robotics frameworks.

---

## Implementation Priority

### Phase 1: Core Essentials
1. Type definitions
2. `quaternionToYPR` / `yprToQuaternion`
3. `geoPoseToECEF` / `ecefToGeoPose`
4. `normalizeGeoPose` / `isValidGeoPose`

### Phase 2: Local Operations
5. `geoPoseToLocalENU` / `localENUToGeoPose`
6. `translateGeoPose`
7. `translateByBearingDistance`
8. `distanceBetween` / `bearing`

### Phase 3: Advanced Operations
9. `getRelativePose` / `applyRelativePose`
10. `interpolatePose`
11. Orientation utilities (`getForwardVector`, `lookAt`, etc.)
12. Frame conversion utilities

### Phase 4: Extended Support
13. UTM conversions
14. Additional validation utilities
15. Batch operations for arrays of poses

---

## Reference Constants

```typescript
const WGS84 = {
  a: 6378137.0,              // Semi-major axis (meters)
  b: 6356752.314245,         // Semi-minor axis (meters)
  f: 1 / 298.257223563,      // Flattening
  e: 0.0818191908426,        // First eccentricity
  e2: 0.00669437999014,      // First eccentricity squared
};
```

---

## Testing Strategy

1. **Round-trip tests**: Convert A→B→A and verify original values
2. **Known reference points**: Use surveyed landmarks with known coordinates
3. **Edge cases**: Poles, date line, equator, extreme altitudes
4. **Cross-validation**: Compare with established libraries (proj4, GeographicLib)
5. **Numerical precision**: Verify accuracy to centimeter level for positions

---

## Language Ports

After TypeScript implementation:

1. **Kotlin** - Android/JVM (priority for ARCore integration)
2. **Swift** - iOS (priority for ARKit integration)
3. **Python** - Scientific computing, GIS workflows
4. **Rust** - Performance-critical applications
5. **C#** - Unity integration

---

## Dependencies

The TypeScript implementation should minimize dependencies:

- **Required**: None (pure TypeScript)
- **Optional**: `proj4` for UTM conversions (if high accuracy needed)
- **Testing**: Standard test frameworks (Jest, Vitest)
