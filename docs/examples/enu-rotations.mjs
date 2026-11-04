// Run from the repository root after: npm install --no-save geopose-lib@0.0.2
// Uses the published npm package, not a relative import of repository source.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GeoPoseBasic, yprToQuaternion, quaternionToYPR } from 'geopose-lib';

const fixtures = JSON.parse(await readFile(
  new URL('./enu-rotation-poses.json', import.meta.url), 'utf8'
));
const near = (actual, expected) => assert.ok(
  Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`
);

// For a unit Hamilton quaternion, these are the object axes expressed in ENU.
// This verifies physical directions, not only a conversion round trip.
function axesInENU({ x, y, z, w }) {
  return {
    x: [1 - 2*(y*y + z*z), 2*(x*y + w*z), 2*(x*z - w*y)],
    y: [2*(x*y - w*z), 1 - 2*(x*x + z*z), 2*(y*z + w*x)],
    z: [2*(x*z + w*y), 2*(y*z - w*x), 1 - 2*(x*x + y*y)]
  };
}

for (const sequence of fixtures.sequences) {
  for (const sample of sequence.poses) {
    const basicQuaternion = yprToQuaternion(sample.basicYPR);
    const basicYPR = quaternionToYPR(sample.basicQuaternion);
    const expected = sample.basicQuaternion.quaternion;
    const actual = basicQuaternion.quaternion;
    // q and -q represent the same rotation.
    const dot = ['x', 'y', 'z', 'w'].reduce((s, key) => s + actual[key]*expected[key], 0);
    near(Math.abs(dot), 1);
    for (const key of ['yaw', 'pitch', 'roll']) {
      near(basicYPR.angles[key], sample.basicYPR.angles[key]);
    }
    const axes = axesInENU(actual);
    for (const key of ['x', 'y', 'z']) {
      axes[key].forEach((component, index) => near(component, sample.axesInENU[key][index]));
    }

    const { yaw, pitch, roll } = sample.basicYPR.angles;
    const convenient = GeoPoseBasic.fromYPR(sample.basicYPR.position, yaw, pitch, roll);
    const convenienceQ = convenient.toGeoPose().quaternion;
    for (const key of ['x', 'y', 'z', 'w']) near(convenienceQ[key], actual[key]);
    console.log(`${sample.id}: PASS`, JSON.stringify(basicQuaternion));
  }
}
console.log('Both sequences passed: quaternion, YPR, object-axis directions, and GeoPoseBasic.');
