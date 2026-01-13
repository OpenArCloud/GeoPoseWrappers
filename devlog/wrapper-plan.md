# Overview
Based on the OGC GeoPose encoding standard ( https://docs.ogc.org/is/21-056r11/21-056r11.html ) in this project we want to develop developer resources to promote the adpotion of this standard focusing initially on thethe two basic encoding targets Basic Quaternion and Basic YPR. The resources should including a set of wrappers/polyfills/shims for sending receiving GeoPose data into and out of systems (like APIs, SDKs, libraries, 3D engines etc) that handles data that are equivalent to geospatial 3d position and orientation (6 degrees of freedom in a gespatial frame of reference), also we would like to have a a core transform library that helps with basic transforms such as to and from a wgs84 ECEF 3D pose and GeoPose, or to and from 3d geometry that is placed on a utm projected plane (), this library should be initially made in typescript, but then ported to other languages.

## First task:

Can you make a library that contains two functions in Kotlin ToGeoPose(GeospatialPose) and FromGeoPose(GeoPose) that allows to convert between the two - do this inside the wrappers folder and the arcore subfolder

ARCore (Android) "GeospatialPose"
https://developer.android.com/reference/androidx/xr/runtime/math/GeospatialPose

## Second task:
Can you do the equivalen thing as for the ARCore but now for ARGeoAnchor in iOS
ARKit (iOS)
https://developer.apple.com/documentation/arkit/argeoanchor


## Third task:
Can you propose a set of useful generic transform methods for the GeoPose-transforms library (not implementing it just yet).

## Fourth task:
Create a Cesium extension/library that enables getting and setting poses using GeoPose format:

**Camera Operations:**
- `getGeoPose(camera): GeoPose` - Get current camera pose as GeoPose
- `setGeoPose(camera, geoPose: GeoPose)` - Set camera pose from GeoPose

**Entity/Object Operations:**
- `getEntityGeoPose(entity): GeoPose` - Get an entity's pose as GeoPose
- `setEntityGeoPose(entity, geoPose: GeoPose)` - Set an entity's pose from GeoPose

**Implementation Notes:**
- Cesium uses a right-handed ECEF coordinate system
- Camera orientation is expressed via heading/pitch/roll or direction/up vectors
- Entities use `position` (Cartesian3) and `orientation` (Quaternion in ECEF frame)
- Will need to handle ENU ↔ ECEF quaternion transformations
- Target: TypeScript/JavaScript library compatible with CesiumJS