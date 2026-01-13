# GeoPose + Cesium Demo

Interactive demo showcasing the GeoPose ↔ Cesium converter library, enabling interoperability between the [OGC GeoPose standard](https://docs.ogc.org/is/21-056r11/21-056r11.html) and CesiumJS.

## Prerequisites

- **Node.js** 18+ (recommended: use [nvm](https://github.com/nvm-sh/nvm) or [fnm](https://github.com/Schniz/fnm))
- **npm** (comes with Node.js)

## Installation

```bash
# Navigate to this directory
cd sandbox/cesium-transforms-test

# Install dependencies
npm install
```

## Environment Setup

Create a local env file for API keys:

```bash
cp .env.example .env.local
```

Then fill in values as needed:

```
VITE_CESIUM_ION_TOKEN=your-cesium-ion-token
VITE_GOOGLE_MAPS_API_KEY=your-google-maps-api-key
```

## Running the Demo

### Development Mode

```bash
npm run dev
```

Open http://localhost:5173 in your browser.

### Production Build

```bash
# Build for production
npm run build

# Preview the production build
npm run preview
```

## Cesium Ion Token (Optional but Recommended)

The demo works without a token using basic OpenStreetMap imagery. For higher-quality terrain and imagery (Bing Maps, Cesium World Terrain), you'll need a free Cesium Ion token.

### How to Get a Token

1. Go to [https://cesium.com/ion/](https://cesium.com/ion/)
2. Click **"Sign up"** (free account)
3. After signing in, go to **"Access Tokens"** in the left sidebar
4. Copy your **default token** or create a new one

### Adding Your Token

Set `VITE_CESIUM_ION_TOKEN` in `.env.local`:

```
VITE_CESIUM_ION_TOKEN=your-cesium-ion-token
```

### What the Token Enables

| Feature | Without Token | With Token |
|---------|--------------|------------|
| Globe imagery | OpenStreetMap | Bing Maps (higher quality) |
| Terrain | Flat ellipsoid | Cesium World Terrain (3D mountains) |
| Geocoder search | Disabled | Enabled |
| Other Ion assets | No | Yes |

## Google Photorealistic 3D Tiles (Optional)

To enable Google Photorealistic 3D Tiles, add your Google Maps API key:

```
VITE_GOOGLE_MAPS_API_KEY=your-google-maps-api-key
```

Then use the **"Enable Photorealistic Tiles"** button in the UI.

## Features

- **Real-time Camera Tracking**: Current camera pose displayed as GeoPose (lat/lon/height + quaternion in ENU frame)
- **Camera Control**: Set camera position and orientation using GeoPose coordinates
- **Entity Manipulation**: Create and position 3D objects using GeoPose
- **Preset Locations**: Quick-jump to famous landmarks (Eiffel Tower, Statue of Liberty, etc.)
- **Copy JSON**: Export GeoPose data in standard JSON format
- **Coordinate System Conversion**: Automatic conversion between GeoPose ENU and Cesium ECEF frames

## Library API

```typescript
import {
  getCameraGeoPose,
  setCameraGeoPose,
  flyCameraToGeoPose,
  getEntityGeoPose,
  setEntityGeoPose,
  createEntityFromGeoPose,
  type GeoPoseBQ
} from './lib/GeoPoseConverter';

// Get current camera pose
const pose: GeoPoseBQ = getCameraGeoPose(viewer.camera);
// {
//   position: { lat: 48.8584, lon: 2.2945, h: 1000 },
//   quaternion: { x: 0, y: 0, z: 0, w: 1 }
// }

// Set camera instantly
setCameraGeoPose(viewer.camera, pose);

// Fly camera with animation (2 second duration)
flyCameraToGeoPose(viewer.camera, pose, 2);

// Entity operations
const entityPose = getEntityGeoPose(myEntity);
setEntityGeoPose(myEntity, newPose);

// Create new entity from GeoPose
const { position, orientation } = createEntityFromGeoPose(geoPose);
viewer.entities.add({ position, orientation, /* ... */ });
```

## GeoPose Format

The demo uses **OGC GeoPose Basic-Quaternion (GeoPoseBQ)** format:

```typescript
interface GeoPoseBQ {
  position: {
    lat: number;  // Latitude in degrees (WGS84)
    lon: number;  // Longitude in degrees (WGS84)
    h: number;    // Height in meters above WGS84 ellipsoid
  };
  quaternion: {
    x: number;
    y: number;
    z: number;
    w: number;
  };
}
```

The quaternion represents orientation in the **local ENU (East-North-Up) tangent plane**:
- **X+** points East
- **Y+** points North
- **Z+** points Up

## Tech Stack

- **Svelte 4** - UI framework
- **TypeScript** - Type safety
- **Vite 5** - Build tool
- **CesiumJS** - 3D globe visualization

## Troubleshooting

### Globe not appearing
- Check browser console for errors
- Ensure `npm install` completed successfully
- Try clearing browser cache and refreshing

### "Ion token invalid" errors
- The demo works without a token (with limited imagery)
- Get a free token from [cesium.com/ion](https://cesium.com/ion/) for full features

### Build errors
- Ensure Node.js 18+ is installed: `node --version`
- Delete `node_modules` and `package-lock.json`, then run `npm install` again
