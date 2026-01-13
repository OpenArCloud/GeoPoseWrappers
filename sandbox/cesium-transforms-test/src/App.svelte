<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import {
    Viewer,
    Cartesian3,
    Color,
    Entity,
    Ion,
    GoogleMaps,
    createGooglePhotorealistic3DTileset,
    Math as CesiumMath
  } from "cesium";
  import type { Cesium3DTileset } from "cesium";
  import { createEntityFromGeoPose, type GeoPose } from "./lib/GeoPoseConverter";

  import {
    translateGeoPose,
    interpolatePose,
    getRelativePose,
    yprToQuaternion
  } from "geopose-lib";

  import { landmarks, type Landmark } from "./data/landmarks";
  import { scenarios, type Scenario, type ScenarioOperation } from "./data/scenarios";

  const GOOGLE_API_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? "").trim();
  const ION_TOKEN = (import.meta.env.VITE_CESIUM_ION_TOKEN ?? "").trim();
  const googleTilesAvailable = GOOGLE_API_KEY.length > 0;

  type ModelOption = {
    id: string;
    label: string;
    uri: string;
    scale: number;
    minPixelSize: number;
  };

  const modelOptions: ModelOption[] = [
    {
      id: "airplane",
      label: "Airplane",
      uri: "/models/Cesium_Air.glb",
      scale: 50,
      minPixelSize: 64
    },
    {
      id: "drone",
      label: "Drone",
      uri: "/models/CesiumDrone.glb",
      scale: 20,
      minPixelSize: 48
    },
    {
      id: "person",
      label: "Person",
      uri: "/models/Cesium_Man.glb",
      scale: 50,
      minPixelSize: 48
    },
    {
      id: "truck",
      label: "Milk Truck",
      uri: "/models/CesiumMilkTruck.glb",
      scale: 30,
      minPixelSize: 48
    },
    {
      id: "balloon",
      label: "Hot Air Balloon",
      uri: "/models/CesiumBalloon.glb",
      scale: 15,
      minPixelSize: 48
    },
    {
      id: "vehicle",
      label: "Ground Vehicle",
      uri: "/models/GroundVehicle.glb",
      scale: 30,
      minPixelSize: 48
    }
  ];

  let selectedLandmarkId = landmarks[0]?.id ?? "";
  let selectedScenarioId = scenarios[0]?.id ?? "";
  let sourceModelId = modelOptions[0]?.id ?? "airplane";
  let targetModelId = modelOptions[1]?.id ?? modelOptions[0]?.id ?? "drone";

  let cesiumContainer: HTMLDivElement;
  let viewer: Viewer | null = null;

  let sourceEntity: Entity | null = null;
  let targetEntity: Entity | null = null;
  let pathEntity: Entity | null = null;

  let googleTileset: Cesium3DTileset | null = null;
  let googleTilesEnabled = false;
  let googleTilesStatus: "idle" | "loading" | "ready" | "error" = "idle";
  let googleTilesError = "";

  let initialPose: GeoPose = buildPoseFromLandmark(
    getLandmarkById(selectedLandmarkId) ?? landmarks[0]
  );
  let currentPose = { ...initialPose };
  let lastTargetPose: GeoPose | null = null;
  let testLog: string[] = [];

  function log(msg: string) {
    testLog = [msg, ...testLog].slice(0, 60);
  }

  function getLandmarkById(id: string): Landmark | undefined {
    return landmarks.find((landmark) => landmark.id === id);
  }

  function getScenarioById(id: string): Scenario | undefined {
    return scenarios.find((scenario) => scenario.id === id);
  }

  function getModelOption(id: string): ModelOption | undefined {
    return modelOptions.find((model) => model.id === id);
  }

  function buildPoseFromLandmark(landmark: Landmark): GeoPose {
    return {
      position: { lat: landmark.lat, lon: landmark.lon, h: landmark.h },
      quaternion: { x: 0, y: 0, z: 0, w: 1 }
    };
  }

  function focusCamera(landmark: Landmark) {
    if (!viewer) return;
    const height = Math.max(landmark.cameraH, landmark.h + 400);
    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(landmark.lon, landmark.lat, height),
      orientation: {
        heading: 0,
        pitch: CesiumMath.toRadians(-45),
        roll: 0
      }
    });
  }

  function buildModelGraphics(modelId: string) {
    const model = getModelOption(modelId);
    if (!model) return undefined;
    return {
      uri: model.uri,
      scale: model.scale,
      minimumPixelSize: model.minPixelSize
    };
  }

  function applyModelToEntity(entity: Entity, modelId: string) {
    const model = getModelOption(modelId);
    if (!model) return;
    entity.model = {
      uri: model.uri,
      scale: model.scale,
      minimumPixelSize: model.minPixelSize
    } as any;
  }

  function updateSourceEntity(pose: GeoPose) {
    if (!viewer) return;
    const { position, orientation } = createEntityFromGeoPose(pose);
    const modelGraphics = buildModelGraphics(sourceModelId);

    if (sourceEntity) {
      sourceEntity.position = position as any;
      sourceEntity.orientation = orientation as any;
      if (modelGraphics) {
        sourceEntity.model = modelGraphics as any;
      }
    } else {
      sourceEntity = viewer.entities.add({
        name: "Source",
        position,
        orientation,
        model: modelGraphics as any,
        path: {
          resolution: 1,
          material: new Color(1, 0, 0, 0.5),
          width: 2
        }
      });
    }
    currentPose = pose;
  }

  function updateTargetEntity(pose: GeoPose) {
    if (!viewer) return;
    const { position, orientation } = createEntityFromGeoPose(pose);
    const modelGraphics = buildModelGraphics(targetModelId);

    if (targetEntity) {
      targetEntity.position = position as any;
      targetEntity.orientation = orientation as any;
      if (modelGraphics) {
        targetEntity.model = modelGraphics as any;
      }
    } else {
      targetEntity = viewer.entities.add({
        name: "Target",
        position,
        orientation,
        model: modelGraphics as any
      });
    }
    lastTargetPose = pose;
  }

  function clearTarget() {
    if (targetEntity) {
      viewer?.entities.remove(targetEntity);
      targetEntity = null;
    }
    if (pathEntity) {
      viewer?.entities.remove(pathEntity);
      pathEntity = null;
    }
    lastTargetPose = null;
  }

  function setLandmarkById(id: string, fly: boolean) {
    const landmark = getLandmarkById(id);
    if (!landmark) {
      log(`Unknown landmark: ${id}`);
      return;
    }

    initialPose = buildPoseFromLandmark(landmark);
    currentPose = { ...initialPose };
    updateSourceEntity(initialPose);
    clearTarget();
    if (fly) {
      focusCamera(landmark);
    }
    log(`Location set: ${landmark.name}`);
  }

  function handleSourceModelChange() {
    if (sourceEntity) {
      applyModelToEntity(sourceEntity, sourceModelId);
    }
  }

  function handleTargetModelChange() {
    if (targetEntity) {
      applyModelToEntity(targetEntity, targetModelId);
    }
  }

  function handleLandmarkChange() {
    setLandmarkById(selectedLandmarkId, true);
  }

  function applyScenarioOperation(
    pose: GeoPose,
    op: ScenarioOperation
  ): GeoPose {
    if (op.type === "translate") {
      return translateGeoPose(pose, {
        east: op.east,
        north: op.north,
        up: op.up
      });
    }
    if (op.type === "setYPR") {
      return yprToQuaternion({
        position: pose.position,
        angles: { yaw: op.yaw, pitch: op.pitch, roll: op.roll }
      });
    }
    return pose;
  }

  function runSelectedScenario() {
    const scenario = getScenarioById(selectedScenarioId);
    if (!scenario) {
      log("Scenario not found.");
      return;
    }
    const landmark = getLandmarkById(scenario.locationId);
    if (!landmark) {
      log(`Scenario location missing: ${scenario.locationId}`);
      return;
    }

    selectedLandmarkId = landmark.id;
    sourceModelId = scenario.sourceModelId;
    targetModelId = scenario.targetModelId;

    const basePose = buildPoseFromLandmark(landmark);
    updateSourceEntity(basePose);

    let pose = basePose;
    for (const op of scenario.operations) {
      pose = applyScenarioOperation(pose, op);
    }
    updateTargetEntity(pose);
    focusCamera(landmark);
    log(`Scenario: ${scenario.name}`);
  }

  async function enableGoogleTiles() {
    if (!viewer) return;
    if (!googleTilesAvailable) {
      googleTilesStatus = "error";
      googleTilesError = "Missing VITE_GOOGLE_MAPS_API_KEY in .env.local";
      log("Google 3D Tiles key not set.");
      return;
    }

    googleTilesError = "";
    googleTilesStatus = "loading";
    GoogleMaps.defaultApiKey = GOOGLE_API_KEY;

    try {
      if (!googleTileset) {
        googleTileset = await createGooglePhotorealistic3DTileset();
        viewer.scene.primitives.add(googleTileset);
      }
      googleTileset.show = true;
      viewer.scene.globe.show = false;
      googleTilesEnabled = true;
      googleTilesStatus = "ready";
      log("Google Photorealistic 3D Tiles enabled.");
    } catch (error) {
      googleTilesStatus = "error";
      googleTilesError = error instanceof Error ? error.message : String(error);
      log("Failed to load Google 3D Tiles.");
    }
  }

  function disableGoogleTiles() {
    if (!viewer) return;
    if (googleTileset) {
      googleTileset.show = false;
    }
    viewer.scene.globe.show = true;
    googleTilesEnabled = false;
    googleTilesStatus = "idle";
    log("Google 3D Tiles disabled.");
  }

  async function toggleGoogleTiles() {
    if (googleTilesEnabled) {
      disableGoogleTiles();
    } else {
      await enableGoogleTiles();
    }
  }

  function reset() {
    const landmark = getLandmarkById(selectedLandmarkId);
    if (!landmark) return;
    updateSourceEntity(buildPoseFromLandmark(landmark));
    clearTarget();
    focusCamera(landmark);
    log("Reset to selected location.");
  }

  function testTranslateNorth() {
    log("Running: Translate 100m North");
    const newPose = translateGeoPose(currentPose, { east: 0, north: 100, up: 0 });
    updateSourceEntity(newPose);
    log(
      `Result: Lat ${newPose.position.lat.toFixed(6)}, Lon ${newPose.position.lon.toFixed(6)}`
    );
  }

  function testTranslateEast() {
    log("Running: Translate 100m East");
    const newPose = translateGeoPose(currentPose, { east: 100, north: 0, up: 0 });
    updateSourceEntity(newPose);
    log(
      `Result: Lat ${newPose.position.lat.toFixed(6)}, Lon ${newPose.position.lon.toFixed(6)}`
    );
  }

  function testTranslateUp() {
    log("Running: Translate 50m Up");
    const newPose = translateGeoPose(currentPose, { east: 0, north: 0, up: 50 });
    updateSourceEntity(newPose);
    log(`Result: H ${newPose.position.h.toFixed(2)}m`);
  }

  function testRelativePose() {
    log("Running: Calculate Relative Pose to Target");
    const targetPose = translateGeoPose(currentPose, { east: 200, north: 200, up: 50 });
    updateTargetEntity(targetPose);

    const relative = getRelativePose(currentPose, targetPose);
    log(
      `Relative: E=${relative.translation.east.toFixed(1)}, N=${relative.translation.north.toFixed(
        1
      )}, U=${relative.translation.up.toFixed(1)}`
    );

    if (
      Math.abs(relative.translation.east - 200) < 1 &&
      Math.abs(relative.translation.north - 200) < 1
    ) {
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

  onMount(async () => {
    if (ION_TOKEN) {
      Ion.defaultAccessToken = ION_TOKEN;
    }

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

    setLandmarkById(selectedLandmarkId, true);

    if (ION_TOKEN) {
      log("Cesium Ion token loaded.");
    }
    if (!googleTilesAvailable) {
      log("Google 3D Tiles key not set. Add VITE_GOOGLE_MAPS_API_KEY in .env.local.");
    }
    log("Ready. GeoPose lib loaded.");
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
    <p class="subtitle">Visual Verification for geopose-lib</p>

    <div class="test-controls">
      <button on:click={reset} class="btn-reset">Reset Position</button>

      <h3>Landmarks</h3>
      <div class="field">
        <label for="landmark-select">Location</label>
        <select
          id="landmark-select"
          bind:value={selectedLandmarkId}
          on:change={handleLandmarkChange}
        >
          {#each landmarks as landmark}
            <option value={landmark.id}>{landmark.name}</option>
          {/each}
        </select>
      </div>

      <h3>Scenarios</h3>
      <div class="field">
        <label for="scenario-select">Scenario</label>
        <select id="scenario-select" bind:value={selectedScenarioId}>
          {#each scenarios as scenario}
            <option value={scenario.id}>{scenario.name}</option>
          {/each}
        </select>
      </div>
      <button on:click={runSelectedScenario} class="btn-secondary">
        Run Scenario
      </button>

      <h3>Models</h3>
      <div class="field">
        <label for="source-model-select">Source Model</label>
        <select
          id="source-model-select"
          bind:value={sourceModelId}
          on:change={handleSourceModelChange}
        >
          {#each modelOptions as model}
            <option value={model.id}>{model.label}</option>
          {/each}
        </select>
      </div>
      <div class="field">
        <label for="target-model-select">Target Model</label>
        <select
          id="target-model-select"
          bind:value={targetModelId}
          on:change={handleTargetModelChange}
        >
          {#each modelOptions as model}
            <option value={model.id}>{model.label}</option>
          {/each}
        </select>
      </div>

      <h3>Google 3D Tiles</h3>
      <button
        on:click={toggleGoogleTiles}
        class="btn-secondary"
        disabled={!googleTilesAvailable || googleTilesStatus === "loading"}
      >
        {googleTilesEnabled ? "Disable Photorealistic Tiles" : "Enable Photorealistic Tiles"}
      </button>
      <div class="status">
        {#if googleTilesAvailable}
          <div>Status: {googleTilesStatus}</div>
        {:else}
          <div class="muted">Set VITE_GOOGLE_MAPS_API_KEY in .env.local</div>
        {/if}
        {#if googleTilesError}
          <div class="error">{googleTilesError}</div>
        {/if}
      </div>

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
  button:disabled { opacity: 0.5; cursor: not-allowed; }

  .btn-reset { width: 100%; background: #e94560; font-weight: bold; }
  .btn-reset:hover { background: #ff6b6b; }
  .btn-secondary { width: 100%; margin-bottom: 4px; }

  .btn-group { display: flex; gap: 8px; margin-bottom: 8px; }
  .btn-group.column { flex-direction: column; }
  .btn-group button { flex: 1; }

  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 10px;
  }

  label {
    font-size: 0.7rem;
    color: #9aa3b2;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  select {
    background: #0f3460;
    color: #fff;
    border: 1px solid #1b3b6d;
    border-radius: 4px;
    padding: 6px 8px;
    font-size: 0.85rem;
  }

  .status {
    margin-top: 6px;
    font-size: 0.75rem;
    color: #9aa3b2;
  }

  .muted { color: #7f8aa0; }
  .error { color: #ff6b6b; margin-top: 4px; }

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
