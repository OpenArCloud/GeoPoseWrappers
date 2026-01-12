# GeoPose + Cesium Sandbox

Interactive demo showcasing the GeoPose ↔ Cesium converter library.

## Features

- **Camera GeoPose**: Get and set camera position/orientation as OGC GeoPose
- **Entity GeoPose**: Create and manipulate 3D entities using GeoPose
- **Preset Locations**: Quick-jump to famous landmarks
- **Copy JSON**: Export GeoPose data in standard JSON format

## Quick Start

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

Then open http://localhost:5173 in your browser.

## What's Demonstrated

1. **Real-time Camera Tracking**: The current camera pose is displayed as GeoPose (lat/lon/height + quaternion in ENU frame)

2. **Camera Control**: Set camera position and orientation using GeoPose coordinates

3. **Entity Manipulation**: Create and position 3D objects using GeoPose

4. **Coordinate System Conversion**: Automatic conversion between:
   - GeoPose ENU (East-North-Up) frame
   - Cesium ECEF (Earth-Centered Earth-Fixed) frame

## Library Usage

```typescript
import {
  getCameraGeoPose,
  setCameraGeoPose,
  getEntityGeoPose,
  setEntityGeoPose
} from './lib/GeoPoseConverter';

// Get current camera pose
const pose = getCameraGeoPose(viewer.camera);
console.log(pose);
// {
//   position: { lat: 48.8584, lon: 2.2945, h: 1000 },
//   quaternion: { x: 0, y: 0, z: 0, w: 1 }
// }

// Set camera from GeoPose
setCameraGeoPose(viewer.camera, {
  position: { lat: 40.7128, lon: -74.006, h: 500 },
  quaternion: { x: 0, y: 0, z: 0.38, w: 0.92 }
});

// Entity operations work similarly
const entityPose = getEntityGeoPose(myEntity);
setEntityGeoPose(myEntity, newPose);
```

## Notes

- The demo uses a default Cesium Ion token. For production use, get your own at [cesium.com](https://cesium.com/ion/)
- GeoPose orientation quaternion is in the local ENU frame (X=East, Y=North, Z=Up)
