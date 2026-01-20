# GeoPoseWrappers
This is a monorepo for GeoPose-related libraries, wrappers, demos, and plans published and maintained by the Open AR Cloud Association as open source under  MIT licence. 

The goal of this project is to make it easier for developers to input/output OGC GeoPose between any systems and platforms that handles real world position and orientation. In short enable greater interoperability between such systems by making it easier to implement support for the encoding standard, and handle it correctly within each implementing system.

Open Geospatial Consortium GeoPose Standards Working Group is responsible for development and maintenance of a standard for geographically-anchored pose (GeoPose) with 6 degrees of freedom referenced to one or more standardized Coordinate Reference Systems (CRSs). In June 2022, the OGC Technical Committee approved the OGC GeoPose 1.0 Data Exchange Standard as an OGC Specification. 

## Repo layout

- `packages/`
- - `geopose-lib`: TypeScript/JavaScript transforms library in the form of an npm package. 
- `gepose-transforms/`: Language-specific implementations (C, C#, Java, Kotlin, Python, Swift).
- `wrappers/`: Higher-level wrappers and adapters to map between internal representation and  OGC GeoPose, and use of transforms when required.
- `integrations/`: Deeper system specific integrations to support handling GeoPose
- - cesium/cesium-geopose`: Cesium integration package (adapter + controller).
- `sandbox/`
-  - `cesium-demo`: Cesium-based visual verification demo.
-  - `cesium-transforms-test`: Cesium-based visual verification demo.
-  - `ar-local-frame-demo`: (NOT WORKING) Cesium- and three.js based visualization of how transform library assists in realizing AR usecase
- `devlog/`: Proposals, plans, and development logs.

## Status

The whole repo can be considered as an early  **alpha** version . This repo and its packages are highly likely to be subject to breaking changes.
The `geopose-lib` package is currently the focal point of the development wich currently is most in the domain of web based technologies.
The alpha release is available on npm: https://www.npmjs.com/package/geopose-lib
This repo is developed with the help of various agentic AI solutions, and caution is advisable until the repo owners declare the resources ready for production.

## License

MIT. The license is selected for comprehension and familiarity in the developer community.
OARC works for the benefit of all of humanity and regards our output as belonging to the public domain in perpetuity, so it is not intended to be subject to legal actions to prevent use or derivative work, in the spirit of the WTFPL (https://en.wikipedia.org/wiki/WTFPL).
