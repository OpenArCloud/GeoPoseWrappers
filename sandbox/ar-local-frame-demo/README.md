# AR session-frame demo

Build the local packages using the [verification commands](../../docs/rotation-consistency.md#build-and-verify),
then run `npm run dev` in this directory. `npm test` checks the shared frame math.

The geographic overview uses a right-handed EUS scene: X East, Y Up, Z South.
The session's +X yaw increases counterclockwise from East toward North at the
device position. The session origin follows from the global camera position,
local camera position and session yaw. The local camera orientation is derived
from the same global observation and displayed in a Z-up basis parallel to
the session ground axes, so independent controls cannot make the two views disagree.

Camera GeoPose angles use native camera body axes (+X right, +Y up, −Z view).
Identity looks down; `(yaw=0, pitch=0, roll=90)` looks North. The orange asset
uses body +X forward, +Y left, +Z up; its arrow points along +X. All asset
angles are retained in both views. The session yaw model assumes gravity
alignment; this is a synthetic geometry demo, not a live VPS/AR integration.
