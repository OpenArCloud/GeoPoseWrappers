# cesium-geopose

Cesium integration helpers for OGC GeoPose. This package is the home for a
lightweight adapter API and a GeoPoseController wrapper for Cesium. It also
re-exports GeoPose types from `geopose-lib` so downstream projects can share
common types.

## Install

```bash
npm install cesium geopose-lib cesium-geopose
```

## Types

```ts
import type { GeoPose, GeoPoseBYPR } from "cesium-geopose";
```

## Adapter usage

```ts
import {
  getCameraGeoPose,
  setCameraGeoPose,
  getEntityGeoPose,
  setEntityGeoPose,
  createEntityFromGeoPose
} from "cesium-geopose";

const pose = getCameraGeoPose(viewer.camera);
setCameraGeoPose(viewer.camera, pose);

const entityPose = getEntityGeoPose(entity);
if (entityPose) {
  setEntityGeoPose(entity, entityPose);
}

const { position, orientation } = createEntityFromGeoPose(pose);
viewer.entities.add({ position, orientation });
```

## Controller usage

```ts
import { GeoPoseController } from "cesium-geopose";

const geo = new GeoPoseController(viewer);
const cameraPose = geo.getCameraPose();
geo.flyCameraToPose(cameraPose, 2);
```

## Future work

The most seamless long-term path for GeoPose interoperability is direct
extension within the CesiumJS project itself (native GeoPose camera/entity
helpers on Viewer/Camera/Entity). A first-class CesiumJS API would eliminate
adapter glue code, align behavior with Cesium’s internal frame handling, and
make GeoPose support discoverable for the broader Cesium developer community.

## License

MIT
