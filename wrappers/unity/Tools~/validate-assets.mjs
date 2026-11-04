import { readFile } from 'node:fs/promises';
import { validateBytes } from 'gltf-validator';
for (const name of ['arrow.glb', 'marker.glb']) {
  const bytes = await readFile(new URL(`../Samples~/OscpAr/Assets/${name}`, import.meta.url));
  const report = await validateBytes(new Uint8Array(bytes), { uri: name });
  if (report.issues.numErrors || report.issues.numWarnings) {
    throw new Error(`${name}: ${JSON.stringify(report.issues)}`);
  }
  console.log(`${name}: glTF validator passed without errors or warnings`);
}
