import {
    GeoPose,
    GeoPoseBYPR,
    ENU,
    LLH,
    ECEF,
    Quaternion
} from './types.js';
import {
    yprToQuaternion,
    quaternionToYPR,
    geoPoseToECEF,
    ecefToGeoPose
} from './core/conversions.js';
import {
    geoPoseToLocalENU,
    localENUToGeoPose,
    translateGeoPose
} from './core/local.js';
import {
    getRelativePose,
    applyRelativePose,
    interpolatePose
} from './core/advanced.js';

export type RelativePose = { translation: ENU; rotation: Quaternion };

/**
 * Convenience wrapper around GeoPose (Basic Quaternion).
 * Internal state is stored as position + quaternion.
 */
export class GeoPoseBasic {
    private _position: LLH;
    private _quaternion: Quaternion;

    constructor(pose: GeoPose) {
        this._position = { ...pose.position };
        this._quaternion = { ...pose.quaternion };
    }

    // ---------------------------------------------------------------------
    // Static constructors
    // ---------------------------------------------------------------------

    static fromGeoPose(pose: GeoPose): GeoPoseBasic {
        return new GeoPoseBasic(pose);
    }

    static fromPosition(position: LLH, quaternion?: Quaternion): GeoPoseBasic {
        return new GeoPoseBasic({
            position: { ...position },
            quaternion: quaternion ? normalizeQuaternion(quaternion) : identityQuaternion()
        });
    }

    static fromLatLonHeight(
        lat: number,
        lon: number,
        h: number,
        quaternion?: Quaternion
    ): GeoPoseBasic {
        return GeoPoseBasic.fromPosition({ lat, lon, h }, quaternion);
    }

    static fromYPR(position: LLH, yaw: number, pitch: number, roll: number): GeoPoseBasic {
        return new GeoPoseBasic(
            yprToQuaternion({
                position: { ...position },
                angles: { yaw, pitch, roll }
            })
        );
    }

    static fromLatLonHeightYPR(
        lat: number,
        lon: number,
        h: number,
        yaw: number,
        pitch: number,
        roll: number
    ): GeoPoseBasic {
        return GeoPoseBasic.fromYPR({ lat, lon, h }, yaw, pitch, roll);
    }

    static fromECEF(position: ECEF, orientation: Quaternion): GeoPoseBasic {
        return new GeoPoseBasic(ecefToGeoPose(position, orientation));
    }

    static fromLocalENU(enu: ENU, orientation: Quaternion, origin: LLH): GeoPoseBasic {
        return new GeoPoseBasic(localENUToGeoPose(enu, orientation, origin));
    }

    static fromRelativePose(base: GeoPoseBasic | GeoPose, relative: RelativePose): GeoPoseBasic {
        const basePose = base instanceof GeoPoseBasic ? base.toGeoPose() : base;
        return new GeoPoseBasic(applyRelativePose(basePose, relative));
    }

    static fromGeoPoseJSON(json: string): GeoPoseBasic | null {
        return GeoPoseBasic.fromJSONWithMode(json, 'bq');
    }

    static fromGeoPoseYPRJSON(json: string): GeoPoseBasic | null {
        return GeoPoseBasic.fromJSONWithMode(json, 'ypr');
    }

    static fromJSON(json: string): GeoPoseBasic | null {
        return GeoPoseBasic.fromJSONWithMode(json, 'auto');
    }

    static fromObject(value: unknown): GeoPoseBasic | null {
        if (isGeoPose(value)) {
            return new GeoPoseBasic(value);
        }
        if (isGeoPoseBYPR(value)) {
            return GeoPoseBasic.fromYPR(
                value.position,
                value.angles.yaw,
                value.angles.pitch,
                value.angles.roll
            );
        }
        return null;
    }

    private static fromJSONWithMode(
        json: string,
        mode: 'auto' | 'bq' | 'ypr'
    ): GeoPoseBasic | null {
        try {
            const parsed = JSON.parse(json);
            if (mode === 'bq') {
                return isGeoPose(parsed) ? new GeoPoseBasic(parsed) : null;
            }
            if (mode === 'ypr') {
                return isGeoPoseBYPR(parsed)
                    ? GeoPoseBasic.fromYPR(
                        parsed.position,
                        parsed.angles.yaw,
                        parsed.angles.pitch,
                        parsed.angles.roll
                    )
                    : null;
            }
            return GeoPoseBasic.fromObject(parsed);
        } catch {
            return null;
        }
    }

    // ---------------------------------------------------------------------
    // Accessors
    // ---------------------------------------------------------------------

    get position(): LLH {
        return { ...this._position };
    }

    set position(value: LLH) {
        this.setPosition(value);
    }

    get quaternion(): Quaternion {
        return { ...this._quaternion };
    }

    set quaternion(value: Quaternion) {
        this.setOrientation(value);
    }

    get lat(): number {
        return this._position.lat;
    }

    set lat(value: number) {
        this._position.lat = value;
    }

    get lon(): number {
        return this._position.lon;
    }

    set lon(value: number) {
        this._position.lon = value;
    }

    get h(): number {
        return this._position.h;
    }

    set h(value: number) {
        this._position.h = value;
    }

    get qx(): number {
        return this._quaternion.x;
    }

    set qx(value: number) {
        this._quaternion = normalizeQuaternion({ ...this._quaternion, x: value });
    }

    get qy(): number {
        return this._quaternion.y;
    }

    set qy(value: number) {
        this._quaternion = normalizeQuaternion({ ...this._quaternion, y: value });
    }

    get qz(): number {
        return this._quaternion.z;
    }

    set qz(value: number) {
        this._quaternion = normalizeQuaternion({ ...this._quaternion, z: value });
    }

    get qw(): number {
        return this._quaternion.w;
    }

    set qw(value: number) {
        this._quaternion = normalizeQuaternion({ ...this._quaternion, w: value });
    }

    get yaw(): number {
        return this.toGeoPoseYPR().angles.yaw;
    }

    set yaw(value: number) {
        const ypr = this.toGeoPoseYPR();
        this.setYPROrientation(value, ypr.angles.pitch, ypr.angles.roll);
    }

    get yawDegrees(): number {
        return this.yaw;
    }

    set yawDegrees(value: number) {
        this.yaw = value;
    }

    get pitch(): number {
        return this.toGeoPoseYPR().angles.pitch;
    }

    set pitch(value: number) {
        const ypr = this.toGeoPoseYPR();
        this.setYPROrientation(ypr.angles.yaw, value, ypr.angles.roll);
    }

    get roll(): number {
        return this.toGeoPoseYPR().angles.roll;
    }

    set roll(value: number) {
        const ypr = this.toGeoPoseYPR();
        this.setYPROrientation(ypr.angles.yaw, ypr.angles.pitch, value);
    }

    get heading(): number {
        return this.yaw;
    }

    set heading(value: number) {
        this.yaw = value;
    }

    get headingDegrees(): number {
        return this.heading;
    }

    set headingDegrees(value: number) {
        this.heading = value;
    }

    get tilt(): number {
        return this.pitch;
    }

    set tilt(value: number) {
        this.pitch = value;
    }

    get bank(): number {
        return this.roll;
    }

    set bank(value: number) {
        this.roll = value;
    }

    get pitchDegrees(): number {
        return this.pitch;
    }

    set pitchDegrees(value: number) {
        this.pitch = value;
    }

    get rollDegrees(): number {
        return this.roll;
    }

    set rollDegrees(value: number) {
        this.roll = value;
    }

    get yawRad(): number {
        return degToRad(this.yaw);
    }

    set yawRad(value: number) {
        this.yaw = radToDeg(value);
    }

    get pitchRad(): number {
        return degToRad(this.pitch);
    }

    set pitchRad(value: number) {
        this.pitch = radToDeg(value);
    }

    get rollRad(): number {
        return degToRad(this.roll);
    }

    set rollRad(value: number) {
        this.roll = radToDeg(value);
    }

    get headingRad(): number {
        return degToRad(this.heading);
    }

    set headingRad(value: number) {
        this.heading = radToDeg(value);
    }

    get tiltRad(): number {
        return degToRad(this.tilt);
    }

    set tiltRad(value: number) {
        this.tilt = radToDeg(value);
    }

    get bankRad(): number {
        return degToRad(this.bank);
    }

    set bankRad(value: number) {
        this.bank = radToDeg(value);
    }

    toGeoPose(): GeoPose {
        return {
            position: { ...this._position },
            quaternion: { ...this._quaternion }
        };
    }

    toGeoPoseJSON(prettyPrint: boolean = false): string {
        const pose = this.toGeoPose();
        return prettyPrint ? JSON.stringify(pose, null, 2) : JSON.stringify(pose);
    }

    toGeoPoseYPR(): GeoPoseBYPR {
        return quaternionToYPR(this.toGeoPose());
    }

    toGeoPoseYPRJSON(prettyPrint: boolean = false): string {
        const ypr = this.toGeoPoseYPR();
        return prettyPrint ? JSON.stringify(ypr, null, 2) : JSON.stringify(ypr);
    }

    toECEF(): { position: ECEF; orientation: Quaternion } {
        return geoPoseToECEF(this.toGeoPose());
    }

    toLocalENU(origin: LLH): { position: ENU; orientation: Quaternion } {
        return geoPoseToLocalENU(this.toGeoPose(), origin);
    }

    getRelativePoseTo(target: GeoPoseBasic | GeoPose): RelativePose {
        const targetPose = target instanceof GeoPoseBasic ? target.toGeoPose() : target;
        return getRelativePose(this.toGeoPose(), targetPose);
    }

    interpolateTo(target: GeoPoseBasic | GeoPose, t: number): GeoPoseBasic {
        const targetPose = target instanceof GeoPoseBasic ? target.toGeoPose() : target;
        return new GeoPoseBasic(interpolatePose(this.toGeoPose(), targetPose, t));
    }

    clone(): GeoPoseBasic {
        return new GeoPoseBasic(this.toGeoPose());
    }

    // ---------------------------------------------------------------------
    // Mutators
    // ---------------------------------------------------------------------

    setGeoPose(pose: GeoPose): this {
        this._position = { ...pose.position };
        this._quaternion = { ...pose.quaternion };
        return this;
    }

    setPosition(position: LLH): this {
        this._position = { ...position };
        return this;
    }

    setPositionLatLonHeight(lat: number, lon: number, h: number): this {
        return this.setPosition({ lat, lon, h });
    }

    setQuaternionOrientation(x: number, y: number, z: number, w: number): this {
        this._quaternion = normalizeQuaternion({ x, y, z, w });
        return this;
    }

    setOrientation(quaternion: Quaternion): this {
        return this.setQuaternionOrientation(
            quaternion.x,
            quaternion.y,
            quaternion.z,
            quaternion.w
        );
    }

    setYPROrientation(yaw: number, pitch: number, roll: number): this {
        const pose = yprToQuaternion({
            position: { ...this._position },
            angles: { yaw, pitch, roll }
        });
        this._position = { ...pose.position };
        this._quaternion = { ...pose.quaternion };
        return this;
    }

    translateENU(enu: ENU): this {
        const pose = translateGeoPose(this.toGeoPose(), enu);
        this._position = { ...pose.position };
        this._quaternion = { ...pose.quaternion };
        return this;
    }

    translateBy(east: number, north: number, up: number): this {
        return this.translateENU({ east, north, up });
    }

    translateNorth(northMeters: number): this {
        return this.translateENU({ east: 0, north: northMeters, up: 0 });
    }

    translateEast(eastMeters: number): this {
        return this.translateENU({ east: eastMeters, north: 0, up: 0 });
    }

    translateUp(upMeters: number): this {
        return this.translateENU({ east: 0, north: 0, up: upMeters });
    }

    rotateAroundUpAxis(degrees: number): this {
        return this.rotateByYPRDelta({ yaw: degrees, pitch: 0, roll: 0 });
    }

    rotateAroundNorthAxis(degrees: number): this {
        return this.rotateByYPRDelta({ yaw: 0, pitch: degrees, roll: 0 });
    }

    rotateAroundEastAxis(degrees: number): this {
        return this.rotateByYPRDelta({ yaw: 0, pitch: 0, roll: degrees });
    }

    rotateByQuaternion(rotation: Quaternion): this {
        const rotated = multiplyQuaternions(rotation, this._quaternion);
        this._quaternion = normalizeQuaternion(rotated);
        return this;
    }

    applyRelativePose(relative: RelativePose): this {
        const pose = applyRelativePose(this.toGeoPose(), relative);
        this._position = { ...pose.position };
        this._quaternion = { ...pose.quaternion };
        return this;
    }

    normalizeOrientation(): this {
        this._quaternion = normalizeQuaternion(this._quaternion);
        return this;
    }

    // ---------------------------------------------------------------------
    // Internal helpers
    // ---------------------------------------------------------------------

    private rotateByYPRDelta(delta: { yaw: number; pitch: number; roll: number }): this {
        const ypr = quaternionToYPR(this.toGeoPose());
        return this.setYPROrientation(
            ypr.angles.yaw + delta.yaw,
            ypr.angles.pitch + delta.pitch,
            ypr.angles.roll + delta.roll
        );
    }
}

function identityQuaternion(): Quaternion {
    return { x: 0, y: 0, z: 0, w: 1 };
}

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

function degToRad(deg: number): number {
    return deg * DEG_TO_RAD;
}

function radToDeg(rad: number): number {
    return rad * RAD_TO_DEG;
}

function normalizeQuaternion(q: Quaternion): Quaternion {
    const mag = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
    if (mag === 0) return identityQuaternion();
    return { x: q.x / mag, y: q.y / mag, z: q.z / mag, w: q.w / mag };
}

function multiplyQuaternions(a: Quaternion, b: Quaternion): Quaternion {
    return {
        x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
        y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
        z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
        w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z
    };
}

function isGeoPose(value: unknown): value is GeoPose {
    if (!value || typeof value !== 'object') return false;
    const obj = value as Record<string, unknown>;
    if (!obj.position || typeof obj.position !== 'object') return false;
    if (!obj.quaternion || typeof obj.quaternion !== 'object') return false;

    const pos = obj.position as Record<string, unknown>;
    const quat = obj.quaternion as Record<string, unknown>;

    return (
        typeof pos.lat === 'number' &&
        typeof pos.lon === 'number' &&
        typeof pos.h === 'number' &&
        typeof quat.x === 'number' &&
        typeof quat.y === 'number' &&
        typeof quat.z === 'number' &&
        typeof quat.w === 'number'
    );
}

function isGeoPoseBYPR(value: unknown): value is GeoPoseBYPR {
    if (!value || typeof value !== 'object') return false;
    const obj = value as Record<string, unknown>;
    if (!obj.position || typeof obj.position !== 'object') return false;
    if (!obj.angles || typeof obj.angles !== 'object') return false;

    const pos = obj.position as Record<string, unknown>;
    const angles = obj.angles as Record<string, unknown>;

    return (
        typeof pos.lat === 'number' &&
        typeof pos.lon === 'number' &&
        typeof pos.h === 'number' &&
        typeof angles.yaw === 'number' &&
        typeof angles.pitch === 'number' &&
        typeof angles.roll === 'number'
    );
}
