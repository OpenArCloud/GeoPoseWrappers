import type { Entity, JulianDate, Viewer } from "cesium";
import type { GeoPose } from "geopose-lib";
import {
  createEntityFromGeoPose,
  flyCameraToGeoPose,
  getCameraGeoPose,
  getEntityGeoPose,
  setCameraGeoPose,
  setEntityGeoPose
} from "./adapter.js";

/**
 * Convenience wrapper around Cesium viewer/camera GeoPose operations.
 */
export class GeoPoseController {
  private viewer: Viewer;

  constructor(viewer: Viewer) {
    this.viewer = viewer;
  }

  /**
   * Get the current camera GeoPose.
   */
  getCameraPose(): GeoPose {
    return getCameraGeoPose(this.viewer.camera);
  }

  /**
   * Set the camera GeoPose.
   */
  setCameraPose(pose: GeoPose): void {
    setCameraGeoPose(this.viewer.camera, pose);
  }

  /**
   * Fly the camera to a GeoPose.
   */
  flyCameraToPose(pose: GeoPose, duration: number = 2): void {
    flyCameraToGeoPose(this.viewer.camera, pose, duration);
  }

  /**
   * Get an entity GeoPose.
   */
  getEntityPose(entity: Entity, time?: JulianDate): GeoPose | null {
    return getEntityGeoPose(entity, time);
  }

  /**
   * Set an entity GeoPose.
   */
  setEntityPose(entity: Entity, pose: GeoPose): void {
    setEntityGeoPose(entity, pose);
  }

  /**
   * Add an entity at a GeoPose with optional Cesium entity options.
   */
  addEntityAtPose(pose: GeoPose, options: Entity.ConstructorOptions = {}): Entity {
    const { position, orientation } = createEntityFromGeoPose(pose);
    return this.viewer.entities.add({
      ...options,
      position,
      orientation
    });
  }
}
