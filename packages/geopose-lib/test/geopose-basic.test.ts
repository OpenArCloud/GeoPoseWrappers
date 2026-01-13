import { describe, it, expect } from 'vitest';
import {
    GeoPoseBasic,
    GeoPose,
    yprToQuaternion,
    translateGeoPose
} from '../src/index.js';

describe('GeoPoseBasic', () => {
    it('constructs from YPR and exposes GeoPose', () => {
        const basic = GeoPoseBasic.fromLatLonHeightYPR(0, 0, 0, 90, 0, 0);
        const pose = basic.toGeoPose();

        const expected = yprToQuaternion({
            position: { lat: 0, lon: 0, h: 0 },
            angles: { yaw: 90, pitch: 0, roll: 0 }
        });

        expect(pose.quaternion.z).toBeCloseTo(expected.quaternion.z, 6);
        expect(pose.quaternion.w).toBeCloseTo(expected.quaternion.w, 6);
    });

    it('translates north via convenience method', () => {
        const start: GeoPose = {
            position: { lat: 0, lon: 0, h: 0 },
            quaternion: { x: 0, y: 0, z: 0, w: 1 }
        };

        const basic = GeoPoseBasic.fromGeoPose(start).translateNorth(100);
        const expected = translateGeoPose(start, { east: 0, north: 100, up: 0 });

        expect(basic.toGeoPose().position.lat).toBeCloseTo(expected.position.lat, 7);
        expect(basic.toGeoPose().position.lon).toBeCloseTo(expected.position.lon, 7);
    });

    it('supports direct component accessors', () => {
        const basic = GeoPoseBasic.fromLatLonHeight(0, 0, 0);
        basic.lat = 12;
        basic.lon = -34;
        basic.h = 56;
        basic.qx = 0.1;
        basic.qy = 0.2;
        basic.qz = 0.3;
        basic.qw = 0.9;

        const pose = basic.toGeoPose();
        expect(pose.position.lat).toBe(12);
        expect(pose.position.lon).toBe(-34);
        expect(pose.position.h).toBe(56);
        const mag = Math.sqrt(
            pose.quaternion.x ** 2 +
            pose.quaternion.y ** 2 +
            pose.quaternion.z ** 2 +
            pose.quaternion.w ** 2
        );
        expect(mag).toBeCloseTo(1, 6);
    });

    it('supports YPR component accessors', () => {
        const basic = GeoPoseBasic.fromLatLonHeight(0, 0, 0);
        basic.yaw = 30;
        basic.pitch = 10;
        basic.roll = 5;

        const ypr = basic.toGeoPoseYPR();
        expect(ypr.angles.yaw).toBeCloseTo(30, 5);
        expect(ypr.angles.pitch).toBeCloseTo(10, 5);
        expect(ypr.angles.roll).toBeCloseTo(5, 5);
    });

    it('supports heading alias for yaw', () => {
        const basic = GeoPoseBasic.fromLatLonHeight(0, 0, 0);
        basic.heading = 42;
        expect(basic.yaw).toBeCloseTo(42, 5);
        expect(basic.heading).toBeCloseTo(42, 5);
        basic.yawDegrees = 15;
        expect(basic.headingDegrees).toBeCloseTo(15, 5);
    });

    it('supports pitch/roll aliases', () => {
        const basic = GeoPoseBasic.fromLatLonHeight(0, 0, 0);
        basic.tilt = 12;
        basic.bank = -4;

        let ypr = basic.toGeoPoseYPR();
        expect(ypr.angles.pitch).toBeCloseTo(12, 5);
        expect(ypr.angles.roll).toBeCloseTo(-4, 5);

        basic.pitchDegrees = 5;
        basic.rollDegrees = 15;
        ypr = basic.toGeoPoseYPR();
        expect(ypr.angles.pitch).toBeCloseTo(5, 5);
        expect(ypr.angles.roll).toBeCloseTo(15, 5);
    });

    it('supports radian aliases', () => {
        const basic = GeoPoseBasic.fromLatLonHeight(0, 0, 0);
        basic.yawRad = Math.PI / 2;
        basic.pitchRad = Math.PI / 6;
        basic.rollRad = -Math.PI / 12;

        let ypr = basic.toGeoPoseYPR();
        expect(ypr.angles.yaw).toBeCloseTo(90, 4);
        expect(ypr.angles.pitch).toBeCloseTo(30, 4);
        expect(ypr.angles.roll).toBeCloseTo(-15, 4);

        basic.headingRad = Math.PI / 4;
        basic.tiltRad = Math.PI / 10;
        basic.bankRad = -Math.PI / 20;

        ypr = basic.toGeoPoseYPR();
        expect(ypr.angles.yaw).toBeCloseTo(45, 4);
        expect(ypr.angles.pitch).toBeCloseTo(18, 4);
        expect(ypr.angles.roll).toBeCloseTo(-9, 4);
    });

    it('parses GeoPose JSON (Basic Quaternion)', () => {
        const json = JSON.stringify({
            position: { lat: 10, lon: 20, h: 30 },
            quaternion: { x: 0, y: 0, z: 0, w: 1 }
        });

        const basic = GeoPoseBasic.fromJSON(json);
        expect(basic).not.toBeNull();
        if (!basic) return;
        expect(basic.position.lat).toBe(10);
        expect(basic.position.lon).toBe(20);
        expect(basic.position.h).toBe(30);
    });

    it('parses GeoPose YPR JSON', () => {
        const json = JSON.stringify({
            position: { lat: 1, lon: 2, h: 3 },
            angles: { yaw: 10, pitch: 20, roll: 30 }
        });

        const basic = GeoPoseBasic.fromJSON(json);
        expect(basic).not.toBeNull();
        if (!basic) return;
        const ypr = basic.toGeoPoseYPR();
        expect(ypr.angles.yaw).toBeCloseTo(10, 5);
        expect(ypr.angles.pitch).toBeCloseTo(20, 5);
        expect(ypr.angles.roll).toBeCloseTo(30, 5);
    });
});
