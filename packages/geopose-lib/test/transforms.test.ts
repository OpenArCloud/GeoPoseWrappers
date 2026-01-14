import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
    yprToQuaternion,
    quaternionToYPR,
    geoPoseToECEF,
    ecefToGeoPose,
    geoPoseToLocalENU,
    localENUToGeoPose,
    geoPoseToProjected,
    projectedToGeoPose,
    positionToProjected,
    projectedToPosition,
    getUTMZoneEPSG,
    getUTMZoneForGeoPose,
    GeoPose,
    ProjectedPose,
    WGS84,
    GeoPoseBasic
} from '../src/index.js';

// Load test data
const testDataPath = path.resolve('test-data/geopose-transforms-test-data.json');
const testData = JSON.parse(fs.readFileSync(testDataPath, 'utf-8'));

describe('GeoPose Transforms Library', () => {

    describe('YPR <-> Quaternion Conversions', () => {
        testData.conversions.ypr.forEach((testCase: any, index: number) => {
            it(`Case ${index}: Yaw=${testCase.input.yaw}, Pitch=${testCase.input.pitch}, Roll=${testCase.input.roll}`, () => {
                const inputPose = {
                    position: { lat: 0, lon: 0, h: 0 },
                    angles: testCase.input
                };

                // Test YPR -> Quaternion
                const bq = yprToQuaternion(inputPose);

                expect(bq.quaternion.x).toBeCloseTo(testCase.expectedQuaternion.x, 6);
                expect(bq.quaternion.y).toBeCloseTo(testCase.expectedQuaternion.y, 6);
                expect(bq.quaternion.z).toBeCloseTo(testCase.expectedQuaternion.z, 6);
                expect(bq.quaternion.w).toBeCloseTo(testCase.expectedQuaternion.w, 6);

                // Test Quaternion -> YPR
                const ypr = quaternionToYPR(bq);

                // Note: Angles can be ambiguous (e.g., -180 vs 180), so strict equality might fail.
                // But for the generated simple cases, it should be close.
                // Improve robustness if needed by normalizing angles.
                expect(ypr.angles.yaw).toBeCloseTo(testCase.input.yaw, 5);
                expect(ypr.angles.pitch).toBeCloseTo(testCase.input.pitch, 5);
                expect(ypr.angles.roll).toBeCloseTo(testCase.input.roll, 5);
            });
        });
    });

    describe('GeoPose <-> ECEF Conversions', () => {
        testData.conversions.ecef.forEach((testCase: any, index: number) => {
            const label = `Lat=${testCase.input.lat}, Lon=${testCase.input.lon}`;
            it(`Case ${index}: ${label}`, () => {
                const inputPose: GeoPose = {
                    position: testCase.input,
                    quaternion: { x: 0, y: 0, z: 0, w: 1 }
                };

                // Test GeoPose -> ECEF
                const ecef = geoPoseToECEF(inputPose);
                expect(ecef.position.x).toBeCloseTo(testCase.expectedECEF.x, 3);
                expect(ecef.position.y).toBeCloseTo(testCase.expectedECEF.y, 3);
                expect(ecef.position.z).toBeCloseTo(testCase.expectedECEF.z, 3);

                // Test ECEF -> GeoPose
                const recovered = ecefToGeoPose(ecef.position, ecef.orientation);

                expect(recovered.position.lat).toBeCloseTo(testCase.input.lat, 6);
                expect(recovered.position.lon).toBeCloseTo(testCase.input.lon, 6);
                expect(recovered.position.h).toBeCloseTo(testCase.input.h, 3);
            });
        });
    });

    describe('Local ENU Operations', () => {
        testData.local.forEach((testCase: any, index: number) => {
            it(`Case ${index}: Local offset checks`, () => {
                const targetPose: GeoPose = {
                    position: testCase.target,
                    quaternion: { x: 0, y: 0, z: 0, w: 1 }
                };

                const enu = geoPoseToLocalENU(targetPose, testCase.origin);

                expect(enu.position.east).toBeCloseTo(testCase.expectedENU.east, 3);
                expect(enu.position.north).toBeCloseTo(testCase.expectedENU.north, 3);
                expect(enu.position.up).toBeCloseTo(testCase.expectedENU.up, 3);

                // Round trip
                const recovered = localENUToGeoPose(enu.position, enu.orientation, testCase.origin);
                expect(recovered.position.lat).toBeCloseTo(testCase.target.lat, 7);
                expect(recovered.position.lon).toBeCloseTo(testCase.target.lon, 7);
                expect(recovered.position.h).toBeCloseTo(testCase.target.h, 3);
            });
        });
    });

    describe('Constants', () => {
        it('should have correct WGS84 semi-major axis', () => {
            expect(WGS84.a).toBe(6378137.0);
        });
    });

    describe('Projected Coordinate Transforms', () => {
        // Test data: Known coordinates in UTM zone 32N (EPSG:32632)
        // Oslo, Norway: 59.9139° N, 10.7522° E
        const osloLat = 59.9139;
        const osloLon = 10.7522;
        const osloHeight = 100;
        // Expected UTM zone 32N coordinates (verified via proj4 - sub-nanometer round-trip accuracy)
        const osloExpectedX = 597979.9028826989; // easting (meters)
        const osloExpectedY = 6643118.991493065; // northing (meters)

        describe('UTM Zone Detection', () => {
            it('should detect correct UTM zone for Oslo (zone 32N)', () => {
                const epsg = getUTMZoneEPSG(osloLon, true);
                expect(epsg).toBe('EPSG:32632');
            });

            it('should detect correct UTM zone for southern hemisphere', () => {
                // Sydney, Australia: -33.8688° S, 151.2093° E -> zone 56S
                const epsg = getUTMZoneEPSG(151.2093, false);
                expect(epsg).toBe('EPSG:32756');
            });

            it('should detect UTM zone from GeoPose', () => {
                const geoPose: GeoPose = {
                    position: { lat: osloLat, lon: osloLon, h: osloHeight },
                    quaternion: { x: 0, y: 0, z: 0, w: 1 }
                };
                const epsg = getUTMZoneForGeoPose(geoPose);
                expect(epsg).toBe('EPSG:32632');
            });
        });

        describe('Position Transforms', () => {
            it('should transform lat/lon to UTM coordinates with high precision', () => {
                const projected = positionToProjected(osloLat, osloLon, osloHeight, 'EPSG:32632');

                // Tight tolerance: within 1mm
                expect(projected.x).toBeCloseTo(osloExpectedX, 3);
                expect(projected.y).toBeCloseTo(osloExpectedY, 3);
                expect(projected.z).toBe(osloHeight);
                expect(projected.epsg).toBe('EPSG:32632');
            });

            it('should transform UTM coordinates back to lat/lon with high precision', () => {
                const llh = projectedToPosition(osloExpectedX, osloExpectedY, osloHeight, 'EPSG:32632');

                // Tight tolerance: within ~0.0000001 degrees (~1cm)
                expect(llh.lat).toBeCloseTo(osloLat, 7);
                expect(llh.lon).toBeCloseTo(osloLon, 7);
                expect(llh.h).toBe(osloHeight);
            });

            it('should round-trip position transform with sub-millimeter precision', () => {
                const projected = positionToProjected(osloLat, osloLon, osloHeight, 'EPSG:32632');
                const recovered = projectedToPosition(projected.x, projected.y, projected.z, projected.epsg);

                // Sub-nanometer accuracy verified - use 10 decimal places
                expect(recovered.lat).toBeCloseTo(osloLat, 10);
                expect(recovered.lon).toBeCloseTo(osloLon, 10);
                expect(recovered.h).toBe(osloHeight);
            });
        });

        describe('Full GeoPose Transforms', () => {
            it('should transform GeoPose to projected pose with high precision', () => {
                const geoPose: GeoPose = {
                    position: { lat: osloLat, lon: osloLon, h: osloHeight },
                    quaternion: { x: 0.1, y: 0.2, z: 0.3, w: 0.927 }
                };

                const projected = geoPoseToProjected(geoPose, 'EPSG:32632');

                // Tight tolerance: within 1mm
                expect(projected.x).toBeCloseTo(osloExpectedX, 3);
                expect(projected.y).toBeCloseTo(osloExpectedY, 3);
                expect(projected.z).toBe(osloHeight);
                expect(projected.quaternion.x).toBe(0.1);
                expect(projected.quaternion.y).toBe(0.2);
                expect(projected.quaternion.z).toBe(0.3);
                expect(projected.quaternion.w).toBe(0.927);
                expect(projected.epsg).toBe('EPSG:32632');
            });

            it('should transform projected pose back to GeoPose with high precision', () => {
                const projected: ProjectedPose = {
                    x: osloExpectedX,
                    y: osloExpectedY,
                    z: osloHeight,
                    quaternion: { x: 0.1, y: 0.2, z: 0.3, w: 0.927 },
                    epsg: 'EPSG:32632'
                };

                const geoPose = projectedToGeoPose(projected);

                // Tight tolerance: within ~0.0000001 degrees (~1cm)
                expect(geoPose.position.lat).toBeCloseTo(osloLat, 7);
                expect(geoPose.position.lon).toBeCloseTo(osloLon, 7);
                expect(geoPose.position.h).toBe(osloHeight);
                expect(geoPose.quaternion.x).toBe(0.1);
                expect(geoPose.quaternion.y).toBe(0.2);
                expect(geoPose.quaternion.z).toBe(0.3);
                expect(geoPose.quaternion.w).toBe(0.927);
            });

            it('should round-trip full GeoPose transform with sub-millimeter precision', () => {
                const original: GeoPose = {
                    position: { lat: osloLat, lon: osloLon, h: osloHeight },
                    quaternion: { x: 0.1, y: 0.2, z: 0.3, w: 0.927 }
                };

                const projected = geoPoseToProjected(original, 'EPSG:32632');
                const recovered = projectedToGeoPose(projected);

                // Sub-nanometer accuracy - use 10 decimal places
                expect(recovered.position.lat).toBeCloseTo(original.position.lat, 10);
                expect(recovered.position.lon).toBeCloseTo(original.position.lon, 10);
                expect(recovered.position.h).toBe(original.position.h);
                expect(recovered.quaternion.x).toBe(original.quaternion.x);
                expect(recovered.quaternion.y).toBe(original.quaternion.y);
                expect(recovered.quaternion.z).toBe(original.quaternion.z);
                expect(recovered.quaternion.w).toBe(original.quaternion.w);
            });
        });

        describe('GeoPoseBasic Projected Methods', () => {
            it('should convert to projected pose via toProjected with high precision', () => {
                const pose = GeoPoseBasic.fromLatLonHeight(osloLat, osloLon, osloHeight);
                const projected = pose.toProjected('EPSG:32632');

                // Tight tolerance: within 1mm
                expect(projected.x).toBeCloseTo(osloExpectedX, 3);
                expect(projected.y).toBeCloseTo(osloExpectedY, 3);
                expect(projected.z).toBe(osloHeight);
                expect(projected.epsg).toBe('EPSG:32632');
            });

            it('should convert to UTM automatically via toProjectedUTM with high precision', () => {
                const pose = GeoPoseBasic.fromLatLonHeight(osloLat, osloLon, osloHeight);
                const projected = pose.toProjectedUTM();

                expect(projected.epsg).toBe('EPSG:32632');
                // Tight tolerance: within 1mm
                expect(projected.x).toBeCloseTo(osloExpectedX, 3);
                expect(projected.y).toBeCloseTo(osloExpectedY, 3);
            });

            it('should create from projected pose via fromProjected with high precision', () => {
                const projected: ProjectedPose = {
                    x: osloExpectedX,
                    y: osloExpectedY,
                    z: osloHeight,
                    quaternion: { x: 0, y: 0, z: 0, w: 1 },
                    epsg: 'EPSG:32632'
                };

                const pose = GeoPoseBasic.fromProjected(projected);

                // Tight tolerance: within ~0.0000001 degrees (~1cm)
                expect(pose.lat).toBeCloseTo(osloLat, 7);
                expect(pose.lon).toBeCloseTo(osloLon, 7);
                expect(pose.h).toBe(osloHeight);
            });

            it('should get UTM zone via getUTMZone', () => {
                const pose = GeoPoseBasic.fromLatLonHeight(osloLat, osloLon, osloHeight);
                expect(pose.getUTMZone()).toBe('EPSG:32632');
            });

            it('should round-trip through projected and back with sub-millimeter precision', () => {
                const original = GeoPoseBasic.fromLatLonHeightYPR(
                    osloLat, osloLon, osloHeight,
                    45, 10, 5
                );

                const projected = original.toProjected('EPSG:32632');
                const recovered = GeoPoseBasic.fromProjected(projected);

                // Sub-nanometer accuracy for position
                expect(recovered.lat).toBeCloseTo(original.lat, 10);
                expect(recovered.lon).toBeCloseTo(original.lon, 10);
                expect(recovered.h).toBeCloseTo(original.h, 6);
                // Orientation should be preserved exactly
                expect(recovered.yaw).toBeCloseTo(original.yaw, 10);
                expect(recovered.pitch).toBeCloseTo(original.pitch, 10);
                expect(recovered.roll).toBeCloseTo(original.roll, 10);
            });
        });
    });

});
