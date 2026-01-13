import fs from 'fs';
import path from 'path';
import {
    GeoPoseBQ,
    quaternionToYPR,
    yprToQuaternion,
    geoPoseToECEF,
    ecefToGeoPose,
    geoPoseToLocalENU,
    localENUToGeoPose,
    WGS84
} from '../src/index.js';

// Define the Test Data Structure
interface TestData {
    info: string;
    generatedAt: string;
    conversions: {
        ypr: Array<{
            input: { yaw: number, pitch: number, roll: number };
            expectedQuaternion: { x: number, y: number, z: number, w: number };
        }>;
        ecef: Array<{
            input: { lat: number, lon: number, h: number };
            expectedECEF: { x: number, y: number, z: number };
        }>;
    };
    local: Array<{
        origin: { lat: number, lon: number, h: number };
        target: { lat: number, lon: number, h: number };
        expectedENU: { east: number, north: number, up: number };
    }>;
}

const testData: TestData = {
    info: "Standardized Test Data for GeoPose-Transforms Libraries",
    generatedAt: new Date().toISOString(),
    conversions: {
        ypr: [],
        ecef: []
    },
    local: []
};

// 1. Generate YPR Tests
// Simple cases
const yprCases = [
    { yaw: 0, pitch: 0, roll: 0 },
    { yaw: 90, pitch: 0, roll: 0 },
    { yaw: 0, pitch: 90, roll: 0 }, // Gimbal lock case?
    { yaw: 0, pitch: 0, roll: 90 },
    { yaw: 45, pitch: 45, roll: 45 }
];

yprCases.forEach(ypr => {
    const geoPose = {
        position: { lat: 0, lon: 0, h: 0 },
        angles: ypr
    };
    const bq = yprToQuaternion(geoPose);
    testData.conversions.ypr.push({
        input: ypr,
        expectedQuaternion: bq.quaternion
    });
});

// 2. Generate ECEF Tests
// Known WGS84 points
const ecefCases = [
    { lat: 0, lon: 0, h: 0 },           // Equator/Prime Meridian
    { lat: 0, lon: 90, h: 0 },          // Equator/90E
    { lat: 90, lon: 0, h: 0 },          // North Pole
    { lat: 45, lon: 45, h: 1000 },      // Mid-latitude height
    { lat: -33.8688, lon: 151.2093, h: 50 } // Sydney
];

ecefCases.forEach(pos => {
    const geoPose = {
        position: pos,
        quaternion: { x: 0, y: 0, z: 0, w: 1 }
    };
    const ecef = geoPoseToECEF(geoPose);
    testData.conversions.ecef.push({
        input: pos,
        expectedECEF: ecef.position
    });
});

// 3. Generate Local ENU Tests
// Small displacements in simple places
const localCases = [
    {
        origin: { lat: 0, lon: 0, h: 0 },
        target: { lat: 0, lon: 0.00001, h: 0 }, // Small move East
    },
    {
        origin: { lat: 0, lon: 0, h: 0 },
        target: { lat: 0.00001, lon: 0, h: 0 }, // Small move North
    },
    {
        origin: { lat: 0, lon: 0, h: 0 },
        target: { lat: 0, lon: 0, h: 10 },      // Small move Up
    }
];

localCases.forEach(c => {
    const targetPose = {
        position: c.target,
        quaternion: { x: 0, y: 0, z: 0, w: 1 }
    };
    const enu = geoPoseToLocalENU(targetPose, c.origin);
    testData.local.push({
        origin: c.origin,
        target: c.target,
        expectedENU: enu.position
    });
});

// Write to file
const outputDir = path.resolve('test-data');
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
}

fs.writeFileSync(
    path.join(outputDir, 'geopose-transforms-test-data.json'),
    JSON.stringify(testData, null, 2)
);

console.log("Generated test-data/geopose-transforms-test-data.json");
