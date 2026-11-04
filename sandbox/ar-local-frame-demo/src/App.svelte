<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import {
    Viewer,
    Cartesian3,
    Color,
    Entity,
    Transforms,
    Math as CesiumMath,
    Matrix4,
    PolylineArrowMaterialProperty,
  } from "cesium";
  import {
    createEntityFromGeoPose,
    type GeoPose,
  } from "cesium-geopose";
  import * as THREE from "three";
  import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

  // Shared transforms used by both views and the regression tests
  import { ENU_TO_EUS, quat, ypr as yprToQuat, sessionPlacement } from "./lib/frames";
  let placement: ReturnType<typeof sessionPlacement>;

  // DOM references
  let cesiumContainer: HTMLDivElement;
  let sessionViewContainer: HTMLDivElement;
  let cameraViewContainer: HTMLDivElement;

  // Cesium viewer
  let viewer: Viewer | null = null;
  let cesiumEntities: Entity[] = [];

  // Three.js - Session View (AR session frame from above)
  let sessionScene: THREE.Scene;
  let sessionCamera: THREE.PerspectiveCamera;
  let sessionRenderer: THREE.WebGLRenderer;
  let sessionControls: OrbitControls;

  // Three.js - Camera View (what device sees)
  let cameraScene: THREE.Scene;
  let cameraViewCamera: THREE.PerspectiveCamera;
  let cameraRenderer: THREE.WebGLRenderer;

  let animationFrameId: number;

  // Shared Three.js objects (exist in both scenes)
  let sessionDeviceMesh: THREE.Group;
  let sessionAssetMesh: THREE.Group;
  let sessionFrameAxes: THREE.Group;
  let sessionOriginMarker: THREE.Mesh;

  let cameraAssetMesh: THREE.Group;
  let cameraFrameAxes: THREE.Group;
  let cameraOriginMarker: THREE.Mesh;

  // ============================================
  // STATE: Device Camera GeoPose (from VPS)
  // ============================================
  // This is what VPS returns - the device camera's global position and orientation
  let deviceCameraLat = 48.8584;
  let deviceCameraLon = 2.2945;
  let deviceCameraHeight = 1.7; // Eye level
  let deviceCameraYaw = 45;     // GeoPose intrinsic yaw, not compass heading
  let deviceCameraPitch = 0;   // Camera body +X right, +Y up, -Z view
  let deviceCameraRoll = 75;   // At yaw=0, roll=90 looks North along the horizon

  // ============================================
  // STATE: Device Local Pose in AR Session
  // ============================================
  // Where the device is within the AR session's coordinate frame
  // Right-handed session: Y=up, camera looks along -Z when local orientation is identity
  // This changes as the user moves around within the AR session
  let deviceLocalX = 2.0;    // meters from session origin
  let deviceLocalY = 0.0;    // height above session ground plane
  let deviceLocalZ = -3.0;   // meters from session origin
  let deviceLocalYaw = 0;   // device orientation within session (degrees)
  let deviceLocalPitch = 0;
  let deviceLocalRoll = 0;

  // ============================================
  // STATE: 3D Asset GeoPose (known global position)
  // ============================================
  let assetLat = 48.8586;
  let assetLon = 2.2948;
  let assetHeight = 0.0;  // On the ground
  let assetYaw = 0;
  let assetPitch = 0;
  let assetRoll = 0;

  // ============================================
  // STATE: AR Session Frame Yaw (CCW rotation from East)
  // ============================================
  // How session +X rotates from East toward North at the device position
  // This is typically determined when the AR session starts
  let sessionFrameYaw = 15; // degrees CCW: yaw=0 means +X East, +Y Up, +Z South

  // ============================================
  // COMPUTED: AR Session Origin GeoPose
  // ============================================
  // Derived from device camera GeoPose and device local pose
  let sessionOriginLat = 0;
  let sessionOriginLon = 0;
  let sessionOriginHeight = 0;

  // ============================================
  // COMPUTED: Asset position in AR Session Frame
  // ============================================
  let assetInSessionX = 0;
  let assetInSessionY = 0;
  let assetInSessionZ = 0;
  let assetInSessionYaw = 0;

  // Presets
  const presets = [
    {
      name: "Street Corner",
      deviceCamera: { lat: 48.8584, lon: 2.2945, h: 1.7, yaw: 45, pitch: 0, roll: 75 },
      deviceLocal: { x: 2, y: 0, z: -3 },
      asset: { lat: 48.8586, lon: 2.2948, h: 0, yaw: 0 },
      sessionYaw: 15,
    },
    {
      name: "Museum Interior",
      deviceCamera: { lat: 48.8606, lon: 2.3376, h: 1.6, yaw: -30, pitch: 0, roll: 80 },
      deviceLocal: { x: 5, y: 0, z: -2 },
      asset: { lat: 48.8606, lon: 2.3377, h: 1.0, yaw: 180 },
      sessionYaw: -45,
    },
    {
      name: "Looking Up",
      deviceCamera: { lat: 48.8566, lon: 2.3522, h: 1.5, yaw: 0, pitch: 0, roll: 120 },
      deviceLocal: { x: 0, y: 0, z: -1 },
      asset: { lat: 48.8566, lon: 2.3523, h: 5, yaw: 0 },
      sessionYaw: 60,
    },
  ];

  // Build GeoPose for device camera
  function getDeviceCameraGeoPose(): GeoPose {
    return {
      position: { lat: deviceCameraLat, lon: deviceCameraLon, h: deviceCameraHeight },
      quaternion: yprToQuat(deviceCameraYaw, deviceCameraPitch, deviceCameraRoll),
    };
  }

  // Build GeoPose for asset
  function getAssetGeoPose(): GeoPose {
    return {
      position: { lat: assetLat, lon: assetLon, h: assetHeight },
      quaternion: yprToQuat(assetYaw, assetPitch, assetRoll),
    };
  }

  // ============================================
  // CORE COMPUTATION
  // ============================================
  function computeTransforms() {
    const deviceCameraPose = getDeviceCameraGeoPose();
    const assetPose = getAssetGeoPose();

    placement = sessionPlacement(deviceCameraPose, assetPose,
      new THREE.Vector3(deviceLocalX, deviceLocalY, deviceLocalZ), sessionFrameYaw);
    sessionOriginLat = placement.origin.position.lat;
    sessionOriginLon = placement.origin.position.lon;
    sessionOriginHeight = placement.origin.position.h;
    assetInSessionX = placement.assetPosition.x;
    assetInSessionY = placement.assetPosition.y;
    assetInSessionZ = placement.assetPosition.z;
    assetInSessionYaw = placement.assetYPR.yaw;
    deviceLocalYaw = placement.cameraYPR.yaw;
    deviceLocalPitch = placement.cameraYPR.pitch;
    deviceLocalRoll = placement.cameraYPR.roll;
  }

  // ============================================
  // CESIUM VISUALIZATION
  // ============================================
  function updateCesium() {
    if (!viewer) return;

    // Clear old entities
    cesiumEntities.forEach(e => viewer!.entities.remove(e));
    cesiumEntities = [];

    const deviceCameraPose = getDeviceCameraGeoPose();
    const assetPose = getAssetGeoPose();

    // Device Camera position
    const devicePos = createEntityFromGeoPose(deviceCameraPose);
    cesiumEntities.push(viewer.entities.add({
      name: "Device Camera",
      position: devicePos.position,
      orientation: devicePos.orientation,
      point: { pixelSize: 12, color: Color.CYAN, outlineColor: Color.WHITE, outlineWidth: 2 },
      label: {
        text: "Device Camera",
        font: "12px sans-serif",
        fillColor: Color.CYAN,
        outlineColor: Color.BLACK,
        outlineWidth: 2,
        style: 2,
        verticalOrigin: 1,
        pixelOffset: new Cartesian3(0, -15, 0) as any,
      },
    }));

    // Asset position
    const assetPos = createEntityFromGeoPose(assetPose);
    cesiumEntities.push(viewer.entities.add({
      name: "3D Asset",
      position: assetPos.position,
      orientation: assetPos.orientation,
      box: {
        dimensions: new Cartesian3(2, 2, 2),
        material: Color.ORANGE.withAlpha(0.8),
        outline: true,
        outlineColor: Color.WHITE,
      },
      label: {
        text: "3D Asset",
        font: "12px sans-serif",
        fillColor: Color.ORANGE,
        outlineColor: Color.BLACK,
        outlineWidth: 2,
        style: 2,
        verticalOrigin: 1,
        pixelOffset: new Cartesian3(0, -25, 0) as any,
      },
    }));

    // Session Origin
    const sessionOriginPose: GeoPose = {
      position: { lat: sessionOriginLat, lon: sessionOriginLon, h: sessionOriginHeight },
      quaternion: placement.origin.quaternion,
    };
    const sessionPos = createEntityFromGeoPose(sessionOriginPose);
    cesiumEntities.push(viewer.entities.add({
      name: "Session Origin",
      position: sessionPos.position,
      point: { pixelSize: 10, color: Color.MAGENTA, outlineColor: Color.WHITE, outlineWidth: 2 },
      label: {
        text: "Session Origin",
        font: "12px sans-serif",
        fillColor: Color.MAGENTA,
        outlineColor: Color.BLACK,
        outlineWidth: 2,
        style: 2,
        verticalOrigin: 1,
        pixelOffset: new Cartesian3(0, -15, 0) as any,
      },
    }));

    // Add coordinate axes at session origin
    addCesiumAxes();

    // Line from session origin to device
    const sessionCartesian = Cartesian3.fromDegrees(sessionOriginLon, sessionOriginLat, sessionOriginHeight);
    const deviceCartesian = Cartesian3.fromDegrees(deviceCameraLon, deviceCameraLat, deviceCameraHeight);
    cesiumEntities.push(viewer.entities.add({
      polyline: {
        positions: [sessionCartesian, deviceCartesian],
        width: 2,
        material: Color.CYAN.withAlpha(0.5),
      },
    }));

    // Line from session origin to asset
    const assetCartesian = Cartesian3.fromDegrees(assetLon, assetLat, assetHeight);
    cesiumEntities.push(viewer.entities.add({
      polyline: {
        positions: [sessionCartesian, assetCartesian],
        width: 2,
        material: Color.ORANGE.withAlpha(0.5),
      },
    }));
  }

  function addCesiumAxes() {
    if (!viewer) return;
    // Use the same session-to-ENU transform as the Three.js views. The ENU
    // basis here is at the device, so transport to ECEF before adding offsets.
    const device = Cartesian3.fromDegrees(deviceCameraLon, deviceCameraLat, deviceCameraHeight);
    const enu = Transforms.eastNorthUpToFixedFrame(device);
    const world = (v: THREE.Vector3) => Matrix4.multiplyByPoint(enu,
      new Cartesian3(v.x, v.y, v.z), new Cartesian3());
    const origin = world(placement.originOffset);
    const axes = [
      { name: "X", v: new THREE.Vector3(10, 0, 0), color: Color.RED },
      { name: "Y", v: new THREE.Vector3(0, 10, 0), color: Color.BLUE },
      { name: "Z", v: new THREE.Vector3(0, 0, 10), color: Color.GREEN }
    ];
    for (const axis of axes) {
      const end = world(axis.v.applyQuaternion(placement.enuFromSession).add(placement.originOffset));
      cesiumEntities.push(viewer.entities.add({ polyline: {
        positions: [origin, end], width: 5, material: new PolylineArrowMaterialProperty(axis.color)
      }}));
      cesiumEntities.push(viewer.entities.add({ position: end,
        label: { text: axis.name, font: "bold 14px sans-serif", fillColor: axis.color }
      }));
    }
  }

  // ============================================
  // THREE.JS - SESSION VIEW (top-down/orbit view of AR session)
  // ============================================
  function initSessionView() {
    sessionScene = new THREE.Scene();
    sessionScene.background = new THREE.Color(0x1a1a2e);

    sessionCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    sessionCamera.position.set(8, 8, 8);
    sessionCamera.lookAt(0, 0, 0);

    sessionRenderer = new THREE.WebGLRenderer({ antialias: true });
    sessionRenderer.setPixelRatio(window.devicePixelRatio);
    sessionViewContainer.appendChild(sessionRenderer.domElement);

    sessionControls = new OrbitControls(sessionCamera, sessionRenderer.domElement);
    sessionControls.enableDamping = false;
    sessionControls.autoRotate = false;
    sessionControls.enableZoom = true;
    sessionControls.enablePan = true;
    sessionControls.target.set(0, 0, 0);
    sessionControls.update();

    // Lighting
    sessionScene.add(new THREE.AmbientLight(0x404040, 2));
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(5, 10, 5);
    sessionScene.add(light);

    // Ground grid
    sessionScene.add(new THREE.GridHelper(20, 20, 0x444466, 0x333355));

    // ENU reference axes (faded) - showing true East-North-Up
    // In this view: X=East, Y=Up, Z=South (a proper right-handed basis)
    const enuAxes = createAxesGroup(4, { x: 0x663333, y: 0x336633, z: 0x333366 });
    enuAxes.quaternion.copy(ENU_TO_EUS);
    sessionScene.add(enuAxes);

    // Add ENU labels
    addAxisLabel(sessionScene, "E", new THREE.Vector3(4.5, 0, 0), 0x663333);
    addAxisLabel(sessionScene, "U", new THREE.Vector3(0, 4.5, 0), 0x333366);
    addAxisLabel(sessionScene, "N", new THREE.Vector3(0, 0, -4.5), 0x336633);

    // Session frame axes at origin (bright)
    // AR Session: +X right, +Y up, +Z backward; yaw=0 aligns with EUS
    sessionFrameAxes = createAxesGroup(3, { x: 0xff4444, y: 0x4444ff, z: 0x44ff44 });
    sessionScene.add(sessionFrameAxes);

    // Add AR session axis labels
    addAxisLabel(sessionFrameAxes, "X", new THREE.Vector3(3.5, 0, 0), 0xff4444);
    addAxisLabel(sessionFrameAxes, "Y", new THREE.Vector3(0, 3.5, 0), 0x4444ff);
    addAxisLabel(sessionFrameAxes, "Z", new THREE.Vector3(0, 0, 3.5), 0x44ff44);

    // Origin marker
    const originGeom = new THREE.SphereGeometry(0.15);
    const originMat = new THREE.MeshPhongMaterial({ color: 0xff00ff });
    sessionOriginMarker = new THREE.Mesh(originGeom, originMat);
    sessionScene.add(sessionOriginMarker);

    // Device mesh
    sessionDeviceMesh = createDeviceMesh(0x00ffff);
    sessionScene.add(sessionDeviceMesh);

    // Asset mesh
    sessionAssetMesh = createAssetMesh();
    sessionScene.add(sessionAssetMesh);
  }

  // ============================================
  // THREE.JS - CAMERA VIEW (device perspective)
  // ============================================
  function initCameraView() {
    cameraScene = new THREE.Scene();
    cameraScene.background = new THREE.Color(0x87CEEB); // Sky blue

    cameraViewCamera = new THREE.PerspectiveCamera(70, 1, 0.1, 1000);

    cameraRenderer = new THREE.WebGLRenderer({ antialias: true });
    cameraRenderer.setPixelRatio(window.devicePixelRatio);
    cameraViewContainer.appendChild(cameraRenderer.domElement);

    // Lighting
    cameraScene.add(new THREE.AmbientLight(0x606060, 2));
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(0, 10, 0);
    cameraScene.add(light);

    // Ground plane
    const groundGeom = new THREE.PlaneGeometry(50, 50);
    const groundMat = new THREE.MeshPhongMaterial({ color: 0x3a5a3a, side: THREE.DoubleSide });
    const ground = new THREE.Mesh(groundGeom, groundMat);
    ground.rotation.x = -Math.PI / 2;
    cameraScene.add(ground);

    // Grid on ground
    const grid = new THREE.GridHelper(50, 50, 0x2a4a2a, 0x2a4a2a);
    cameraScene.add(grid);

    // Session frame axes (at origin)
    cameraFrameAxes = createAxesGroup(2, { x: 0xff4444, y: 0x4444ff, z: 0x44ff44 });
    cameraScene.add(cameraFrameAxes);

    // Origin marker
    const originGeom = new THREE.SphereGeometry(0.2);
    const originMat = new THREE.MeshPhongMaterial({ color: 0xff00ff });
    cameraOriginMarker = new THREE.Mesh(originGeom, originMat);
    cameraScene.add(cameraOriginMarker);

    // Asset mesh
    cameraAssetMesh = createAssetMesh();
    cameraScene.add(cameraAssetMesh);
  }

  function addAxisLabel(scene: THREE.Object3D, text: string, position: THREE.Vector3, color: number) {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
    ctx.font = 'bold 48px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 32, 32);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.copy(position);
    sprite.scale.set(0.8, 0.8, 1);
    scene.add(sprite);
  }

  function createAxesGroup(size: number, colors: { x: number; y: number; z: number }): THREE.Group {
    const group = new THREE.Group();

    // X axis (red - right)
    const xGeom = new THREE.CylinderGeometry(0.03, 0.03, size, 8);
    const xMat = new THREE.MeshBasicMaterial({ color: colors.x });
    const xAxis = new THREE.Mesh(xGeom, xMat);
    xAxis.rotation.z = -Math.PI / 2;
    xAxis.position.x = size / 2;
    group.add(xAxis);
    const xArrow = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 8), xMat);
    xArrow.rotation.z = -Math.PI / 2;
    xArrow.position.x = size;
    group.add(xArrow);

    // Y axis (blue - up)
    const yGeom = new THREE.CylinderGeometry(0.03, 0.03, size, 8);
    const yMat = new THREE.MeshBasicMaterial({ color: colors.y });
    const yAxis = new THREE.Mesh(yGeom, yMat);
    yAxis.position.y = size / 2;
    group.add(yAxis);
    const yArrow = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 8), yMat);
    yArrow.position.y = size;
    group.add(yArrow);

    // Z axis (green - backward for a camera)
    const zGeom = new THREE.CylinderGeometry(0.03, 0.03, size, 8);
    const zMat = new THREE.MeshBasicMaterial({ color: colors.z });
    const zAxis = new THREE.Mesh(zGeom, zMat);
    zAxis.rotation.x = Math.PI / 2;
    zAxis.position.z = size / 2;
    group.add(zAxis);
    const zArrow = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 8), zMat);
    zArrow.rotation.x = Math.PI / 2;
    zArrow.position.z = size;
    group.add(zArrow);

    return group;
  }

  function createDeviceMesh(color: number): THREE.Group {
    const group = new THREE.Group();

    // Phone body
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.15, 0.01),
      new THREE.MeshPhongMaterial({ color, transparent: true, opacity: 0.9 })
    );
    group.add(body);

    // Camera lens
    const lens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, 0.008, 16),
      new THREE.MeshPhongMaterial({ color: 0x333333 })
    );
    lens.rotation.x = Math.PI / 2;
    lens.position.set(0, 0.05, -0.01);
    group.add(lens);

    // View direction cone
    const viewCone = new THREE.Mesh(
      new THREE.ConeGeometry(0.3, 0.8, 4),
      new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.2, wireframe: true })
    );
    viewCone.rotation.x = Math.PI / 2;
    viewCone.position.z = -0.4;
    group.add(viewCone);

    return group;
  }

  function createAssetMesh(): THREE.Group {
    const group = new THREE.Group();

    // Main cube
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.5, 0.5),
      new THREE.MeshPhongMaterial({ color: 0xff6600, transparent: true, opacity: 0.9 })
    );
    box.position.z = 0.25;
    group.add(box);

    // Forward arrow
    const arrow = new THREE.Mesh(
      new THREE.ConeGeometry(0.1, 0.3, 8),
      new THREE.MeshPhongMaterial({ color: 0xffff00 })
    );
    arrow.rotation.z = -Math.PI / 2;
    arrow.position.set(0.4, 0, 0.25);
    group.add(arrow);

    // Base plate
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.4, 0.02, 16),
      new THREE.MeshPhongMaterial({ color: 0x884400 })
    );
    base.rotation.x = Math.PI / 2;
    base.position.z = 0.01;
    group.add(base);

    return group;
  }

  function updateThreeJS() {
    if (!sessionScene || !cameraScene) return;

    const { localAsset, originOffset, enuFromSession } = placement;
    // Overview is EUS at the device. Convert both vectors and full orientations.
    sessionAssetMesh.position.set(localAsset.position.east, localAsset.position.up, -localAsset.position.north);
    sessionAssetMesh.quaternion.copy(ENU_TO_EUS).multiply(quat(localAsset.orientation));
    sessionDeviceMesh.position.set(0, 0, 0);
    sessionDeviceMesh.quaternion.copy(ENU_TO_EUS).multiply(quat(getDeviceCameraGeoPose().quaternion));
    sessionFrameAxes.position.copy(originOffset).applyQuaternion(ENU_TO_EUS);
    sessionFrameAxes.quaternion.copy(ENU_TO_EUS).multiply(enuFromSession);
    sessionOriginMarker.position.copy(sessionFrameAxes.position);

    // The camera view uses native right-handed session coordinates.
    cameraViewCamera.position.set(deviceLocalX, deviceLocalY, deviceLocalZ);
    cameraViewCamera.quaternion.copy(placement.cameraOrientation);
    cameraAssetMesh.position.copy(placement.assetPosition);
    cameraAssetMesh.quaternion.copy(placement.assetOrientation);
  }

  function handleResize() {
    if (sessionViewContainer && sessionRenderer) {
      const w = sessionViewContainer.clientWidth;
      const h = sessionViewContainer.clientHeight;
      sessionCamera.aspect = w / h;
      sessionCamera.updateProjectionMatrix();
      sessionRenderer.setSize(w, h);
    }
    if (cameraViewContainer && cameraRenderer) {
      const w = cameraViewContainer.clientWidth;
      const h = cameraViewContainer.clientHeight;
      cameraViewCamera.aspect = w / h;
      cameraViewCamera.updateProjectionMatrix();
      cameraRenderer.setSize(w, h);
    }
  }

  function animate() {
    animationFrameId = requestAnimationFrame(animate);
    if (sessionControls) sessionControls.update();
    if (sessionRenderer && sessionScene && sessionCamera) {
      sessionRenderer.render(sessionScene, sessionCamera);
    }
    if (cameraRenderer && cameraScene && cameraViewCamera) {
      cameraRenderer.render(cameraScene, cameraViewCamera);
    }
  }

  function updateAll() {
    computeTransforms();
    updateCesium();
    updateThreeJS();
  }

  function applyPreset(preset: typeof presets[0]) {
    deviceCameraLat = preset.deviceCamera.lat;
    deviceCameraLon = preset.deviceCamera.lon;
    deviceCameraHeight = preset.deviceCamera.h;
    deviceCameraYaw = preset.deviceCamera.yaw;
    deviceCameraPitch = preset.deviceCamera.pitch;
    deviceCameraRoll = preset.deviceCamera.roll;
    deviceLocalX = preset.deviceLocal.x;
    deviceLocalY = preset.deviceLocal.y;
    deviceLocalZ = preset.deviceLocal.z;
    assetLat = preset.asset.lat;
    assetLon = preset.asset.lon;
    assetHeight = preset.asset.h;
    assetYaw = preset.asset.yaw;
    assetPitch = 0;
    assetRoll = 0;
    sessionFrameYaw = preset.sessionYaw;
    updateAll();
  }

  function flyToScene() {
    if (!viewer) return;

    // Use setView for instant positioning (no animation)
    viewer.camera.setView({
      destination: Cartesian3.fromDegrees(
        sessionOriginLon - 0.0003,
        sessionOriginLat - 0.0003,
        sessionOriginHeight + 60
      ),
      orientation: {
        heading: CesiumMath.toRadians(45),
        pitch: CesiumMath.toRadians(-45),
        roll: 0
      }
    });
  }

  onMount(async () => {
    viewer = new Viewer(cesiumContainer, {
      animation: false,
      timeline: false,
      baseLayerPicker: true,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
    });

    // Disable camera inertia/momentum to prevent drift
    viewer.scene.screenSpaceCameraController.inertiaSpin = 0;
    viewer.scene.screenSpaceCameraController.inertiaTranslate = 0;
    viewer.scene.screenSpaceCameraController.inertiaZoom = 0;

    initSessionView();
    initCameraView();

    window.addEventListener("resize", handleResize);
    handleResize();

    updateAll();
    animate();

    setTimeout(flyToScene, 500);
  });

  onDestroy(() => {
    if (viewer) viewer.destroy();
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    if (sessionRenderer) sessionRenderer.dispose();
    if (cameraRenderer) cameraRenderer.dispose();
    window.removeEventListener("resize", handleResize);
  });

  function fmt(n: number, d = 2): string {
    return n.toFixed(d);
  }
</script>

<main>
  <div class="app-container">
    <!-- Left column: Cesium -->
    <div class="view-column">
      <div class="view-panel">
        <div class="view-header">
          <span class="view-title">Global Context (Cesium)</span>
          <span class="view-subtitle">Device, Asset, and Session Origin GeoPoses</span>
        </div>
        <div bind:this={cesiumContainer} class="view-content"></div>
      </div>
    </div>

    <!-- Middle column: Two Three.js views -->
    <div class="view-column">
      <div class="view-panel half">
        <div class="view-header">
          <span class="view-title">AR Session Frame</span>
          <span class="view-subtitle">Faded=ENU (E,N,U) | Bright=Session (X,Y,Z)</span>
        </div>
        <div bind:this={sessionViewContainer} class="view-content"></div>
      </div>
      <div class="view-panel half">
        <div class="view-header">
          <span class="view-title">Device Camera View</span>
          <span class="view-subtitle">What the AR device sees</span>
        </div>
        <div bind:this={cameraViewContainer} class="view-content"></div>
      </div>
    </div>

    <!-- Right column: Controls -->
    <div class="controls-panel">
      <h1>AR GeoPose Transform</h1>
      <p class="subtitle">Device Camera → Session Frame → Asset Placement</p>
      <p class="info-text">GeoPose angles use right-handed intrinsic Z–Y–X. Positive yaw turns East toward North. Camera axes are +X right, +Y up, −Z view: identity looks down; roll +90° with yaw/pitch zero looks North. The asset arrow points along body +X.</p>

      <section class="section">
        <h2>Presets</h2>
        <div class="presets">
          {#each presets as preset}
            <button class="btn-preset" on:click={() => applyPreset(preset)}>{preset.name}</button>
          {/each}
        </div>
      </section>

      <section class="section">
        <h2>Device Camera GeoPose (from VPS)</h2>
        <div class="input-grid">
          <div class="input-group">
            <label for="deviceCameraLat">Lat (°)</label>
            <input id="deviceCameraLat" type="number" bind:value={deviceCameraLat} step="0.0001" on:change={updateAll} />
          </div>
          <div class="input-group">
            <label for="deviceCameraLon">Lon (°)</label>
            <input id="deviceCameraLon" type="number" bind:value={deviceCameraLon} step="0.0001" on:change={updateAll} />
          </div>
          <div class="input-group">
            <label for="deviceCameraHeight">Height (m)</label>
            <input id="deviceCameraHeight" type="number" bind:value={deviceCameraHeight} step="0.1" on:change={updateAll} />
          </div>
          <div class="input-group">
            <label for="deviceCameraYaw">Yaw (°)</label>
            <input id="deviceCameraYaw" type="number" bind:value={deviceCameraYaw} step="5" on:change={updateAll} />
          </div>
          <div class="input-group">
            <label for="deviceCameraPitch">Pitch (°)</label>
            <input id="deviceCameraPitch" type="number" bind:value={deviceCameraPitch} step="5" on:change={updateAll} />
          </div>
          <div class="input-group">
            <label for="deviceCameraRoll">Roll (°)</label>
            <input id="deviceCameraRoll" type="number" bind:value={deviceCameraRoll} step="5" on:change={updateAll} />
          </div>
        </div>
      </section>

      <section class="section highlight">
        <h2>AR Session Frame Orientation</h2>
        <p class="info-text">Session +X yaw: counterclockwise from East toward North at the device position</p>
        <div class="slider-group">
          <label for="sessionFrameYaw">Yaw from East:</label>
          <input id="sessionFrameYaw" type="range" min="-180" max="180" bind:value={sessionFrameYaw} on:input={updateAll} />
          <span class="slider-value">{sessionFrameYaw}°</span>
        </div>
      </section>

      <section class="section">
        <h2>Device Local Pose (in AR Session)</h2>
        <p class="info-text">Local camera angles are derived, in a Z-up basis parallel to the session ground axes.</p>
        <p class="info-text">Position in session frame: +X right, +Y up, +Z backward (zero yaw: East, Up, South)</p>
        <div class="input-grid">
          <div class="input-group">
            <label for="deviceLocalX">X right (m)</label>
            <input id="deviceLocalX" type="number" bind:value={deviceLocalX} step="0.5" on:change={updateAll} />
          </div>
          <div class="input-group">
            <label for="deviceLocalY">Y up (m)</label>
            <input id="deviceLocalY" type="number" bind:value={deviceLocalY} step="0.5" on:change={updateAll} />
          </div>
          <div class="input-group">
            <label for="deviceLocalZ">Z back (m)</label>
            <input id="deviceLocalZ" type="number" bind:value={deviceLocalZ} step="0.5" on:change={updateAll} />
          </div>
          <div class="input-group">
            <label for="deviceLocalYaw">Yaw (°)</label>
            <input id="deviceLocalYaw" type="number" value={deviceLocalYaw} readonly />
          </div>
          <div class="input-group">
            <label for="deviceLocalPitch">Pitch (°)</label>
            <input id="deviceLocalPitch" type="number" value={deviceLocalPitch} readonly />
          </div>
          <div class="input-group">
            <label for="deviceLocalRoll">Roll (°)</label>
            <input id="deviceLocalRoll" type="number" value={deviceLocalRoll} readonly />
          </div>
        </div>
      </section>

      <section class="section">
        <h2>3D Asset GeoPose (Known)</h2>
        <div class="input-grid">
          <div class="input-group">
            <label for="assetLat">Lat (°)</label>
            <input id="assetLat" type="number" bind:value={assetLat} step="0.0001" on:change={updateAll} />
          </div>
          <div class="input-group">
            <label for="assetLon">Lon (°)</label>
            <input id="assetLon" type="number" bind:value={assetLon} step="0.0001" on:change={updateAll} />
          </div>
          <div class="input-group">
            <label for="assetHeight">Height (m)</label>
            <input id="assetHeight" type="number" bind:value={assetHeight} step="0.5" on:change={updateAll} />
          </div>
          <div class="input-group">
            <label for="assetYaw">Yaw (°)</label>
            <input id="assetYaw" type="number" bind:value={assetYaw} step="15" on:change={updateAll} />
          </div>
          <div class="input-group"><label for="assetPitch">Pitch (°)</label><input id="assetPitch" type="number" bind:value={assetPitch} step="15" on:change={updateAll} /></div>
          <div class="input-group"><label for="assetRoll">Roll (°)</label><input id="assetRoll" type="number" bind:value={assetRoll} step="15" on:change={updateAll} /></div>
        </div>
      </section>

      <section class="section computed">
        <h2>Computed: Session Origin GeoPose</h2>
        <div class="result-grid">
          <div class="result-item"><span class="result-label">Lat</span><span class="result-value">{fmt(sessionOriginLat, 6)}°</span></div>
          <div class="result-item"><span class="result-label">Lon</span><span class="result-value">{fmt(sessionOriginLon, 6)}°</span></div>
          <div class="result-item"><span class="result-label">Height</span><span class="result-value">{fmt(sessionOriginHeight, 2)}m</span></div>
          <div class="result-item"><span class="result-label">Yaw</span><span class="result-value">{fmt(sessionFrameYaw, 1)}°</span></div>
        </div>
      </section>

      <section class="section result">
        <h2>Computed: Asset in AR Session</h2>
        <p class="info-text">Position for AR rendering (+X right, +Y up, +Z backward (zero yaw: East, Up, South))</p>
        <div class="result-grid">
          <div class="result-item"><span class="result-label">X right</span><span class="result-value">{fmt(assetInSessionX)} m</span></div>
          <div class="result-item"><span class="result-label">Y up</span><span class="result-value">{fmt(assetInSessionY)} m</span></div>
          <div class="result-item"><span class="result-label">Z back</span><span class="result-value">{fmt(assetInSessionZ)} m</span></div>
          <div class="result-item"><span class="result-label">Yaw</span><span class="result-value">{fmt(assetInSessionYaw, 1)}°</span></div>
        </div>
      </section>

      <section class="section">
        <button class="btn-primary" on:click={flyToScene}>Fly to Scene</button>
      </section>
    </div>
  </div>
</main>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
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

  .view-column {
    flex: 1;
    display: flex;
    flex-direction: column;
    border-right: 1px solid #0f3460;
  }

  .view-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    border-bottom: 1px solid #0f3460;
  }

  .view-panel.half {
    flex: 0.5;
  }

  .view-header {
    background: #16213e;
    padding: 8px 12px;
    border-bottom: 1px solid #0f3460;
  }

  .view-title {
    display: block;
    font-weight: 600;
    font-size: 0.9rem;
    color: #53d9d9;
  }

  .view-subtitle {
    font-size: 0.7rem;
    color: #888;
  }

  .view-content {
    flex: 1;
    width: 100%;
    min-height: 0;
  }

  .controls-panel {
    width: 300px;
    background: #16213e;
    padding: 12px;
    overflow-y: auto;
  }

  h1 {
    margin: 0 0 4px 0;
    font-size: 1.1rem;
    color: #e94560;
  }

  .subtitle {
    margin: 0 0 12px 0;
    color: #888;
    font-size: 0.75rem;
  }

  h2 {
    margin: 0 0 8px 0;
    font-size: 0.8rem;
    color: #53d9d9;
    border-bottom: 1px solid #0f3460;
    padding-bottom: 4px;
  }

  .section {
    margin-bottom: 12px;
    background: #1a1a2e;
    padding: 10px;
    border-radius: 6px;
  }

  .section.highlight {
    border: 1px solid #e94560;
  }

  .section.computed {
    background: #1a2a4a;
  }

  .section.result {
    background: #0f3460;
  }

  .presets {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .btn-preset {
    background: #0f3460;
    color: #eee;
    border: none;
    padding: 5px 8px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.7rem;
  }

  .btn-preset:hover {
    background: #e94560;
  }

  .input-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 6px;
  }

  .input-group {
    display: flex;
    flex-direction: column;
  }

  .input-group label {
    font-size: 0.65rem;
    color: #888;
    margin-bottom: 2px;
  }

  .input-group input {
    background: #0f0f1a;
    border: 1px solid #0f3460;
    color: #eee;
    padding: 5px;
    border-radius: 3px;
    font-size: 0.75rem;
    width: 100%;
    box-sizing: border-box;
  }

  .input-group input:focus {
    outline: none;
    border-color: #e94560;
  }

  .info-text {
    font-size: 0.65rem;
    color: #aaa;
    margin: 0 0 8px 0;
  }

  .slider-group {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .slider-group label {
    font-size: 0.7rem;
    color: #888;
    white-space: nowrap;
  }

  .slider-group input[type="range"] {
    flex: 1;
    accent-color: #e94560;
  }

  .slider-value {
    min-width: 45px;
    text-align: right;
    font-family: monospace;
    font-size: 0.85rem;
    color: #4ecca3;
  }

  .result-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }

  .result-item {
    background: #1a1a2e;
    padding: 6px;
    border-radius: 3px;
  }

  .result-label {
    display: block;
    font-size: 0.6rem;
    color: #888;
  }

  .result-value {
    font-family: "SF Mono", Monaco, monospace;
    font-size: 0.85rem;
    color: #4ecca3;
  }

  .btn-primary {
    width: 100%;
    padding: 10px;
    background: #e94560;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 500;
  }

  .btn-primary:hover {
    background: #ff6b6b;
  }

  :global(.cesium-credit-logoContainer),
  :global(.cesium-credit-expand-link) {
    display: none !important;
  }
</style>
