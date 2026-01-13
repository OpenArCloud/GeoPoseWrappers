<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import {
    Viewer,
    Cartesian3,
    Color,
    Entity,
    HeadingPitchRoll,
    Transforms,
    Math as CesiumMath,
    CallbackProperty,
    PolylineGraphics
  } from "cesium";
  import {
    createEntityFromGeoPose,
    type GeoPoseBQ,
  } from "./lib/GeoPoseConverter";
  
  // Import from our new library via alias
  import { 
    geoPoseToLocalENU, 
    localENUToGeoPose, 
    translateGeoPose, 
    interpolatePose,
    getRelativePose,
    type ENU
  } from "@geopose/transforms";

  let cesiumContainer: HTMLDivElement;
  let viewer: Viewer | null = null;
  
  // Test State
  let sourceEntity: Entity | null = null;
  let targetEntity: Entity | null = null;
  let pathEntity: Entity | null = null;
  
  // Initial GeoPose (Paris)
  let initialPose: GeoPoseBQ = {
    position: { lat: 48.8584, lon: 2.2945, h: 500 },
    quaternion: { x: 0, y: 0, z: 0, w: 1 }
  };

  let currentPose = { ...initialPose };
  let testLog: string[] = [];

  function log(msg: string) {
    testLog = [msg, ...testLog].slice(0, 50);
  }

  // --- Visual Helpers ---

  function updateSourceEntity(pose: GeoPoseBQ) {
    if (!viewer) return;
    const { position, orientation } = createEntityFromGeoPose(pose);
    
    if (sourceEntity) {
      sourceEntity.position = position as any;
      sourceEntity.orientation = orientation as any;
    } else {
      sourceEntity = viewer.entities.add({
        name: "Source",
        position,
        orientation,
        model: {
          uri: "/models/Cesium_Air.glb",
          scale: 50,
          minimumPixelSize: 64
        },
        path: {
            resolution: 1,
            material: new Color(1, 0, 0, 0.5),
            width: 2
        }
      });
    }
    currentPose = pose;
  }

  function updateTargetEntity(pose: GeoPoseBQ) {
    if (!viewer) return;
    const { position, orientation } = createEntityFromGeoPose(pose);
    
    if (targetEntity) {
      targetEntity.position = position as any;
      targetEntity.orientation = orientation as any;
    } else {
      targetEntity = viewer.entities.add({
        name: "Target",
        position,
        orientation,
        model: {
          uri: "/models/CesiumDrone.glb",
          scale: 20,
          minimumPixelSize: 64
        }
      });
    }
  }

  // --- Test Functions ---

  function reset() {
    updateSourceEntity(initialPose);
    if (targetEntity) {
      viewer?.entities.remove(targetEntity);
      targetEntity = null;
    }
    if (pathEntity) {
        viewer?.entities.remove(pathEntity);
        pathEntity = null;
    }
    viewer?.camera.flyToBoundingSphere(sourceEntity?.model?.boundingSphere as any); // rough focus
    log("Reset to initial state.");
  }

  function testTranslateNorth() {
    log("Running: Translate 100m North");
    const newPose = translateGeoPose(currentPose, { east: 0, north: 100, up: 0 });
    updateSourceEntity(newPose);
    log(`Result: Lat ${newPose.position.lat.toFixed(6)}, Lon ${newPose.position.lon.toFixed(6)}`);
  }

  function testTranslateEast() {
    log("Running: Translate 100m East");
    const newPose = translateGeoPose(currentPose, { east: 100, north: 0, up: 0 });
    updateSourceEntity(newPose);
    log(`Result: Lat ${newPose.position.lat.toFixed(6)}, Lon ${newPose.position.lon.toFixed(6)}`);
  }

  function testTranslateUp() {
    log("Running: Translate 50m Up");
    const newPose = translateGeoPose(currentPose, { east: 0, north: 0, up: 50 });
    updateSourceEntity(newPose);
    log(`Result: H ${newPose.position.h.toFixed(2)}m`);
  }

  function testRelativePose() {
    log("Running: Calculate Relative Pose to Target");
    // Create a target 200m NE
    const targetPose = translateGeoPose(currentPose, { east: 200, north: 200, up: 50 });
    updateTargetEntity(targetPose);
    
    // Calculate relative
    const relative = getRelativePose(currentPose, targetPose);
    log(`Relative: E=${relative.translation.east.toFixed(1)}, N=${relative.translation.north.toFixed(1)}, U=${relative.translation.up.toFixed(1)}`);
    
    if (Math.abs(relative.translation.east - 200) < 1 && Math.abs(relative.translation.north - 200) < 1) {
        log("PASS: Relative pose matches expected translation.");
    } else {
        log("FAIL: Relative pose mismatch.");
    }
  }

  function runInterpolation() {
    log("Running: Interpolation (Animation)");
    const startPose = { ...currentPose };
    const endPose = translateGeoPose(startPose, { east: 500, north: 0, up: 100 });
    updateTargetEntity(endPose);

    let t = 0;
    const interval = setInterval(() => {
        t += 0.02;
        if (t > 1) {
            t = 1;
            clearInterval(interval);
            log("Interpolation complete.");
        }
        const p = interpolatePose(startPose, endPose, t);
        updateSourceEntity(p);
    }, 50);
  }

  // --- Lifecycle ---

  onMount(() => {
    viewer = new Viewer(cesiumContainer, {
      animation: false,
      timeline: false,
      baseLayerPicker: true, 
      geocoder: false,
      homeButton: true,
      sceneModePicker: true,
      navigationHelpButton: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false
    });

    // Fly to Paris initially
    const opts = createEntityFromGeoPose(initialPose);
    viewer.camera.flyTo({
        destination: opts.position,
        orientation: {
            heading: 0,
            pitch: CesiumMath.toRadians(-45),
            roll: 0
        }
    });

    updateSourceEntity(initialPose);
    log("Ready. GeoPose Transforms Library loaded.");
  });

  onDestroy(() => {
    viewer?.destroy();
  });
</script>

<main>
  <div class="cesium-wrapper">
    <div bind:this={cesiumContainer} class="cesium-container"></div>
  </div>

  <div class="controls-panel">
    <h1>Transforms Test Runner</h1>
    <p class="subtitle">Visual Verification for @geopose/transforms</p>

    <div class="test-controls">
        <button on:click={reset} class="btn-reset">Reset Position</button>
        
        <h3>Local Translation</h3>
        <div class="btn-group">
            <button on:click={testTranslateNorth}>North 100m</button>
            <button on:click={testTranslateEast}>East 100m</button>
            <button on:click={testTranslateUp}>Up 50m</button>
        </div>

        <h3>Advanced Operations</h3>
        <div class="btn-group column">
            <button on:click={testRelativePose}>Test Relative Pose</button>
            <button on:click={runInterpolation}>Run Interpolation (Anim)</button>
        </div>
    </div>

    <div class="console">
        <h3>Test Log</h3>
        <div class="log-output">
            {#each testLog as line}
                <div class="log-line">{line}</div>
            {/each}
        </div>
    </div>
  </div>
</main>

<style>
  :global(body) { margin: 0; padding: 0; background: #1a1a2e; color: #eee; font-family: sans-serif; }
  main { display: flex; height: 100vh; width: 100vw; }
  .cesium-wrapper { flex: 1; }
  .cesium-container { width: 100%; height: 100%; }
  
  .controls-panel {
    width: 320px;
    background: #16213e;
    padding: 20px;
    border-left: 1px solid #0f3460;
    display: flex;
    flex-direction: column;
  }

  h1 { font-size: 1.2rem; color: #e94560; margin: 0; }
  h3 { font-size: 0.9rem; color: #4ecca3; margin: 15px 0 8px 0; border-bottom: 1px solid #4ecca3; padding-bottom: 4px; }
  .subtitle { color: #888; font-size: 0.8rem; margin-bottom: 20px; }

  button {
    background: #0f3460;
    color: white;
    border: none;
    padding: 8px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.85rem;
    transition: background 0.2s;
  }
  button:hover { background: #e94560; }
  
  .btn-reset { width: 100%; background: #e94560; font-weight: bold; }
  .btn-reset:hover { background: #ff6b6b; }

  .btn-group { display: flex; gap: 8px; margin-bottom: 8px; }
  .btn-group.column { flex-direction: column; }
  .btn-group button { flex: 1; }

  .console { flex: 1; display: flex; flex-direction: column; margin-top: 20px; overflow: hidden; }
  .log-output { 
    flex: 1; 
    background: #0f0f1a; 
    border: 1px solid #0f3460; 
    border-radius: 4px; 
    padding: 8px; 
    overflow-y: auto; 
    font-family: monospace; 
    font-size: 0.75rem; 
  }
  .log-line { margin-bottom: 4px; border-bottom: 1px solid #1a1a2e; padding-bottom: 2px; }
</style>
