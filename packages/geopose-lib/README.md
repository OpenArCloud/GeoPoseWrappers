# geopose-lib

Transforms and helpers for OGC GeoPose in JavaScript/TypeScript. The library
works with GeoPose Basic Quaternion (GeoPose) and Basic YPR (GeoPoseBYPR).

## Status

Alpha (0.0.1). This version is highly likely to be subject to breaking changes.
The package is published by the Open AR Cloud Association.

## Install

```bash
npm install geopose-lib
```

## Quick start

```ts
import {
  GeoPoseBasic,
  type GeoPose,
  type GeoPoseBYPR,
  yprToQuaternion,
  translateGeoPose
} from "geopose-lib";

const pose: GeoPose = {
  position: { lat: 48.8584, lon: 2.2945, h: 50 },
  quaternion: { x: 0, y: 0, z: 0, w: 1 }
};

const shifted = translateGeoPose(pose, { east: 5, north: 10, up: 0 });

const ypr: GeoPoseBYPR = {
  position: { lat: 51.5007, lon: -0.1246, h: 30 },
  angles: { yaw: 90, pitch: 0, roll: 0 }
};

const asQuaternion = yprToQuaternion(ypr);

const basic = GeoPoseBasic.fromGeoPose(asQuaternion)
  .translateNorth(25)
  .rotateAroundUpAxis(15);

const backToYpr = basic.toGeoPoseYPR();
console.log(backToYpr.angles.yaw);
```

## Notes

- Yaw/pitch/roll are in degrees for the YPR helpers.
- GeoPoseBasic stores a Basic Quaternion internally and exposes convenience
  getters/setters for YPR and component access.

## Development

```bash
npm test
npm run build
```

## License

MIT. The license is selected for comprehension and familiarity in the developer community.
OARC works for the benefit of all of humanity and regards our output as belonging to the public domain in perpetuity, so it is not intended to be subject to legal actions to prevent use or derivative work, in the spirit of the WTFPL (https://en.wikipedia.org/wiki/WTFPL).
