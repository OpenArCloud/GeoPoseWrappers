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
    GeoPose,
    WGS84
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

});
