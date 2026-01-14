import {
    GeoPose,
    GeoPoseBYPR,
    ENU,
    LLH,
    ECEF,
    Quaternion,
    ProjectedPose
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
import {
    geoPoseToProjected,
    projectedToGeoPose,
    getUTMZoneEPSG
} from './core/projected.js';

/**
 * Relative pose expressed as ENU translation and quaternion rotation.
 */
export type RelativePose = { translation: ENU; rotation: Quaternion };

/**
 * Convenience wrapper around GeoPose (Basic Quaternion).
 * Internal state is stored as position + quaternion and exposed through
 * helpers for YPR, ENU, ECEF, and JSON workflows.
 */
export class GeoPoseBasic {
    private _position: LLH;
    private _quaternion: Quaternion;

    /**
     * Create a GeoPoseBasic from a Basic Quaternion GeoPose.
     */
    constructor(pose: GeoPose) {
        this._position = { ...pose.position };
        this._quaternion = { ...pose.quaternion };
    }

    // ---------------------------------------------------------------------
    // Static constructors
    // ---------------------------------------------------------------------

    /**
     * Create a GeoPoseBasic from a Basic Quaternion GeoPose.
     */
    static fromGeoPose(pose: GeoPose): GeoPoseBasic {
        return new GeoPoseBasic(pose);
    }

    /**
     * Create from a position and optional quaternion.
     * If no quaternion is provided, identity orientation is used.
     */
    static fromPosition(position: LLH, quaternion?: Quaternion): GeoPoseBasic {
        return new GeoPoseBasic({
            position: { ...position },
            quaternion: quaternion ? normalizeQuaternion(quaternion) : identityQuaternion()
        });
    }

    /**
     * Create from latitude/longitude/height and optional quaternion.
     */
    static fromLatLonHeight(
        lat: number,
        lon: number,
        h: number,
        quaternion?: Quaternion
    ): GeoPoseBasic {
        return GeoPoseBasic.fromPosition({ lat, lon, h }, quaternion);
    }

    /**
     * Create from a position and YPR angles in degrees.
     */
    static fromYPR(position: LLH, yaw: number, pitch: number, roll: number): GeoPoseBasic {
        return new GeoPoseBasic(
            yprToQuaternion({
                position: { ...position },
                angles: { yaw, pitch, roll }
            })
        );
    }

    /**
     * Create from latitude/longitude/height and YPR angles in degrees.
     */
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

    /**
     * Create from ECEF coordinates and orientation.
     */
    static fromECEF(position: ECEF, orientation: Quaternion): GeoPoseBasic {
        return new GeoPoseBasic(ecefToGeoPose(position, orientation));
    }

    /**
     * Create from local ENU coordinates and orientation at a given origin.
     */
    static fromLocalENU(enu: ENU, orientation: Quaternion, origin: LLH): GeoPoseBasic {
        return new GeoPoseBasic(localENUToGeoPose(enu, orientation, origin));
    }

    /**
     * Create from a projected 6DOF pose (e.g., UTM coordinates).
     * The EPSG code is read from the pose itself.
     *
     * @param pose - ProjectedPose with x, y, z, quaternion, and epsg.
     * @returns GeoPoseBasic in WGS84.
     */
    static fromProjected(pose: ProjectedPose): GeoPoseBasic {
        return new GeoPoseBasic(projectedToGeoPose(pose));
    }

    /**
     * Create by applying a relative pose to a base pose.
     */
    static fromRelativePose(base: GeoPoseBasic | GeoPose, relative: RelativePose): GeoPoseBasic {
        const basePose = base instanceof GeoPoseBasic ? base.toGeoPose() : base;
        return new GeoPoseBasic(applyRelativePose(basePose, relative));
    }

    /**
     * Parse a JSON string containing a Basic Quaternion GeoPose.
     */
    static fromGeoPoseJSON(json: string): GeoPoseBasic | null {
        return GeoPoseBasic.fromJSONWithMode(json, 'bq');
    }

    /**
     * Parse a JSON string containing a Basic YPR GeoPose.
     */
    static fromGeoPoseYPRJSON(json: string): GeoPoseBasic | null {
        return GeoPoseBasic.fromJSONWithMode(json, 'ypr');
    }

    /**
     * Parse a JSON string containing either Basic Quaternion or Basic YPR.
     */
    static fromJSON(json: string): GeoPoseBasic | null {
        return GeoPoseBasic.fromJSONWithMode(json, 'auto');
    }

    /**
     * Build from a JS object that matches GeoPose or GeoPoseBYPR.
     */
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

    /**
     * Internal JSON parser with explicit mode control.
     */
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

    /**
     * Get a copy of the current position (LLH).
     */
    get position(): LLH {
        return { ...this._position };
    }

    set position(value: LLH) {
        this.setPosition(value);
    }

    /**
     * Get a copy of the current orientation quaternion.
     */
    get quaternion(): Quaternion {
        return { ...this._quaternion };
    }

    set quaternion(value: Quaternion) {
        this.setOrientation(value);
    }

    /**
     * Latitude in degrees.
     */
    get lat(): number {
        return this._position.lat;
    }

    set lat(value: number) {
        this._position.lat = value;
    }

    /**
     * Longitude in degrees.
     */
    get lon(): number {
        return this._position.lon;
    }

    set lon(value: number) {
        this._position.lon = value;
    }

    /**
     * Height in meters above the WGS84 ellipsoid.
     */
    get h(): number {
        return this._position.h;
    }

    set h(value: number) {
        this._position.h = value;
    }

    /**
     * Quaternion x component (auto-normalizes on set).
     */
    get qx(): number {
        return this._quaternion.x;
    }

    set qx(value: number) {
        this._quaternion = normalizeQuaternion({ ...this._quaternion, x: value });
    }

    /**
     * Quaternion y component (auto-normalizes on set).
     */
    get qy(): number {
        return this._quaternion.y;
    }

    set qy(value: number) {
        this._quaternion = normalizeQuaternion({ ...this._quaternion, y: value });
    }

    /**
     * Quaternion z component (auto-normalizes on set).
     */
    get qz(): number {
        return this._quaternion.z;
    }

    set qz(value: number) {
        this._quaternion = normalizeQuaternion({ ...this._quaternion, z: value });
    }

    /**
     * Quaternion w component (auto-normalizes on set).
     */
    get qw(): number {
        return this._quaternion.w;
    }

    set qw(value: number) {
        this._quaternion = normalizeQuaternion({ ...this._quaternion, w: value });
    }

    /**
     * Yaw in degrees (0 = North, 90 = East).
     */
    get yaw(): number {
        return this.toGeoPoseYPR().angles.yaw;
    }

    set yaw(value: number) {
        const ypr = this.toGeoPoseYPR();
        this.setYPROrientation(value, ypr.angles.pitch, ypr.angles.roll);
    }

    /**
     * Yaw in degrees (alias for yaw).
     */
    get yawDegrees(): number {
        return this.yaw;
    }

    set yawDegrees(value: number) {
        this.yaw = value;
    }

    /**
     * Pitch in degrees (positive = looking up).
     */
    get pitch(): number {
        return this.toGeoPoseYPR().angles.pitch;
    }

    set pitch(value: number) {
        const ypr = this.toGeoPoseYPR();
        this.setYPROrientation(ypr.angles.yaw, value, ypr.angles.roll);
    }

    /**
     * Roll in degrees (positive = banking right).
     */
    get roll(): number {
        return this.toGeoPoseYPR().angles.roll;
    }

    set roll(value: number) {
        const ypr = this.toGeoPoseYPR();
        this.setYPROrientation(ypr.angles.yaw, ypr.angles.pitch, value);
    }

    /**
     * Heading in degrees (alias for yaw).
     */
    get heading(): number {
        return this.yaw;
    }

    set heading(value: number) {
        this.yaw = value;
    }

    /**
     * Heading in degrees (alias for heading).
     */
    get headingDegrees(): number {
        return this.heading;
    }

    set headingDegrees(value: number) {
        this.heading = value;
    }

    /**
     * Tilt in degrees (alias for pitch).
     */
    get tilt(): number {
        return this.pitch;
    }

    set tilt(value: number) {
        this.pitch = value;
    }

    /**
     * Bank in degrees (alias for roll).
     */
    get bank(): number {
        return this.roll;
    }

    set bank(value: number) {
        this.roll = value;
    }

    /**
     * Pitch in degrees (alias for pitch).
     */
    get pitchDegrees(): number {
        return this.pitch;
    }

    set pitchDegrees(value: number) {
        this.pitch = value;
    }

    /**
     * Roll in degrees (alias for roll).
     */
    get rollDegrees(): number {
        return this.roll;
    }

    set rollDegrees(value: number) {
        this.roll = value;
    }

    /**
     * Yaw in radians.
     */
    get yawRad(): number {
        return degToRad(this.yaw);
    }

    set yawRad(value: number) {
        this.yaw = radToDeg(value);
    }

    /**
     * Pitch in radians.
     */
    get pitchRad(): number {
        return degToRad(this.pitch);
    }

    set pitchRad(value: number) {
        this.pitch = radToDeg(value);
    }

    /**
     * Roll in radians.
     */
    get rollRad(): number {
        return degToRad(this.roll);
    }

    set rollRad(value: number) {
        this.roll = radToDeg(value);
    }

    /**
     * Heading in radians (alias for yawRad).
     */
    get headingRad(): number {
        return degToRad(this.heading);
    }

    set headingRad(value: number) {
        this.heading = radToDeg(value);
    }

    /**
     * Tilt in radians (alias for pitchRad).
     */
    get tiltRad(): number {
        return degToRad(this.tilt);
    }

    set tiltRad(value: number) {
        this.tilt = radToDeg(value);
    }

    /**
     * Bank in radians (alias for rollRad).
     */
    get bankRad(): number {
        return degToRad(this.bank);
    }

    set bankRad(value: number) {
        this.bank = radToDeg(value);
    }

    /**
     * Export the current state as a Basic Quaternion GeoPose.
     */
    toGeoPose(): GeoPose {
        return {
            position: { ...this._position },
            quaternion: { ...this._quaternion }
        };
    }

    /**
     * Serialize the Basic Quaternion GeoPose to JSON.
     */
    toGeoPoseJSON(prettyPrint: boolean = false): string {
        const pose = this.toGeoPose();
        return prettyPrint ? JSON.stringify(pose, null, 2) : JSON.stringify(pose);
    }

    /**
     * Convert the current pose to Basic YPR.
     */
    toGeoPoseYPR(): GeoPoseBYPR {
        return quaternionToYPR(this.toGeoPose());
    }

    /**
     * Serialize the Basic YPR pose to JSON.
     */
    toGeoPoseYPRJSON(prettyPrint: boolean = false): string {
        const ypr = this.toGeoPoseYPR();
        return prettyPrint ? JSON.stringify(ypr, null, 2) : JSON.stringify(ypr);
    }

    /**
     * Convert the current pose to ECEF coordinates + orientation.
     */
    toECEF(): { position: ECEF; orientation: Quaternion } {
        return geoPoseToECEF(this.toGeoPose());
    }

    /**
     * Convert the current pose to local ENU coordinates at the given origin.
     */
    toLocalENU(origin: LLH): { position: ENU; orientation: Quaternion } {
        return geoPoseToLocalENU(this.toGeoPose(), origin);
    }

    /**
     * Convert the current pose to a projected 6DOF pose (e.g., UTM).
     *
     * @param epsg - Target EPSG code, e.g., "EPSG:32632" for UTM zone 32N.
     * @returns ProjectedPose with x, y, z, quaternion, and epsg.
     */
    toProjected(epsg: string): ProjectedPose {
        return geoPoseToProjected(this.toGeoPose(), epsg);
    }

    /**
     * Convert the current pose to a projected pose using the appropriate UTM zone.
     * The UTM zone is automatically determined from the position's longitude and latitude.
     *
     * @returns ProjectedPose in the appropriate UTM zone.
     */
    toProjectedUTM(): ProjectedPose {
        const epsg = this.getUTMZone();
        return this.toProjected(epsg);
    }

    /**
     * Get the UTM zone EPSG code for this pose's position.
     *
     * @returns EPSG code for the appropriate UTM zone, e.g., "EPSG:32632".
     */
    getUTMZone(): string {
        return getUTMZoneEPSG(this._position.lon, this._position.lat >= 0);
    }

    /**
     * Get the relative pose from this pose to a target pose.
     */
    getRelativePoseTo(target: GeoPoseBasic | GeoPose): RelativePose {
        const targetPose = target instanceof GeoPoseBasic ? target.toGeoPose() : target;
        return getRelativePose(this.toGeoPose(), targetPose);
    }

    /**
     * Interpolate toward a target pose using ECEF lerp + quaternion slerp.
     * @param t Interpolation factor in [0, 1].
     */
    interpolateTo(target: GeoPoseBasic | GeoPose, t: number): GeoPoseBasic {
        const targetPose = target instanceof GeoPoseBasic ? target.toGeoPose() : target;
        return new GeoPoseBasic(interpolatePose(this.toGeoPose(), targetPose, t));
    }

    /**
     * Create a deep copy of this GeoPoseBasic.
     */
    clone(): GeoPoseBasic {
        return new GeoPoseBasic(this.toGeoPose());
    }

    // ---------------------------------------------------------------------
    // Mutators
    // ---------------------------------------------------------------------

    /**
     * Replace the internal pose using a Basic Quaternion GeoPose.
     */
    setGeoPose(pose: GeoPose): this {
        this._position = { ...pose.position };
        this._quaternion = { ...pose.quaternion };
        return this;
    }

    /**
     * Replace the internal position.
     */
    setPosition(position: LLH): this {
        this._position = { ...position };
        return this;
    }

    /**
     * Replace the internal position using lat/lon/height.
     */
    setPositionLatLonHeight(lat: number, lon: number, h: number): this {
        return this.setPosition({ lat, lon, h });
    }

    /**
     * Set quaternion orientation by components (auto-normalized).
     */
    setQuaternionOrientation(x: number, y: number, z: number, w: number): this {
        this._quaternion = normalizeQuaternion({ x, y, z, w });
        return this;
    }

    /**
     * Set quaternion orientation from a Quaternion object.
     */
    setOrientation(quaternion: Quaternion): this {
        return this.setQuaternionOrientation(
            quaternion.x,
            quaternion.y,
            quaternion.z,
            quaternion.w
        );
    }

    /**
     * Set orientation from yaw/pitch/roll in degrees.
     */
    setYPROrientation(yaw: number, pitch: number, roll: number): this {
        const pose = yprToQuaternion({
            position: { ...this._position },
            angles: { yaw, pitch, roll }
        });
        this._position = { ...pose.position };
        this._quaternion = { ...pose.quaternion };
        return this;
    }

    /**
     * Translate by an ENU vector in meters.
     */
    translateENU(enu: ENU): this {
        const pose = translateGeoPose(this.toGeoPose(), enu);
        this._position = { ...pose.position };
        this._quaternion = { ...pose.quaternion };
        return this;
    }

    /**
     * Translate by explicit east/north/up distances (meters).
     */
    translateBy(east: number, north: number, up: number): this {
        return this.translateENU({ east, north, up });
    }

    /**
     * Translate north by meters.
     */
    translateNorth(northMeters: number): this {
        return this.translateENU({ east: 0, north: northMeters, up: 0 });
    }

    /**
     * Translate east by meters.
     */
    translateEast(eastMeters: number): this {
        return this.translateENU({ east: eastMeters, north: 0, up: 0 });
    }

    /**
     * Translate up by meters.
     */
    translateUp(upMeters: number): this {
        return this.translateENU({ east: 0, north: 0, up: upMeters });
    }

    /**
     * Rotate around the local up axis by degrees (yaw delta).
     */
    rotateAroundUpAxis(degrees: number): this {
        return this.rotateByYPRDelta({ yaw: degrees, pitch: 0, roll: 0 });
    }

    /**
     * Rotate around the local north axis by degrees (pitch delta).
     */
    rotateAroundNorthAxis(degrees: number): this {
        return this.rotateByYPRDelta({ yaw: 0, pitch: degrees, roll: 0 });
    }

    /**
     * Rotate around the local east axis by degrees (roll delta).
     */
    rotateAroundEastAxis(degrees: number): this {
        return this.rotateByYPRDelta({ yaw: 0, pitch: 0, roll: degrees });
    }

    /**
     * Apply a quaternion rotation to the current orientation.
     */
    rotateByQuaternion(rotation: Quaternion): this {
        const rotated = multiplyQuaternions(rotation, this._quaternion);
        this._quaternion = normalizeQuaternion(rotated);
        return this;
    }

    /**
     * Apply a relative pose (translation + rotation) to this pose.
     */
    applyRelativePose(relative: RelativePose): this {
        const pose = applyRelativePose(this.toGeoPose(), relative);
        this._position = { ...pose.position };
        this._quaternion = { ...pose.quaternion };
        return this;
    }

    /**
     * Normalize the internal quaternion to unit length.
     */
    normalizeOrientation(): this {
        this._quaternion = normalizeQuaternion(this._quaternion);
        return this;
    }

    // ---------------------------------------------------------------------
    // Internal helpers
    // ---------------------------------------------------------------------

    /**
     * Internal helper for applying a YPR delta in degrees.
     */
    private rotateByYPRDelta(delta: { yaw: number; pitch: number; roll: number }): this {
        const ypr = quaternionToYPR(this.toGeoPose());
        return this.setYPROrientation(
            ypr.angles.yaw + delta.yaw,
            ypr.angles.pitch + delta.pitch,
            ypr.angles.roll + delta.roll
        );
    }
}

/**
 * Return the identity quaternion.
 */
function identityQuaternion(): Quaternion {
    return { x: 0, y: 0, z: 0, w: 1 };
}

/** Degrees-to-radians conversion factor. */
const DEG_TO_RAD = Math.PI / 180;
/** Radians-to-degrees conversion factor. */
const RAD_TO_DEG = 180 / Math.PI;

/**
 * Convert degrees to radians.
 */
function degToRad(deg: number): number {
    return deg * DEG_TO_RAD;
}

/**
 * Convert radians to degrees.
 */
function radToDeg(rad: number): number {
    return rad * RAD_TO_DEG;
}

/**
 * Normalize a quaternion to unit length.
 */
function normalizeQuaternion(q: Quaternion): Quaternion {
    const mag = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
    if (mag === 0) return identityQuaternion();
    return { x: q.x / mag, y: q.y / mag, z: q.z / mag, w: q.w / mag };
}

/**
 * Multiply two quaternions (a * b).
 */
function multiplyQuaternions(a: Quaternion, b: Quaternion): Quaternion {
    return {
        x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
        y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
        z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
        w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z
    };
}

/**
 * Type guard for GeoPose (Basic Quaternion).
 */
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

/**
 * Type guard for GeoPoseBYPR (Basic YPR).
 */
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
