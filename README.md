# GeoPoseWrappers
Monorepo for GeoPose-related libraries, wrappers, demos, and plans. The goal is to
make it easy to input/output GeoPose and interoperate across systems and platforms.

## Repo layout

- `packages/geopose-lib`: TypeScript/JavaScript transforms library intended for npm publishing.
- `gepose-transforms/`: Language-specific implementations (C, C#, Java, Kotlin, Python, Swift).
- `wrappers/`: Higher-level wrappers and adapters around GeoPose transforms.
- `sandbox/cesium-transforms-test`: Cesium-based visual verification demo.
- `geopose-transforms-proposal.md`: API proposal and rationale.
- `transform-lib-improvements.md`: Planned improvements and extensions.
- `wrapper-plan.md`: Wrapper roadmap notes.
- `logfile_*.md`: Development logs and decisions.

## Status

Alpha. This repo and its packages are highly likely to be subject to breaking changes.
The `geopose-lib` package is published by the Open AR Cloud Association.
The alpha release is available on npm: https://www.npmjs.com/package/geopose-lib

## License

MIT. The license is selected for comprehension and familiarity in the developer community.
OARC works for the benefit of all of humanity and regards our output as belonging to the public domain in perpetuity, so it is not intended to be subject to legal actions to prevent use or derivative work, in the spirit of the WTFPL (https://en.wikipedia.org/wiki/WTFPL).
