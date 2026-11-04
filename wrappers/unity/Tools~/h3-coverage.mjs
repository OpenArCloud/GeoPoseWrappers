import { latLngToCell, gridDisk } from 'h3-js';
const [lat, lon, rings = 1, resolution = 8] = process.argv.slice(2).map(Number);
if (![lat, lon, rings, resolution].every(Number.isFinite) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || !Number.isInteger(rings) || rings < 0 || rings > 10 || !Number.isInteger(resolution) || resolution < 0 || resolution > 15) {
  throw new Error('Usage: node h3-coverage.mjs latitude longitude [rings=1] [resolution=8]');
}
console.log(JSON.stringify({ h3Indexes: gridDisk(latLngToCell(lat, lon, resolution), rings) }, null, 2));
