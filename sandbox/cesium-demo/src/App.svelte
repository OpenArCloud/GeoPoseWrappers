<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import {
    Viewer,
    Ion,
    Cartesian3,
    Color,
    Entity,
    HeadingPitchRoll,
    Transforms,
    Math as CesiumMath,
  } from "cesium";
  import {
    getCameraGeoPose,
    setCameraGeoPose,
    flyCameraToGeoPose,
    getEntityGeoPose,
    setEntityGeoPose,
    createEntityFromGeoPose,
    type GeoPoseBQ,
  } from "./lib/GeoPoseConverter";

  let cesiumContainer: HTMLDivElement;
  let viewer: Viewer | null = null;
  let demoEntity: Entity | null = null;

  // Available 3D models - using local GLB assets in public/models folder
  // These are clearly directional models that help visualize orientation
  const modelOptions = [
    {
      id: "airplane",
      name: "Airplane",
      url: "/models/Cesium_Air.glb",
      scale: 50,
      description: "Cesium Air aircraft"
    },
    {
      id: "car",
      name: "Milk Truck",
      url: "/models/CesiumMilkTruck.glb",
      scale: 30,
      description: "Cesium Milk Truck vehicle"
    },
    {
      id: "person",
      name: "Person",
      url: "/models/Cesium_Man.glb",
      scale: 50,
      description: "Cesium Man character"
    },
    {
      id: "drone",
      name: "Drone",
      url: "/models/CesiumDrone.glb",
      scale: 20,
      description: "Cesium Drone aircraft"
    },
    {
      id: "balloon",
      name: "Hot Air Balloon",
      url: "/models/CesiumBalloon.glb",
      scale: 15,
      description: "Cesium Hot Air Balloon"
    },
    {
      id: "vehicle",
      name: "Ground Vehicle",
      url: "/models/GroundVehicle.glb",
      scale: 30,
      description: "Cesium Ground Vehicle"
    },
    {
      id: "box",
      name: "Box (Original)",
      url: "",
      scale: 1,
      description: "Simple box primitive"
    },
  ];

  let selectedModelId = "airplane";

  // Camera GeoPose state
  let cameraGeoPose: GeoPoseBQ = {
    position: { lat: 0, lon: 0, h: 10000000 },
    quaternion: { x: 0, y: 0, z: 0, w: 1 },
  };

  // Entity GeoPose state
  let entityGeoPose: GeoPoseBQ = {
    position: { lat: 40.7128, lon: -74.006, h: 500 },
    quaternion: { x: 0, y: 0, z: 0, w: 1 },
  };

  // Input fields for manual GeoPose entry
  let inputLat = 48.8584;
  let inputLon = 2.2945;
  let inputHeight = 1000;
  let inputHeading = 0;
  let inputPitch = -45;
  let inputRoll = 0;

  // Entity input fields
  let entityLat = 40.7128;
  let entityLon = -74.006;
  let entityHeight = 500;
  let entityHeading = 45;
  let entityPitch = 0;
  let entityRoll = 0;

  // Preset locations
  const presets = [
    { name: "Eiffel Tower", lat: 48.8584, lon: 2.2945, h: 1000 },
    { name: "Statue of Liberty", lat: 40.6892, lon: -74.0445, h: 500 },
    { name: "Sydney Opera House", lat: -33.8568, lon: 151.2153, h: 800 },
    { name: "Tokyo Tower", lat: 35.6586, lon: 139.7454, h: 600 },
    { name: "Big Ben", lat: 51.5007, lon: -0.1246, h: 400 },
  ];

  // Convert heading/pitch/roll to quaternion for display
  function hprToQuat(h: number, p: number, r: number) {
    const hRad = CesiumMath.toRadians(h);
    const pRad = CesiumMath.toRadians(p);
    const rRad = CesiumMath.toRadians(r);

    const cy = Math.cos(hRad / 2);
    const sy = Math.sin(hRad / 2);
    const cp = Math.cos(pRad / 2);
    const sp = Math.sin(pRad / 2);
    const cr = Math.cos(rRad / 2);
    const sr = Math.sin(rRad / 2);

    return {
      x: sr * cp * cy - cr * sp * sy,
      y: cr * sp * cy + sr * cp * sy,
      z: cr * cp * sy - sr * sp * cy,
      w: cr * cp * cy + sr * sp * sy,
    };
  }

  // Update camera pose display
  function updateCameraPoseDisplay() {
    if (!viewer) return;
    cameraGeoPose = getCameraGeoPose(viewer.camera);
  }

  // Fly camera to input position
  function flyToInput() {
    if (!viewer) return;

    const geoPose: GeoPoseBQ = {
      position: { lat: inputLat, lon: inputLon, h: inputHeight },
      quaternion: hprToQuat(inputHeading, inputPitch, inputRoll),
    };

    flyCameraToGeoPose(viewer.camera, geoPose, 2);
  }

  // Set camera instantly
  function setCameraInstant() {
    if (!viewer) return;

    const geoPose: GeoPoseBQ = {
      position: { lat: inputLat, lon: inputLon, h: inputHeight },
      quaternion: hprToQuat(inputHeading, inputPitch, inputRoll),
    };

    setCameraGeoPose(viewer.camera, geoPose);
    updateCameraPoseDisplay();
  }

  // Apply preset location
  function applyPreset(preset: (typeof presets)[0]) {
    inputLat = preset.lat;
    inputLon = preset.lon;
    inputHeight = preset.h;
    flyToInput();
  }

  // Get currently selected model config
  function getSelectedModel() {
    return modelOptions.find(m => m.id === selectedModelId) || modelOptions[0];
  }

  // Create/update demo entity
  function updateEntity() {
    if (!viewer) return;

    const geoPose: GeoPoseBQ = {
      position: { lat: entityLat, lon: entityLon, h: entityHeight },
      quaternion: hprToQuat(entityHeading, entityPitch, entityRoll),
    };

    const selectedModel = getSelectedModel();
    const { position, orientation } = createEntityFromGeoPose(geoPose);

    // Remove existing entity if model type changed
    if (demoEntity) {
      viewer.entities.remove(demoEntity);
      demoEntity = null;
    }

    // Create entity with selected model or box
    if (selectedModel.id === "box") {
      // Use simple box primitive
      demoEntity = viewer.entities.add({
        name: "GeoPose Demo Entity",
        position,
        orientation,
        box: {
          dimensions: new Cartesian3(100, 100, 100),
          material: Color.BLUE.withAlpha(0.7),
          outline: true,
          outlineColor: Color.WHITE,
        },
      });
    } else {
      // Use GLB model
      demoEntity = viewer.entities.add({
        name: `GeoPose Demo Entity (${selectedModel.name})`,
        position,
        orientation,
        model: {
          uri: selectedModel.url,
          scale: selectedModel.scale,
          minimumPixelSize: 64,
          maximumScale: selectedModel.scale * 2,
        },
      });
    }

    entityGeoPose = geoPose;
  }

  // Handle model selection change
  function onModelChange() {
    updateEntity();
  }

  // Read entity's current GeoPose
  function readEntityPose() {
    if (!demoEntity) return;

    const pose = getEntityGeoPose(demoEntity);
    if (pose) {
      entityGeoPose = pose;
      entityLat = pose.position.lat;
      entityLon = pose.position.lon;
      entityHeight = pose.position.h;
    }
  }

  // Fly to entity
  function flyToEntity() {
    if (!viewer || !demoEntity) return;

    viewer.flyTo(demoEntity, {
      duration: 2,
      offset: new HeadingPitchRoll(0, CesiumMath.toRadians(-45), 0) as any,
    });
  }

  // Copy GeoPose JSON to clipboard
  function copyGeoPoseJSON(pose: GeoPoseBQ, type: string) {
    const json = JSON.stringify(pose, null, 2);
    navigator.clipboard.writeText(json);
    alert(`${type} GeoPose copied to clipboard!`);
  }

  onMount(async () => {
    // Note: For Cesium Ion assets (terrain, imagery), get a free token at https://cesium.com/ion/
    // Without a token, basic OpenStreetMap imagery will be used

    viewer = new Viewer(cesiumContainer, {
      animation: false,
      timeline: false,
      baseLayerPicker: true,
      geocoder: false,  // Geocoder requires Ion token
      homeButton: true,
      sceneModePicker: true,
      navigationHelpButton: false,
      fullscreenButton: false,
    });

    // Update camera pose display periodically
    viewer.camera.changed.addEventListener(updateCameraPoseDisplay);
    viewer.camera.moveEnd.addEventListener(updateCameraPoseDisplay);

    // Initial update
    updateCameraPoseDisplay();

    // Create initial entity
    updateEntity();
  });

  onDestroy(() => {
    if (viewer) {
      viewer.destroy();
    }
  });

  // Format number for display
  function fmt(n: number, decimals = 6): string {
    return n.toFixed(decimals);
  }
</script>

<main>
  <div class="app-container">
    <div class="cesium-wrapper">
      <div bind:this={cesiumContainer} class="cesium-container"></div>
    </div>

    <div class="controls-panel">
      <h1>GeoPose + Cesium Demo</h1>
      <p class="subtitle">OGC GeoPose integration with CesiumJS</p>

      <!-- Current Camera GeoPose -->
      <section class="section">
        <h2>Current Camera GeoPose</h2>
        <div class="pose-display">
          <div class="pose-row">
            <span class="label">Position:</span>
            <span class="value">
              lat: {fmt(cameraGeoPose.position.lat)}°, lon: {fmt(
                cameraGeoPose.position.lon
              )}°, h: {fmt(cameraGeoPose.position.h, 1)}m
            </span>
          </div>
          <div class="pose-row">
            <span class="label">Quaternion:</span>
            <span class="value quaternion">
              x: {fmt(cameraGeoPose.quaternion.x, 4)}, y: {fmt(
                cameraGeoPose.quaternion.y,
                4
              )}, z: {fmt(cameraGeoPose.quaternion.z, 4)}, w: {fmt(
                cameraGeoPose.quaternion.w,
                4
              )}
            </span>
          </div>
        </div>
        <button class="btn-secondary" on:click={() => copyGeoPoseJSON(cameraGeoPose, "Camera")}>
          Copy Camera GeoPose JSON
        </button>
      </section>

      <!-- Set Camera Position -->
      <section class="section">
        <h2>Set Camera GeoPose</h2>

        <div class="presets">
          <span class="label">Presets:</span>
          {#each presets as preset}
            <button class="btn-preset" on:click={() => applyPreset(preset)}>
              {preset.name}
            </button>
          {/each}
        </div>

        <div class="input-grid">
          <div class="input-group">
            <label for="lat">Latitude (°)</label>
            <input id="lat" type="number" bind:value={inputLat} step="0.0001" />
          </div>
          <div class="input-group">
            <label for="lon">Longitude (°)</label>
            <input id="lon" type="number" bind:value={inputLon} step="0.0001" />
          </div>
          <div class="input-group">
            <label for="height">Height (m)</label>
            <input
              id="height"
              type="number"
              bind:value={inputHeight}
              step="100"
            />
          </div>
          <div class="input-group">
            <label for="heading">Heading (°)</label>
            <input
              id="heading"
              type="number"
              bind:value={inputHeading}
              step="5"
            />
          </div>
          <div class="input-group">
            <label for="pitch">Pitch (°)</label>
            <input id="pitch" type="number" bind:value={inputPitch} step="5" />
          </div>
          <div class="input-group">
            <label for="roll">Roll (°)</label>
            <input id="roll" type="number" bind:value={inputRoll} step="5" />
          </div>
        </div>

        <div class="button-row">
          <button class="btn-primary" on:click={flyToInput}>Fly To</button>
          <button class="btn-secondary" on:click={setCameraInstant}
            >Set Instantly</button
          >
        </div>
      </section>

      <!-- Entity Controls -->
      <section class="section">
        <h2>Entity GeoPose</h2>

        <!-- Model Selector -->
        <div class="model-selector">
          <label for="model-select">3D Model:</label>
          <select id="model-select" bind:value={selectedModelId} on:change={onModelChange}>
            {#each modelOptions as model}
              <option value={model.id}>{model.name}</option>
            {/each}
          </select>
          <span class="model-description">{getSelectedModel().description}</span>
        </div>

        <div class="pose-display">
          <div class="pose-row">
            <span class="label">Entity Position:</span>
            <span class="value">
              lat: {fmt(entityGeoPose.position.lat)}°, lon: {fmt(
                entityGeoPose.position.lon
              )}°, h: {fmt(entityGeoPose.position.h, 1)}m
            </span>
          </div>
        </div>

        <div class="input-grid">
          <div class="input-group">
            <label for="elat">Latitude (°)</label>
            <input
              id="elat"
              type="number"
              bind:value={entityLat}
              step="0.0001"
            />
          </div>
          <div class="input-group">
            <label for="elon">Longitude (°)</label>
            <input
              id="elon"
              type="number"
              bind:value={entityLon}
              step="0.0001"
            />
          </div>
          <div class="input-group">
            <label for="eheight">Height (m)</label>
            <input
              id="eheight"
              type="number"
              bind:value={entityHeight}
              step="10"
            />
          </div>
          <div class="input-group">
            <label for="eheading">Heading (°)</label>
            <input
              id="eheading"
              type="number"
              bind:value={entityHeading}
              step="15"
            />
          </div>
          <div class="input-group">
            <label for="epitch">Pitch (°)</label>
            <input
              id="epitch"
              type="number"
              bind:value={entityPitch}
              step="15"
            />
          </div>
          <div class="input-group">
            <label for="eroll">Roll (°)</label>
            <input id="eroll" type="number" bind:value={entityRoll} step="15" />
          </div>
        </div>

        <div class="button-row">
          <button class="btn-primary" on:click={updateEntity}
            >Update Entity</button
          >
          <button class="btn-secondary" on:click={flyToEntity}
            >Fly to Entity</button
          >
          <button class="btn-secondary" on:click={readEntityPose}
            >Read Pose</button
          >
        </div>
        <button
          class="btn-secondary"
          style="margin-top: 8px; width: 100%;"
          on:click={() => copyGeoPoseJSON(entityGeoPose, "Entity")}
        >
          Copy Entity GeoPose JSON
        </button>
      </section>

      <!-- Info -->
      <section class="section info">
        <h2>About</h2>
        <p>
          This demo showcases the <strong>GeoPose ↔ Cesium</strong> converter library,
          enabling interoperability between the
          <a href="https://docs.ogc.org/is/21-056r11/21-056r11.html"
            >OGC GeoPose standard</a
          > and CesiumJS.
        </p>
        <p>
          <strong>GeoPose</strong> uses an ENU (East-North-Up) local tangent plane
          frame, while <strong>Cesium</strong> uses ECEF (Earth-Centered Earth-Fixed).
          The library handles the coordinate frame transformations automatically.
        </p>
      </section>
    </div>
  </div>
</main>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
      Oxygen-Sans, Ubuntu, Cantarell, "Helvetica Neue", sans-serif;
    background: #1a1a2e;
    color: #eee;
  }

  main {
    height: 100vh;
    width: 100vw;
    overflow: hidden;
  }

  .app-container {
    display: flex;
    height: 100%;
  }

  .cesium-wrapper {
    flex: 1;
    position: relative;
  }

  .cesium-container {
    width: 100%;
    height: 100%;
  }

  .controls-panel {
    width: 380px;
    background: #16213e;
    padding: 20px;
    overflow-y: auto;
    border-left: 1px solid #0f3460;
  }

  h1 {
    margin: 0 0 4px 0;
    font-size: 1.5rem;
    color: #e94560;
  }

  .subtitle {
    margin: 0 0 20px 0;
    color: #888;
    font-size: 0.9rem;
  }

  h2 {
    margin: 0 0 12px 0;
    font-size: 1rem;
    color: #53d9d9;
    border-bottom: 1px solid #0f3460;
    padding-bottom: 6px;
  }

  .section {
    margin-bottom: 24px;
    background: #1a1a2e;
    padding: 16px;
    border-radius: 8px;
  }

  .pose-display {
    font-family: "SF Mono", Monaco, monospace;
    font-size: 0.8rem;
    background: #0f0f1a;
    padding: 10px;
    border-radius: 4px;
    margin-bottom: 12px;
  }

  .pose-row {
    margin-bottom: 6px;
  }

  .pose-row:last-child {
    margin-bottom: 0;
  }

  .label {
    color: #888;
    display: block;
    margin-bottom: 2px;
  }

  .value {
    color: #4ecca3;
    word-break: break-all;
  }

  .value.quaternion {
    font-size: 0.75rem;
  }

  .presets {
    margin-bottom: 12px;
  }

  .presets .label {
    display: inline;
    margin-right: 8px;
  }

  .btn-preset {
    background: #0f3460;
    color: #eee;
    border: none;
    padding: 4px 8px;
    margin: 2px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.75rem;
  }

  .btn-preset:hover {
    background: #e94560;
  }

  .input-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-bottom: 12px;
  }

  .input-group {
    display: flex;
    flex-direction: column;
  }

  .input-group label {
    font-size: 0.75rem;
    color: #888;
    margin-bottom: 4px;
  }

  .input-group input {
    background: #0f0f1a;
    border: 1px solid #0f3460;
    color: #eee;
    padding: 8px;
    border-radius: 4px;
    font-size: 0.9rem;
  }

  .input-group input:focus {
    outline: none;
    border-color: #e94560;
  }

  .button-row {
    display: flex;
    gap: 8px;
  }

  .btn-primary,
  .btn-secondary {
    flex: 1;
    padding: 10px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 500;
  }

  .btn-primary {
    background: #e94560;
    color: white;
  }

  .btn-primary:hover {
    background: #ff6b6b;
  }

  .btn-secondary {
    background: #0f3460;
    color: #eee;
  }

  .btn-secondary:hover {
    background: #16213e;
    border: 1px solid #e94560;
  }

  .info p {
    font-size: 0.85rem;
    line-height: 1.5;
    color: #aaa;
  }

  .info a {
    color: #53d9d9;
  }

  /* Model Selector */
  .model-selector {
    margin-bottom: 16px;
    padding: 12px;
    background: #0f0f1a;
    border-radius: 4px;
  }

  .model-selector label {
    display: block;
    font-size: 0.75rem;
    color: #888;
    margin-bottom: 6px;
  }

  .model-selector select {
    width: 100%;
    background: #16213e;
    border: 1px solid #0f3460;
    color: #eee;
    padding: 10px;
    border-radius: 4px;
    font-size: 0.9rem;
    cursor: pointer;
    margin-bottom: 6px;
  }

  .model-selector select:focus {
    outline: none;
    border-color: #e94560;
  }

  .model-selector select option {
    background: #16213e;
    color: #eee;
    padding: 8px;
  }

  .model-description {
    display: block;
    font-size: 0.75rem;
    color: #4ecca3;
    font-style: italic;
  }

  /* Hide Cesium credits for cleaner demo */
  :global(.cesium-credit-logoContainer),
  :global(.cesium-credit-expand-link) {
    display: none !important;
  }
</style>
