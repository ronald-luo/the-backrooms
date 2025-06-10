// TEXTURE FILENAMES (put these in public/textures/):
// wall.jpg, floor.jpg, ceiling.jpg, fluorescent.png

// SOUND FILENAMES (put these in public/sounds/):
// buzz.mp3, ambient.mp3

import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import { RectAreaLightHelper } from "three/examples/jsm/helpers/RectAreaLightHelper.js";
import { EXRLoader } from "three/examples/jsm/loaders/EXRLoader.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

// Audio setup
const listener = new THREE.AudioListener();
const buzzSound = new THREE.Audio(listener);
const ambientSound = new THREE.Audio(listener);
const walkSound = new THREE.Audio(listener);
const knockSound = new THREE.PositionalAudio(listener);
const radioSound = new THREE.PositionalAudio(listener); // Add radio sound
const breathSound = new THREE.Audio(listener); // Add breathing sound
const spraySound = new THREE.Audio(listener); // Add spray paint sound
const sprayShakeSound = new THREE.Audio(listener); // Add spray shake sound
let knockSource = null;
let sprayPaintMaterial = null; // Add spray paint material

// Add crawling sound
const crawlingSound = new THREE.PositionalAudio(listener);

// Add idling sound
const idlingSound = new THREE.PositionalAudio(listener);

// Load and setup sounds
const audioLoader = new THREE.AudioLoader();

// Helper to try loading a sound, fallback to null if not found
function tryLoadSound(path) {
  return new Promise((resolve) => {
    audioLoader.load(
      `/the-backrooms/sounds/${path}`,
      (buffer) => resolve(buffer),
      undefined,
      () => resolve(null)
    );
  });
}

// Texture loader
const textureLoader = new THREE.TextureLoader();

// Helper to try load a texture, fallback to null if not found
function tryLoadTexture(path) {
  return new Promise((resolve) => {
    textureLoader.load(
      `/the-backrooms/textures/${path}`,
      (tex) => resolve(tex),
      undefined,
      () => resolve(null)
    );
  });
}

// GLTF loader with DRACO support
const gltfLoader = new GLTFLoader();
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath(
  "https://www.gstatic.com/draco/versioned/decoders/1.5.6/"
);
gltfLoader.setDRACOLoader(dracoLoader);

// Store loaded models
const loadedModels = new Map();

async function loadModel(path) {
  if (!loadedModels.has(path)) {
    const model = await new Promise((resolve) => {
      gltfLoader.load(
        path,
        (gltf) => resolve(gltf),
        undefined,
        (error) => {
          console.error("Error loading model:", error);
          resolve(null);
        }
      );
    });
    if (model) loadedModels.set(path, model);
    else return null;
  }
  return loadedModels.get(path);
}

// Function to find a valid spawn position
function findValidSpawnPosition(startPos, maxAttempts = 20) {
  let attempts = 0;
  let currentPos = startPos.clone();
  let bestPos = null;
  let bestDist = Infinity;

  while (attempts < maxAttempts) {
    // Check if current position is valid (not in a wall)
    if (!checkCollision(currentPos, 1.0)) {
      // Increased collision radius for safety
      const dist = currentPos.distanceTo(startPos);
      if (dist < bestDist) {
        bestPos = currentPos.clone();
        bestDist = dist;
      }
    }

    // Try a new random position within a small radius
    const angle = Math.random() * Math.PI * 2;
    const radius = 2 + Math.random() * 3; // Random radius between 2-5 units
    currentPos.x = startPos.x + Math.cos(angle) * radius;
    currentPos.z = startPos.z + Math.sin(angle) * radius;
    currentPos.y = 0.1; // Keep slightly above ground

    attempts++;
  }

  return bestPos; // Return the best valid position found, or null if none found
}

// Function to check if a path between two points is clear
function isPathClear(start, end, steps = 10) {
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const pos = new THREE.Vector3().lerpVectors(start, end, t);
    if (checkCollision(pos, 1.0)) {
      // Increased collision radius for safety
      return false;
    }
  }
  return true;
}

// Function to find a valid path between two points
function findValidPath(start, end, maxAttempts = 10) {
  let attempts = 0;
  let currentEnd = end.clone();

  while (attempts < maxAttempts) {
    if (isPathClear(start, currentEnd)) {
      return currentEnd;
    }

    // Try to find a new end point
    const angle = Math.random() * Math.PI * 2;
    const radius = 5 + Math.random() * 5; // Random radius between 5-10 units
    currentEnd.x = end.x + Math.cos(angle) * radius;
    currentEnd.z = end.z + Math.sin(angle) * radius;
    currentEnd.y = end.y;

    attempts++;
  }

  return null; // Return null if no valid path found
}

// Function to spawn a model at player position
async function spawnModelAtPlayer(modelPath, offset = { x: 0, y: 0, z: 0 }) {
  if (!loadedModels.has(modelPath)) {
    const model = await new Promise((resolve) => {
      gltfLoader.load(
        modelPath,
        (gltf) => resolve(gltf),
        undefined,
        (error) => {
          console.error("Error loading model:", error);
          resolve(null);
        }
      );
    });

    if (model) {
      loadedModels.set(modelPath, model);
    } else {
      return null;
    }
  }

  const model = loadedModels.get(modelPath);
  const modelInstance = model.scene.clone();

  // Get player position
  const playerPos = controls.getObject().position;

  // Calculate initial spawn position
  const initialPos = new THREE.Vector3(
    playerPos.x + offset.x,
    0.1,
    playerPos.z + offset.z
  );

  // Find a valid spawn position
  const validPos = findValidSpawnPosition(initialPos);
  if (!validPos) {
    console.warn("Could not find valid spawn position for model");
    return null;
  }

  // Position the model at the valid position
  modelInstance.position.copy(validPos);

  // Scale the model appropriately
  modelInstance.scale.set(0.5, 0.5, 0.5);

  // Add radio sound to the model
  audioLoader.load(
    "./sounds/radio.mp3",
    function (buffer) {
      radioSound.setBuffer(buffer);
      radioSound.setRefDistance(1.5);
      radioSound.setRolloffFactor(2);
      radioSound.setDistanceModel("exponential");
      radioSound.setLoop(true);
      radioSound.setVolume(0.5);
      modelInstance.add(radioSound);
      radioSound.play();
    },
    undefined,
    function (error) {
      console.error("Error loading radio sound:", error);
    }
  );

  scene.add(modelInstance);
  return modelInstance;
}

// --- Infinite Room Generation ---
const ROOM_SIZE = 100;
const ROOM_HEIGHT = 5;
const ACTIVE_RADIUS = 2; // Only keep rooms immediately around the player
const loadedRooms = new Map(); // key: 'x_z', value: { group, x, z }

function roomKey(x, z) {
  return `${x}_${z}`;
}

let flickerLights = [];

function createRoom(
  x,
  z,
  wallMaterial,
  floorMaterial,
  ceilingMaterial,
  lightPanelMaterial
) {
  const group = new THREE.Group();
  group.position.set(x * ROOM_SIZE, 0, z * ROOM_SIZE);

  // Floor
  const floorGeometry = new THREE.PlaneGeometry(ROOM_SIZE, ROOM_SIZE);
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);

  // Ceiling
  const ceilingGeometry = new THREE.PlaneGeometry(ROOM_SIZE, ROOM_SIZE);
  const ceiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
  ceiling.position.y = ROOM_HEIGHT;
  ceiling.rotation.x = Math.PI / 2;
  ceiling.receiveShadow = false;
  group.add(ceiling);

  // Room grid
  const gridSize = 6;
  const cellSize = ROOM_SIZE / gridSize;
  const halfRoom = ROOM_SIZE / 2;
  const grid = Array.from({ length: gridSize }, () => Array(gridSize).fill(1)); // Start with all walls

  // Maze generation using Recursive Backtracking
  function carvePath(x, z) {
    grid[x][z] = 0; // Mark current cell as path

    // Define possible directions (up, right, down, left)
    const directions = [
      [0, -2], // up
      [2, 0], // right
      [0, 2], // down
      [-2, 0], // left
    ];

    // Shuffle directions for randomness
    for (let i = directions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [directions[i], directions[j]] = [directions[j], directions[i]];
    }

    // Try each direction
    for (const [dx, dz] of directions) {
      const nx = x + dx;
      const nz = z + dz;

      // Check if the new position is valid and unvisited
      if (
        nx > 0 &&
        nx < gridSize - 1 &&
        nz > 0 &&
        nz < gridSize - 1 &&
        grid[nx][nz] === 1
      ) {
        // Carve path by setting the cell between current and next to 0
        grid[x + dx / 2][z + dz / 2] = 0;
        carvePath(nx, nz);
      }
    }
  }

  // Start maze generation from center
  const startX = Math.floor(gridSize / 2);
  const startZ = Math.floor(gridSize / 2);
  carvePath(startX, startZ);

  // Add some random pillars in the paths
  for (let xg = 1; xg < gridSize - 1; xg++) {
    for (let zg = 1; zg < gridSize - 1; zg++) {
      if (grid[xg][zg] === 0 && Math.random() < 0.1) {
        grid[xg][zg] = 2; // Place pillar
      }
    }
  }

  // Ensure doors are open
  grid[Math.floor(gridSize / 2)][0] = 0;
  grid[Math.floor(gridSize / 2)][gridSize - 1] = 0;
  grid[0][Math.floor(gridSize / 2)] = 0;
  grid[gridSize - 1][Math.floor(gridSize / 2)] = 0;

  // Place walls
  const wallGeometry = new THREE.BoxGeometry(cellSize, ROOM_HEIGHT, 1);
  for (let xg = 0; xg < gridSize; xg++) {
    for (let zg = 0; zg < gridSize; zg++) {
      if (grid[xg][zg] === 1) {
        const wall = new THREE.Mesh(wallGeometry, wallMaterial);
        wall.position.set(
          xg * cellSize - halfRoom + cellSize / 2,
          ROOM_HEIGHT / 2,
          zg * cellSize - halfRoom + cellSize / 2
        );
        // Randomly rotate some walls
        if (Math.random() < 0.3) {
          wall.rotation.y = Math.PI / 2;
        }
        wall.castShadow = true;
        group.add(wall);
      }
    }
  }

  // Place pillars
  const pillarGeometry = new THREE.BoxGeometry(1, ROOM_HEIGHT, 1);
  for (let xg = 0; xg < gridSize; xg++) {
    for (let zg = 0; zg < gridSize; zg++) {
      if (grid[xg][zg] === 2) {
        const pillar = new THREE.Mesh(pillarGeometry, wallMaterial);
        pillar.position.set(
          xg * cellSize - halfRoom + cellSize / 2,
          ROOM_HEIGHT / 2,
          zg * cellSize - halfRoom + cellSize / 2
        );
        // Randomly scale some pillars
        if (Math.random() < 0.3) {
          pillar.scale.set(1.2, 1, 1.2);
        }
        pillar.castShadow = true;
        group.add(pillar);
      }
    }
  }
  // Add ceiling lights (skip if pillar below)
  const panelGeometry = new THREE.PlaneGeometry(2, 2);
  for (let xg = 1; xg < gridSize - 1; xg++) {
    for (let zg = 1; zg < gridSize - 1; zg++) {
      // Place a panel if this cell is a path (not a wall or pillar)
      if (grid[xg][zg] === 0) {
        const wx = xg * cellSize - halfRoom + cellSize / 2;
        const wz = zg * cellSize - halfRoom + cellSize / 2;
        // Create panel
        const panel = new THREE.Mesh(panelGeometry, lightPanelMaterial);
        panel.position.set(wx, ROOM_HEIGHT - 0.02, wz);
        panel.rotation.x = Math.PI / 2;
        group.add(panel);
        // Only add a point light every 4 panels (25% of panels have lights)
        if (xg % 4 === 0 && zg % 4 === 0) {
          const light = new THREE.PointLight(0xffffff, 4, ROOM_SIZE); // Pure white light
          light.position.set(wx, ROOM_HEIGHT + 0.05, wz);
          // Only make 1% of these lights flicker
          if (Math.random() < 0.01) {
            light.userData.flickerPhase = Math.random() * Math.PI * 2;
            light.userData.isPanelLight = true;
            flickerLights.push(light);
          }
          group.add(light);
        }
      }
    }
  }
  return group;
}

function updateRooms(
  playerPos,
  wallMaterial,
  floorMaterial,
  ceilingMaterial,
  lightPanelMaterial
) {
  const px = Math.floor(playerPos.x / ROOM_SIZE);
  const pz = Math.floor(playerPos.z / ROOM_SIZE);
  // Load rooms in radius
  for (let dx = -ACTIVE_RADIUS; dx <= ACTIVE_RADIUS; dx++) {
    for (let dz = -ACTIVE_RADIUS; dz <= ACTIVE_RADIUS; dz++) {
      const rx = px + dx;
      const rz = pz + dz;
      const key = roomKey(rx, rz);
      if (!loadedRooms.has(key)) {
        const group = createRoom(
          rx,
          rz,
          wallMaterial,
          floorMaterial,
          ceilingMaterial,
          lightPanelMaterial
        );
        scene.add(group);
        loadedRooms.set(key, { group, x: rx, z: rz });
      }
    }
  }
  // Unload rooms far away
  for (const [key, val] of loadedRooms) {
    if (
      Math.abs(val.x - px) > ACTIVE_RADIUS ||
      Math.abs(val.z - pz) > ACTIVE_RADIUS
    ) {
      scene.remove(val.group);
      loadedRooms.delete(key);
    }
  }
  // Rebuild flickerLights to only include active panel lights
  flickerLights = [];
  for (const { group } of loadedRooms.values()) {
    group.traverse((obj) => {
      if (obj.isPointLight && obj.userData.isPanelLight) {
        flickerLights.push(obj);
      }
    });
  }
}

// --- Replace createBackrooms call with infinite streaming ---
let lastRoomCoords = { x: null, z: null };
function infiniteBackrooms(
  wallMaterial,
  floorMaterial,
  ceilingMaterial,
  lightPanelMaterial
) {
  // Set initial camera position
  camera.position.set(2, 1.6, 2);
  updateRooms(
    camera.position,
    wallMaterial,
    floorMaterial,
    ceilingMaterial,
    lightPanelMaterial
  );
}

async function setupMaterials() {
  // Try to load all textures and sounds
  const exrLoader = new EXRLoader();
  const [
    wallAlbedo,
    floorAlbedo,
    ceilingTex,
    lightTex,
    wallNormal,
    wallRough,
    floorNormal,
    floorRough,
    floorDisp,
    buzzBuffer,
    ambientBuffer,
    walkBuffer,
    knockBuffer,
    breathBuffer,
    sprayPaintTex,
    sprayBuffer,
    sprayShakeBuffer,
    crawlingBuffer,
    idlingBuffer,
  ] = await Promise.all([
    tryLoadTexture("beige_wall_002_diff_4k.jpg"),
    tryLoadTexture("dirty_carpet_diff_4k.jpg"),
    tryLoadTexture("ceiling.jpg"),
    tryLoadTexture("fluorescent.png"),
    exrLoader.loadAsync("/the-backrooms/textures/beige_wall_002_nor_gl_4k.exr"),
    tryLoadTexture("beige_wall_002_rough_4k.jpg"),
    exrLoader.loadAsync("/the-backrooms/textures/dirty_carpet_nor_gl_4k.exr"),
    exrLoader.loadAsync("/the-backrooms/textures/dirty_carpet_rough_4k.exr"),
    tryLoadTexture("dirty_carpet_disp_4k.png"),
    tryLoadSound("buzz.mp3"),
    tryLoadSound("ambient.mp3"),
    tryLoadSound("walk.mp3"),
    tryLoadSound("knock.mp3"),
    tryLoadSound("breath.mp3"),
    tryLoadTexture("spray_paint.png"),
    tryLoadSound("spray.mp3"),
    tryLoadSound("spray_shake.mp3"),
    tryLoadSound("crawling.mp3"),
    tryLoadSound("idling.mp3"),
  ]);

  // Setup sounds if loaded
  if (buzzBuffer) {
    buzzSound.setBuffer(buzzBuffer);
    buzzSound.setLoop(true);
    buzzSound.setVolume(0.01);
    buzzSound.play();
  }

  if (ambientBuffer) {
    ambientSound.setBuffer(ambientBuffer);
    ambientSound.setLoop(true);
    ambientSound.setVolume(0.2);
    ambientSound.play();
  }

  if (walkBuffer) {
    walkSound.setBuffer(walkBuffer);
    walkSound.setLoop(true);
    walkSound.setVolume(0.3);
  }

  if (knockBuffer) {
    knockSound.setBuffer(knockBuffer);
    knockSource = setupKnockSound();
  }

  if (breathBuffer) {
    breathSound.setBuffer(breathBuffer);
    breathSound.setLoop(true);
    breathSound.setVolume(0.4);
  }

  if (crawlingBuffer) {
    crawlingSound.setBuffer(crawlingBuffer);
    crawlingSound.setRefDistance(8);
    crawlingSound.setMaxDistance(40);
    crawlingSound.setLoop(false);
    crawlingSound.setVolume(0.08);
  }

  if (idlingBuffer) {
    idlingSound.setBuffer(idlingBuffer);
    idlingSound.setRefDistance(8);
    idlingSound.setMaxDistance(40);
    idlingSound.setLoop(true);
    idlingSound.setVolume(0.08);
  }

  // Wall material (beige wall)
  if (wallAlbedo) {
    wallAlbedo.wrapS = THREE.RepeatWrapping;
    wallAlbedo.wrapT = THREE.RepeatWrapping;
    wallAlbedo.repeat.set(ROOM_SIZE / 5, ROOM_HEIGHT / 2);
    wallAlbedo.minFilter = THREE.LinearMipMapLinearFilter;
    wallAlbedo.magFilter = THREE.LinearFilter;
  }
  if (wallNormal) {
    wallNormal.wrapS = wallNormal.wrapT = THREE.RepeatWrapping;
    wallNormal.repeat.set(ROOM_SIZE / 5, ROOM_HEIGHT / 2);
    wallNormal.colorSpace = THREE.NoColorSpace;
    wallNormal.minFilter = THREE.LinearMipMapLinearFilter;
    wallNormal.magFilter = THREE.LinearFilter;
  }
  if (wallRough) {
    wallRough.wrapS = wallRough.wrapT = THREE.RepeatWrapping;
    wallRough.repeat.set(ROOM_SIZE / 5, ROOM_HEIGHT / 2);
    wallRough.colorSpace = THREE.NoColorSpace;
    wallRough.minFilter = THREE.LinearMipMapLinearFilter;
    wallRough.magFilter = THREE.LinearFilter;
  }
  const wallMaterial = new THREE.MeshStandardMaterial({
    map: wallAlbedo,
    normalMap: wallNormal,
    roughnessMap: wallRough,
    roughness: 1.0,
    metalness: 0.1,
  });

  // Floor material (carpet)
  if (floorAlbedo) {
    floorAlbedo.wrapS = floorAlbedo.wrapT = THREE.RepeatWrapping;
    floorAlbedo.repeat.set(ROOM_SIZE / 5, ROOM_SIZE / 5);
  }
  if (floorNormal) {
    floorNormal.wrapS = floorNormal.wrapT = THREE.RepeatWrapping;
    floorNormal.repeat.set(ROOM_SIZE / 5, ROOM_SIZE / 5);
  }
  if (floorRough) {
    floorRough.wrapS = floorRough.wrapT = THREE.RepeatWrapping;
    floorRough.repeat.set(ROOM_SIZE / 5, ROOM_SIZE / 5);
  }
  if (floorDisp) {
    floorDisp.wrapS = floorDisp.wrapT = THREE.RepeatWrapping;
    floorDisp.repeat.set(ROOM_SIZE / 5, ROOM_SIZE / 5);
  }
  const floorMaterial = new THREE.MeshStandardMaterial({
    map: floorAlbedo,
    normalMap: floorNormal,
    roughnessMap: floorRough,
    roughness: 1.0, // Use map, but set default
    metalness: 0.0,
  });

  // Ceiling material
  if (ceilingTex) {
    ceilingTex.wrapS = THREE.RepeatWrapping;
    ceilingTex.wrapT = THREE.RepeatWrapping;
    ceilingTex.repeat.set(ROOM_SIZE / 5, ROOM_SIZE / 5);
    ceilingTex.minFilter = THREE.LinearMipMapLinearFilter;
    ceilingTex.magFilter = THREE.LinearFilter;
  }
  const ceilingMaterial = ceilingTex
    ? new THREE.MeshStandardMaterial({
        map: ceilingTex,
        roughness: 0.9,
        metalness: 0.0,
      })
    : new THREE.MeshStandardMaterial({
        color: 0xfff7cc,
        roughness: 0.9,
        metalness: 0.0,
      });

  // Light panel material
  if (lightTex) {
    lightTex.wrapS = THREE.ClampToEdgeWrapping;
    lightTex.wrapT = THREE.ClampToEdgeWrapping;
    lightTex.repeat.set(1, 1);
  }
  const lightPanelMaterial = lightTex
    ? new THREE.MeshStandardMaterial({
        map: lightTex,
        emissive: 0xffffff,
        emissiveIntensity: 8,
        transparent: true,
        roughness: 0.2,
        metalness: 0.0,
      })
    : new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xffffff,
        emissiveIntensity: 8,
        roughness: 0.2,
        metalness: 0.0,
      });

  // Create spray paint material
  if (sprayPaintTex) {
    sprayPaintTex.minFilter = THREE.LinearFilter;
    sprayPaintTex.magFilter = THREE.LinearFilter;
    sprayPaintMaterial = new THREE.MeshBasicMaterial({
      map: sprayPaintTex,
      transparent: true,
      opacity: 0.1,
      alphaTest: 0.1,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
  } else {
    // Fallback material if texture fails to load
    sprayPaintMaterial = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      transparent: true,
      opacity: 1.0,
      alphaTest: 0.1,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
  }

  // Setup spray sound
  if (sprayBuffer) {
    spraySound.setBuffer(sprayBuffer);
    spraySound.setVolume(0.3);
  }

  if (sprayShakeBuffer) {
    sprayShakeSound.setBuffer(sprayShakeBuffer);
    sprayShakeSound.setVolume(0.5);
  }

  currentMaterials = [
    wallMaterial,
    floorMaterial,
    ceilingMaterial,
    lightPanelMaterial,
  ];
  infiniteBackrooms(
    wallMaterial,
    floorMaterial,
    ceilingMaterial,
    lightPanelMaterial
  );
  setTimeout(() => {
    // Randomly choose a drawing function from SprayDrawings
    const drawingFn =
      SprayDrawings[Math.floor(Math.random() * SprayDrawings.length)];
    spawnDrawingOnClosestWall(drawingFn);
  }, 500); // Wait a bit for rooms to load
}

// Scene setup
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x000000, 0.015); // Pure black fog

// Create black environment map
const blackColor = new THREE.Color(0x000000);
const blackCubeTexture = new THREE.CubeTextureLoader().load([
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", // right
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", // left
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", // top
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", // bottom
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", // front
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", // back
]);
blackCubeTexture.colorSpace = THREE.NoColorSpace;
scene.environment = blackCubeTexture;
scene.background = blackColor;

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

// Add audio listener to camera
camera.add(listener);

// Add flashlight
const flashlight = new THREE.SpotLight(0xffffff, 5, 30, Math.PI / 4, 0.5, 1);
flashlight.position.set(0, 0, 0);
flashlight.castShadow = true;
flashlight.shadow.mapSize.width = 2048;
flashlight.shadow.mapSize.height = 2048;
flashlight.shadow.camera.near = 0.5;
flashlight.shadow.camera.far = 30;
flashlight.shadow.bias = -0.0001;
scene.add(flashlight);

// Add flashlight target
const flashlightTarget = new THREE.Object3D();
scene.add(flashlightTarget);
flashlight.target = flashlightTarget;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.setClearColor(0x000000); // Pure black background
document.body.appendChild(renderer.domElement);

// Controls
const controls = new PointerLockControls(camera, document.body);
controls.maxPolarAngle = Math.PI * 0.99;
controls.minPolarAngle = 0.01;
controls.pointerSpeed = 0.55;

// Use Euler angles for more predictable rotation
camera.rotation.order = "YXZ";
scene.add(controls.getObject());

// Lighting
const ambientLight = new THREE.AmbientLight(0x404040, 0.05); // Neutral gray ambient light
scene.add(ambientLight);

const flickerLight = new THREE.PointLight(0xffffff, 2.5, 20); // Pure white light
flickerLight.position.set(0, 2.8, 0);
scene.add(flickerLight);

// Player movement
const moveSpeed = 0.05; // Reduced base speed for more natural movement
const keys = {
  w: false,
  a: false,
  s: false,
  d: false,
  shift: false,
};

// Walking effect variables
let walkCycle = 0;
let lastStepTime = 0;
let stumbleTimer = 0;
let isStumbling = false;
let stumbleDirection = new THREE.Vector3();
let originalHeight = 1.6; // Original camera height
let lastTime = performance.now();
let wobbleTime = 0;
let wobbleIntensity = 0;
let swayDirection = 1; // Add sway direction variable

document.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() in keys) {
    keys[e.key.toLowerCase()] = true;
  }
});

document.addEventListener("keyup", (e) => {
  if (e.key.toLowerCase() in keys) {
    keys[e.key.toLowerCase()] = false;
  }
});

// Click to start
document.addEventListener("click", () => {
  controls.lock();
});

// Handle pointer lock change
controls.addEventListener("lock", () => {
  document.getElementById("loading").style.display = "none";
});

controls.addEventListener("unlock", () => {
  document.getElementById("loading").style.display = "block";
});

// Set initial camera position
camera.position.set(0, 1.6, 0);

// Add spawn point light panel
const spawnLightPanel = new THREE.Mesh(
  new THREE.PlaneGeometry(2, 2),
  new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 4,
    roughness: 0.2,
    metalness: 0.0,
  })
);
spawnLightPanel.position.set(0, ROOM_HEIGHT - 0.02, 0);
spawnLightPanel.rotation.x = Math.PI / 2;
scene.add(spawnLightPanel);

// Add spawn point light
const spawnLight = new THREE.PointLight(0xffffff, 4, ROOM_SIZE); // Pure white light
spawnLight.position.set(0, ROOM_HEIGHT + 0.05, 0);
spawnLight.userData.isPanelLight = true;
flickerLights.push(spawnLight);
scene.add(spawnLight);

// Add after the scene setup
let composer;
let crtPass;

// Add after scene initialization
const renderScene = new RenderPass(scene, camera);
composer = new EffectComposer(renderer);
composer.addPass(renderScene);

// Create CRT shader pass
const crtShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
  },
  vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
  fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float time;
        varying vec2 vUv;

        const float SCANLINE_INTENSITY = 0.075;
        const float SCANLINE_COUNT = 800.0;
        const float CURVATURE = 0.1;
        const float VIGNETTE_INTENSITY = 0.5;
        const float VIGNETTE_ROUNDNESS = 0.5;
        const float CHROMA_OFFSET = 0.002;

        vec2 curve(vec2 uv) {
            uv = (uv - 0.5) * 2.0;
            uv *= 1.1;
            uv = uv / 2.0 + 0.5;
            return uv;
        }

        void main() {
            vec2 curvedUv = curve(vUv);
            
            if (curvedUv.x < 0.0 || curvedUv.x > 1.0 || curvedUv.y < 0.0 || curvedUv.y > 1.0) {
                gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
                return;
            }

            float r = texture2D(tDiffuse, curvedUv + vec2(CHROMA_OFFSET, 0.0)).r;
            float g = texture2D(tDiffuse, curvedUv).g;
            float b = texture2D(tDiffuse, curvedUv - vec2(CHROMA_OFFSET, 0.0)).b;

            float scanline = sin(curvedUv.y * SCANLINE_COUNT) * SCANLINE_INTENSITY;
            
            vec2 vignetteUv = curvedUv * 2.0 - 1.0;
            float vignette = 1.0 - dot(vignetteUv, vignetteUv) * VIGNETTE_INTENSITY;
            vignette = pow(vignette, VIGNETTE_ROUNDNESS);

            vec3 color = vec3(r, g, b);
            color *= (1.0 - scanline);
            color *= vignette;

            float flicker = 1.0 - 0.02 * sin(time * 10.0);
            color *= flicker;

            gl_FragColor = vec4(color, 1.0);
        }
    `,
};

crtPass = new ShaderPass(crtShader);
composer.addPass(crtPass);

// Animation loop
let time = 0;

// Add countdown timer variables
let countdownTime = 600; // 10 minutes in seconds
let lastCountdownUpdate = 0;
const COUNTDOWN_UPDATE_INTERVAL = 1000; // Update every second

function animate() {
  requestAnimationFrame(animate);

  // Calculate delta time for frame-rate independent movement
  const currentTime = performance.now();
  const deltaTime = (currentTime - lastTime) / 1000; // Convert to seconds
  lastTime = currentTime;

  // Update countdown timer
  if (currentTime - lastCountdownUpdate > COUNTDOWN_UPDATE_INTERVAL) {
    countdownTime = Math.max(0, countdownTime - 1);
    lastCountdownUpdate = currentTime;

    // Update countdown display
    const minutes = Math.floor(countdownTime / 60);
    const seconds = countdownTime % 60;
    const countdownElement = document.getElementById("countdown");
    if (countdownElement) {
      countdownElement.textContent = `Footage Remaining: ${minutes
        .toString()
        .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    }
  }

  if (controls.isLocked) {
    // Update flashlight position and direction
    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);

    // Position flashlight slightly in front of camera
    const flashlightOffset = new THREE.Vector3(0, -0.2, -0.3); // Adjust these values to position the flashlight
    flashlightOffset.applyQuaternion(camera.quaternion);
    flashlight.position.copy(camera.position).add(flashlightOffset);

    // Update flashlight target to point where camera is looking
    const targetPosition = new THREE.Vector3();
    targetPosition
      .copy(camera.position)
      .add(cameraDirection.multiplyScalar(10));
    flashlightTarget.position.copy(targetPosition);

    // Handle movement
    const speed = keys.shift ? moveSpeed * 1.5 : moveSpeed;
    const moveDirection = new THREE.Vector3();

    // Get camera's forward and right vectors
    camera.getWorldDirection(cameraDirection); // Reuse cameraDirection
    const cameraRight = new THREE.Vector3();
    cameraRight.crossVectors(camera.up, cameraDirection).normalize();

    // Calculate movement direction based on input
    if (keys.w) moveDirection.add(cameraDirection);
    if (keys.s) moveDirection.sub(cameraDirection);
    if (keys.a) moveDirection.add(cameraRight);
    if (keys.d) moveDirection.sub(cameraRight);

    // Update wobble time
    wobbleTime += deltaTime * 1.2;

    // Only apply movement if any movement keys are pressed
    if (moveDirection.length() > 0) {
      moveDirection.normalize();

      // Stop breathing sound when moving
      if (breathSound.isPlaying) {
        breathSound.stop();
      }

      // Play walk sound if not already playing
      if (walkSound.isPlaying === false) {
        walkSound.play();
      }

      // Update walk cycle with delta time
      walkCycle += deltaTime * 2;

      // Calculate vertical movement for walking effect
      const verticalOffset = Math.sin(walkCycle * 2) * 0.02;

      // Increase wobble intensity when walking - reduced from 0.3 to 0.2 for smoother transition
      wobbleIntensity = Math.min(wobbleIntensity + deltaTime * 0.2, 0.08); // reduced max from 0.12 to 0.08

      // Random stumble chance when walking (adjusted for delta time)
      if (!isStumbling && Math.random() < 0.001 * deltaTime * 60) {
        isStumbling = true;
        stumbleTimer = 0;
        stumbleDirection.set(
          (Math.random() - 0.5) * 0.15, // reduced from 0.2
          (Math.random() - 0.5) * 0.15, // reduced from 0.2
          (Math.random() - 0.5) * 0.15 // reduced from 0.2
        );
      }

      // Handle stumbling effect
      if (isStumbling) {
        stumbleTimer += deltaTime;
        if (stumbleTimer > 1) {
          isStumbling = false;
        }

        // Apply stumble offset with reduced intensity
        moveDirection.add(stumbleDirection.multiplyScalar(0.08)); // reduced from 0.1
      }

      // Calculate movement amount
      const moveAmount = speed * deltaTime * 60;

      // Try movement in X and Z separately to allow sliding along walls
      const newPosX = camera.position.clone();
      newPosX.x += moveDirection.x * moveAmount;
      if (!checkCollision(newPosX)) {
        camera.position.x = newPosX.x;
      }

      const newPosZ = camera.position.clone();
      newPosZ.z += moveDirection.z * moveAmount;
      if (!checkCollision(newPosZ)) {
        camera.position.z = newPosZ.z;
      }

      // Apply vertical movement
      camera.position.y = originalHeight + verticalOffset;

      // Add slight random rotation during movement (adjusted for delta time)
      if (Math.random() < 0.1 * deltaTime * 60) {
        camera.rotation.z = Math.sin(walkCycle) * 0.008; // reduced from 0.01
      } else {
        camera.rotation.z *= Math.pow(0.9, deltaTime * 60); // Smoothly return to normal
      }
    } else {
      // Stop walk sound when not moving
      if (walkSound.isPlaying) {
        walkSound.stop();
      }

      // Play breathing sound when not moving
      if (!breathSound.isPlaying && breathSound.buffer) {
        breathSound.play();
      }

      // Reset camera height when not moving
      camera.position.y = originalHeight;
      camera.rotation.z *= Math.pow(0.9, deltaTime * 60);

      // Gradually increase standing sway intensity when standing still
      wobbleIntensity = Math.min(wobbleIntensity + deltaTime * 0.05, 0.06); // reduced from 0.08
    }

    // Apply continuous wobble effect with enhanced left-right sway
    let swayAmount, wobbleY, wobbleZ;

    if (moveDirection.length() > 0) {
      // Walking sway - primarily left-right with adjusted frequencies
      swayAmount = Math.sin(wobbleTime * 2.8) * wobbleIntensity * 0.012; // reduced frequency from 3.5 and amplitude from 0.015
      wobbleY = Math.cos(wobbleTime * 1.0) * wobbleIntensity * 0.002; // reduced frequency from 1.2 and amplitude from 0.003
      wobbleZ = Math.sin(wobbleTime * 0.6) * wobbleIntensity * 0.002; // reduced frequency from 0.8 and amplitude from 0.003
    } else {
      // Standing sway - all directions with very slow frequency and reduced amplitude
      swayAmount = Math.sin(wobbleTime * 0.3) * wobbleIntensity * 0.002; // reduced from 0.4 and 0.003
      wobbleY = Math.sin(wobbleTime * 0.4) * wobbleIntensity * 0.001; // reduced from 0.5 and 0.002
      wobbleZ = Math.cos(wobbleTime * 0.5) * wobbleIntensity * 0.0008; // reduced from 0.6 and 0.001
    }

    // Store current rotation
    const currentRotation = camera.rotation.clone();

    // Apply wobble to camera rotation with enhanced sway
    camera.rotation.y += swayAmount;
    camera.rotation.x += wobbleY;
    camera.rotation.z += wobbleZ;

    // Clamp the wobble to prevent excessive drift - reduced max wobble
    const maxWobble = 0.018; // reduced from 0.025
    camera.rotation.x = Math.max(
      Math.min(camera.rotation.x, currentRotation.x + maxWobble),
      currentRotation.x - maxWobble
    );
    camera.rotation.y = Math.max(
      Math.min(camera.rotation.y, currentRotation.y + maxWobble),
      currentRotation.y - maxWobble
    );
    camera.rotation.z = Math.max(
      Math.min(camera.rotation.z, currentRotation.z + maxWobble),
      currentRotation.z - maxWobble
    );

    // Update infinite rooms if player moved to a new room
    const px = Math.floor(camera.position.x / ROOM_SIZE);
    const pz = Math.floor(camera.position.z / ROOM_SIZE);
    if (px !== lastRoomCoords.x || pz !== lastRoomCoords.z) {
      lastRoomCoords = { x: px, z: pz };
      updateRooms(camera.position, ...currentMaterials);
    }

    // Shadowy figure turn-around trigger
    if (controls.isLocked) {
      // Get current facing direction (XZ plane)
      const currentDir = new THREE.Vector3();
      camera.getWorldDirection(currentDir);
      currentDir.y = 0; // Ignore vertical
      currentDir.normalize();
      if (!lastFacingDir) {
        lastFacingDir = currentDir.clone();
      }
      // Only check if cooldown is over
      if (shadowCooldown <= 0) {
        const angle = lastFacingDir.angleTo(currentDir);
        if (angle > SHADOW_TRIGGER_ANGLE) {
          spawnShadowFigure();
          shadowCooldown = SHADOW_COOLDOWN_TIME;
          lastFacingDir = currentDir.clone(); // Reset facing after trigger
        }
      } else {
        shadowCooldown -= 1 / 60; // Approximate frame time
        if (shadowCooldown < 0) shadowCooldown = 0;
      }
    }

    // Check for random drawing spawn during exploration
    if (currentTime - lastDrawingSpawnTime > DRAWING_SPAWN_INTERVAL) {
      // Only spawn if player is moving
      if (moveDirection.length() > 0) {
        spawnRandomDrawingInRoom();
        lastDrawingSpawnTime = currentTime;
      }
    }

    // Check for nearby drawing spawn
    if (currentTime - lastNearbyDrawingTime > NEARBY_DRAWING_COOLDOWN) {
      // Randomly choose a drawing function
      const drawingFn =
        SprayDrawings[Math.floor(Math.random() * SprayDrawings.length)];
      spawnDrawingOnClosestWall(drawingFn);
      lastNearbyDrawingTime = currentTime;
    }
  }

  // Update flickering light time and intensities every frame
  time += 0.01;
  let totalFlickerIntensity = 0;
  for (const light of flickerLights) {
    const phase = light.userData.flickerPhase || 0;
    // More dramatic flickering with higher base intensity
    const flickerIntensity =
      Math.sin(time * 15 + phase) * 0.8 + Math.random() * 0.2;
    light.intensity = 4 + flickerIntensity;
    totalFlickerIntensity += flickerIntensity;
  }

  // Update buzzing sound based on flickering lights
  if (buzzSound.isPlaying) {
    const avgFlickerIntensity =
      flickerLights.length > 0
        ? totalFlickerIntensity / flickerLights.length
        : 0;
    buzzSound.setVolume(0.03 + avgFlickerIntensity * 0.04); // Increased base volume and flicker influence
    buzzSound.setPlaybackRate(1 + avgFlickerIntensity * 0.1); // Slightly vary pitch with flicker
  }

  // Handle knock sound
  if (knockSound && knockSound.buffer) {
    const timeSinceLastKnock = currentTime - lastKnockTime;
    if (
      timeSinceLastKnock > KNOCK_INTERVAL_MIN &&
      (timeSinceLastKnock > KNOCK_INTERVAL_MAX || Math.random() < 0.001)
    ) {
      playRandomKnock();
      lastKnockTime = currentTime;
    }
  }

  // Update CRT shader time
  crtPass.uniforms.time.value = performance.now() * 0.001;

  // Handle spray painting
  if (controls.isLocked && isSpraying) {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const MAX_SPRAY_DISTANCE = 6.0; // Allow spraying within 6 units
    const intersects = raycaster.intersectObjects(scene.children, true);
    let sprayed = false;
    for (const intersect of intersects) {
      if (
        intersect.object.isMesh &&
        intersect.object.geometry.type === "BoxGeometry" &&
        intersect.distance <= MAX_SPRAY_DISTANCE
      ) {
        const decal = createSprayPaintDecal(
          intersect.point,
          intersect.face.normal,
          Math.random() < 0.5 ? 0xff0000 : 0x00ff00 // Randomly choose between red and green
        );
        scene.add(decal);
        sprayed = true;
        break; // Only create one decal per frame
      }
    }
    // Play spray or shake sound
    if (sprayed) {
      if (sprayShakeSound.isPlaying) sprayShakeSound.stop();
      if (spraySound.buffer && !spraySound.isPlaying) spraySound.play();
    } else {
      if (spraySound.isPlaying) spraySound.stop();
      if (sprayShakeSound.buffer && !sprayShakeSound.isPlaying)
        sprayShakeSound.play();
    }
  } else {
    // Stop both sounds if not spraying
    if (spraySound.isPlaying) spraySound.stop();
    if (sprayShakeSound.isPlaying) sprayShakeSound.stop();
  }

  // Replace renderer.render(scene, camera) with:
  composer.render();
}

// Handle window resize
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Start everything
RectAreaLightUniformsLib.init();
setupMaterials();
animate();

let currentMaterials = [];

// Add collision detection functions before the animate function
function getWallColliders() {
  const colliders = [];
  for (const { group, x, z } of loadedRooms.values()) {
    group.traverse((obj) => {
      if (obj.isMesh && obj.geometry.type === "BoxGeometry") {
        // Get world position of the wall
        const worldPos = new THREE.Vector3();
        obj.getWorldPosition(worldPos);

        // Get wall dimensions
        const size = new THREE.Vector3();
        obj.geometry.computeBoundingBox();
        obj.geometry.boundingBox.getSize(size);

        // Apply object's scale
        size.multiply(obj.scale);

        // Create collision box
        colliders.push({
          position: worldPos,
          size: size,
          rotation: obj.rotation.y,
        });
      }
    });
  }

  // Add shadow figure collision if it exists
  scene.traverse((obj) => {
    if (obj.userData.isShadowFigure) {
      const worldPos = new THREE.Vector3();
      obj.getWorldPosition(worldPos);

      // Create a collision box for the shadow figure
      // Using a slightly larger radius to ensure good collision detection
      colliders.push({
        position: worldPos,
        size: new THREE.Vector3(5, 4, 7), // Adjust size based on the model's scale
        rotation: obj.rotation.y,
        isShadowFigure: true,
      });
    }
  });

  return colliders;
}

function checkCollision(position, radius = 0.3, ignoreShadowFigure = false) {
  const colliders = getWallColliders();

  for (const collider of colliders) {
    // Skip shadow figure collision if we're checking for shadow figure movement
    if (ignoreShadowFigure && collider.isShadowFigure) {
      continue;
    }

    // Transform position to collider's local space
    const localPos = position.clone().sub(collider.position);
    localPos.applyAxisAngle(new THREE.Vector3(0, 1, 0), -collider.rotation);

    // Check if point is inside the collider box
    const halfSize = collider.size.clone().multiplyScalar(0.5);
    if (
      Math.abs(localPos.x) < halfSize.x + radius &&
      Math.abs(localPos.y) < halfSize.y + radius &&
      Math.abs(localPos.z) < halfSize.z + radius
    ) {
      return true;
    }
  }
  return false;
}

// Knock sound system
let lastKnockTime = 0;
const KNOCK_INTERVAL_MIN = 5000; // 5 seconds
const KNOCK_INTERVAL_MAX = 15000; // 15 seconds
const KNOCK_VOLUME = 2.0; // Doubled volume
const KNOCK_REF_DISTANCE = 3; // Reduced reference distance for louder close-up sound
const KNOCK_MAX_DISTANCE = 30; // Keep max distance the same

function setupKnockSound() {
  // Create an invisible object to hold the sound
  const knockSource = new THREE.Object3D();
  scene.add(knockSource);
  knockSource.add(knockSound);

  // Configure spatial audio properties
  knockSound.setRefDistance(KNOCK_REF_DISTANCE);
  knockSound.setMaxDistance(KNOCK_MAX_DISTANCE);
  knockSound.setRolloffFactor(0.5); // Reduced rolloff for louder sound at distance
  knockSound.setVolume(KNOCK_VOLUME);

  return knockSource;
}

function playRandomKnock() {
  // Get current room coordinates
  const px = Math.floor(camera.position.x / ROOM_SIZE);
  const pz = Math.floor(camera.position.z / ROOM_SIZE);

  // Find a random room within active radius, but prefer closer rooms
  const dx =
    Math.floor(Math.random() * (ACTIVE_RADIUS + 1)) -
    Math.floor(ACTIVE_RADIUS / 2);
  const dz =
    Math.floor(Math.random() * (ACTIVE_RADIUS + 1)) -
    Math.floor(ACTIVE_RADIUS / 2);
  const targetRoom = loadedRooms.get(roomKey(px + dx, pz + dz));

  if (targetRoom) {
    // Get random position within the room, but closer to the player
    const roomX = targetRoom.x * ROOM_SIZE;
    const roomZ = targetRoom.z * ROOM_SIZE;

    // Calculate position relative to player
    const playerX = camera.position.x;
    const playerZ = camera.position.z;

    // Get random position within a smaller area (ROOM_SIZE/4 instead of ROOM_SIZE-10)
    const x = roomX + (Math.random() - 0.5) * (ROOM_SIZE / 4);
    const z = roomZ + (Math.random() - 0.5) * (ROOM_SIZE / 4);

    // Position the knock sound
    knockSource.position.set(x, ROOM_HEIGHT / 2, z);

    // Play the sound
    if (!knockSound.isPlaying) {
      knockSound.play();
    }
  }
}

async function init() {
  // ... existing code ...

  // Spawn initial model at player position
  spawnModelAtPlayer("/models/your-model.gltf", { x: 0, y: 0, z: 0 });

  // ... existing code ...
}

// Add this to your scene initialization or where you want to spawn the model
async function spawnInitialModels() {
  try {
    // Spawn the NES model 2 units in front of the player
    const nesModel = await spawnModelAtPlayer("models/nes.gltf", {
      x: 0,
      y: 0,
      z: 2,
    });
    if (nesModel) {
      console.log("NES model spawned successfully");
    }
  } catch (error) {
    console.error("Error spawning NES model:", error);
  }
}

// Make sure we call this after the scene and controls are fully initialized
document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM loaded, initializing scene...");
  // ... existing initialization code ...

  // Call spawnInitialModels after a short delay to ensure everything is ready
  setTimeout(() => {
    console.log("Calling spawnInitialModels...");
    spawnInitialModels();
  }, 1000);

  // Add this before the init() function
  const ominousPhrases = [
    "WHO'S THERE?",
    "CAN YOU HEAR ME?",
    "DON'T TURN AROUND...",
    "DON'T GO TO SLEEP...",
    "SOMETHING'S WATCHING YOU...",
  ];

  function getRandomPhrase() {
    const randomIndex = Math.floor(Math.random() * ominousPhrases.length);
    return ominousPhrases[randomIndex];
  }

  // Update the loading text when the page loads
  const loadingElement = document.getElementById("loading");
  loadingElement.textContent = getRandomPhrase();
});

// Add after setupMaterials function
let isSpraying = false;

document.addEventListener("mousedown", (e) => {
  if (e.button === 0 && controls.isLocked) {
    // Left mouse button
    isSpraying = true;
    if (spraySound.buffer && !spraySound.isPlaying) {
      spraySound.play();
    }
  }
});

document.addEventListener("mouseup", (e) => {
  if (e.button === 0) {
    isSpraying = false;
    if (spraySound.isPlaying) {
      spraySound.stop();
    }
  }
});

function createSprayPaintDecal(position, normal, color = 0xff0000) {
  const decalSize = 0.5; // Size of the spray paint decal
  const decalGeometry = new THREE.PlaneGeometry(decalSize, decalSize);

  // Create a new material instance for this decal
  const decalMaterial = sprayPaintMaterial.clone();
  decalMaterial.color.setHex(color);
  decalMaterial.opacity = 1.0; // Ensure full opacity for the decal

  const decal = new THREE.Mesh(decalGeometry, decalMaterial);

  // Position the decal at the hit point
  decal.position.copy(position);

  // Orient the decal to face the wall
  decal.lookAt(position.clone().add(normal));

  // Add some random rotation for variety
  decal.rotation.z = Math.random() * Math.PI * 2;

  // Add some random scale variation
  const scale = 0.8 + Math.random() * 0.4;
  decal.scale.set(scale, scale, scale);

  return decal;
}

// Drawing function: draws a large creepy smiley face
function drawCreepySmiley(center, normal, right, up, scene, options = {}) {
  const SMILEY_WIDTH = 5.5;
  const SMILEY_HEIGHT = 1.5;
  // Eyes (large and far apart)
  const eyeOffset = right.clone().multiplyScalar(SMILEY_WIDTH * 0.33);
  scene.add(
    createSprayPaintDecal(
      center
        .clone()
        .add(up.clone().multiplyScalar(SMILEY_HEIGHT * 0.33))
        .add(eyeOffset),
      normal,
      0xff0000
    )
  );
  scene.add(
    createSprayPaintDecal(
      center
        .clone()
        .add(up.clone().multiplyScalar(SMILEY_HEIGHT * 0.33))
        .sub(eyeOffset),
      normal,
      0xff0000
    )
  );
  // Mouth (very wide arc)
  for (let t = -1.0; t <= 1.0; t += 0.07) {
    const mouthPos = center
      .clone()
      .add(right.clone().multiplyScalar(t * SMILEY_WIDTH * 0.5))
      .add(
        up
          .clone()
          .multiplyScalar(
            -SMILEY_HEIGHT * 0.33 + 0.35 * Math.pow(Math.abs(t), 1.5)
          )
      );
    scene.add(createSprayPaintDecal(mouthPos, normal, 0xff0000));
  }
}

// Drawing function: draws 'RUN' in red spray paint
function drawRunText(center, normal, right, up, scene, options = {}) {
  // 5x7 pixel font for R, U, N
  const RUN_FONT = {
    R: [
      [1, 1, 1, 1, 0],
      [1, 0, 0, 0, 1],
      [1, 0, 0, 0, 1],
      [1, 1, 1, 1, 0],
      [1, 0, 1, 0, 0],
      [1, 0, 0, 1, 0],
      [1, 0, 0, 0, 1],
    ],
    U: [
      [1, 0, 0, 0, 1],
      [1, 0, 0, 0, 1],
      [1, 0, 0, 0, 1],
      [1, 0, 0, 0, 1],
      [1, 0, 0, 0, 1],
      [1, 0, 0, 0, 1],
      [0, 1, 1, 1, 0],
    ],
    N: [
      [1, 0, 0, 0, 1],
      [1, 1, 0, 0, 1],
      [1, 0, 1, 0, 1],
      [1, 0, 0, 1, 1],
      [1, 0, 0, 0, 1],
      [1, 0, 0, 0, 1],
      [1, 0, 0, 0, 1],
    ],
  };
  const TEXT = "RUN";
  const DOT_SPACING = 0.32;
  const LETTER_WIDTH = 5 * DOT_SPACING;
  const LETTER_SPACING = 0.6;
  const TOTAL_WIDTH =
    TEXT.length * LETTER_WIDTH + (TEXT.length - 1) * LETTER_SPACING;
  let offsetX = -TOTAL_WIDTH / 2 + LETTER_WIDTH / 2;

  for (let i = 0; i < TEXT.length; ++i) {
    const char = TEXT[i];
    const grid = RUN_FONT[char];
    for (let y = 0; y < 7; ++y) {
      for (let x = 0; x < 5; ++x) {
        if (grid[y][x]) {
          // Optional: add jitter for spray effect
          const jitter = () => (Math.random() - 0.5) * DOT_SPACING * 0.2;
          const pos = center
            .clone()
            .add(
              right
                .clone()
                .multiplyScalar(offsetX + (x - 2) * DOT_SPACING + jitter())
            )
            .add(up.clone().multiplyScalar((3 - y) * DOT_SPACING + jitter()));
          scene.add(createSprayPaintDecal(pos, normal, 0xff0000));
        }
      }
    }
    offsetX += LETTER_WIDTH + LETTER_SPACING;
  }
}

// Drawing function: draws 'WHY?' in red spray paint
function drawWhyText(center, normal, right, up, scene, options = {}) {
  // 5x7 pixel font for W, H, Y, ?
  const WHY_FONT = {
    W: [
      [1, 0, 0, 0, 1],
      [1, 0, 0, 0, 1],
      [1, 0, 1, 0, 1],
      [1, 0, 1, 0, 1],
      [1, 0, 1, 0, 1],
      [1, 1, 0, 1, 1],
      [1, 0, 0, 0, 1],
    ],
    H: [
      [1, 0, 0, 0, 1],
      [1, 0, 0, 0, 1],
      [1, 1, 1, 1, 1],
      [1, 0, 0, 0, 1],
      [1, 0, 0, 0, 1],
      [1, 0, 0, 0, 1],
      [1, 0, 0, 0, 1],
    ],
    Y: [
      [1, 0, 0, 0, 1],
      [1, 0, 0, 0, 1],
      [0, 1, 0, 1, 0],
      [0, 0, 1, 0, 0],
      [0, 0, 1, 0, 0],
      [0, 0, 1, 0, 0],
      [0, 0, 1, 0, 0],
    ],
    "?": [
      [0, 1, 1, 1, 0],
      [1, 0, 0, 0, 1],
      [0, 0, 0, 0, 1],
      [0, 0, 0, 1, 0],
      [0, 0, 1, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 1, 0, 0],
    ],
  };
  const TEXT = "WHY?";
  const DOT_SPACING = 0.32;
  const LETTER_WIDTH = 5 * DOT_SPACING;
  const LETTER_SPACING = 0.6;
  const TOTAL_WIDTH =
    TEXT.length * LETTER_WIDTH + (TEXT.length - 1) * LETTER_SPACING;
  let offsetX = -TOTAL_WIDTH / 2 + LETTER_WIDTH / 2;

  for (let i = 0; i < TEXT.length; ++i) {
    const char = TEXT[i];
    const grid = WHY_FONT[char];
    for (let y = 0; y < 7; ++y) {
      for (let x = 0; x < 5; ++x) {
        if (grid[y][x]) {
          const jitter = () => (Math.random() - 0.5) * DOT_SPACING * 0.2;
          const pos = center
            .clone()
            .add(
              right
                .clone()
                .multiplyScalar(offsetX + (x - 2) * DOT_SPACING + jitter())
            )
            .add(up.clone().multiplyScalar((3 - y) * DOT_SPACING + jitter()));
          scene.add(createSprayPaintDecal(pos, normal, 0xff0000));
        }
      }
    }
    offsetX += LETTER_WIDTH + LETTER_SPACING;
  }
}

// Drawing function: draws a giant arrow pointing left or right
function drawArrow(center, normal, right, up, scene, options = {}) {
  // Arrow parameters
  const ARROW_LENGTH = 5.5;
  const ARROW_WIDTH = 1.2;
  const ARROW_HEAD_LENGTH = 2.2;
  const ARROW_HEAD_WIDTH = 2.5;
  // Randomly choose direction: -1 for left, 1 for right
  const direction = Math.random() < 0.5 ? -1 : 1;
  // Shaft
  for (let t = -0.4; t <= 0.4; t += 0.08) {
    for (let s = 0; s < ARROW_LENGTH; s += 0.32) {
      const pos = center
        .clone()
        .add(right.clone().multiplyScalar(direction * (s - ARROW_LENGTH / 2)))
        .add(up.clone().multiplyScalar(t * ARROW_WIDTH));
      scene.add(createSprayPaintDecal(pos, normal, 0xff0000));
    }
  }
  // Arrow head
  for (let h = 0; h < ARROW_HEAD_LENGTH; h += 0.18) {
    const headWidth = ARROW_HEAD_WIDTH * (1 - h / ARROW_HEAD_LENGTH);
    for (let t = -0.5; t <= 0.5; t += 0.08) {
      const pos = center
        .clone()
        .add(right.clone().multiplyScalar(direction * (ARROW_LENGTH / 2 + h)))
        .add(up.clone().multiplyScalar(t * headWidth));
      scene.add(createSprayPaintDecal(pos, normal, 0xff0000));
    }
  }
}

// Registry of available spray drawings (add drawArrow)
const SprayDrawings = [drawRunText, drawCreepySmiley, drawWhyText, drawArrow];

function spawnDrawingOnClosestWall(drawingFn) {
  // Find the closest wall mesh to the player
  const playerPos = camera.position.clone();
  let closestWall = null;
  let closestDist = Infinity;
  let closestWallPos = null;
  for (const { group } of loadedRooms.values()) {
    group.traverse((obj) => {
      if (
        obj.isMesh &&
        obj.geometry.type === "BoxGeometry" &&
        obj.material &&
        obj.material.map // Only real walls
      ) {
        const wallPos = new THREE.Vector3();
        obj.getWorldPosition(wallPos);
        const dist = wallPos.distanceTo(playerPos);
        if (dist < closestDist) {
          closestDist = dist;
          closestWall = obj;
          closestWallPos = wallPos.clone();
        }
      }
    });
  }
  if (!closestWall) return;
  // Get wall normal, up, right, and center
  const normal = new THREE.Vector3(0, 0, 1);
  closestWall.getWorldDirection(normal);
  const up = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(up, normal).normalize();
  const center = closestWallPos
    .clone()
    .add(normal.clone().multiplyScalar(0.51));
  // Call the drawing function
  drawingFn(center, normal, right, up, scene);
}

// Shadowy figure running across the scene
async function spawnShadowFigure() {
  // Get player position and direction
  const playerPos = camera.position.clone();
  const camDir = new THREE.Vector3();
  camera.getWorldDirection(camDir);
  const right = new THREE.Vector3().crossVectors(camDir, camera.up).normalize();

  // Start and end positions: much further left/right, 20 units in front
  const lateralDistance = 25 + Math.random() * 10;
  const forwardDistance = 25 + Math.random() * 15;

  // Calculate initial positions
  const start = playerPos
    .clone()
    .add(right.clone().multiplyScalar(-lateralDistance))
    .add(camDir.clone().multiplyScalar(forwardDistance));
  const end = playerPos
    .clone()
    .add(right.clone().multiplyScalar(lateralDistance))
    .add(camDir.clone().multiplyScalar(forwardDistance));

  // Find valid positions for start and end
  const validStart = findValidSpawnPosition(start);
  if (!validStart) {
    console.warn("Could not find valid start position for shadow figure");
    return;
  }

  // Find a valid end position that has a clear path from start
  const validEnd = findValidPath(validStart, end);
  if (!validEnd) {
    console.warn("Could not find valid path for shadow figure");
    return;
  }

  validStart.y = -0.6;
  validEnd.y = -0.6;

  // Load and clone the spook model
  const gltf = await loadModel("models/spook.gltf");
  if (!gltf) return;
  const figure = gltf.scene.clone();
  figure.scale.set(3, 3, 3);
  figure.rotation.y = Math.PI / 2;
  figure.position.copy(validStart);
  figure.lookAt(validEnd);
  figure.rotateOnAxis(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  figure.rotateOnAxis(new THREE.Vector3(0, 1, 0), Math.PI);
  figure.traverse((obj) => {
    obj.castShadow = false;
    obj.receiveShadow = false;
    // Mark the figure for collision detection
    obj.userData.isShadowFigure = true;
  });

  // Add a point light in front of the model
  const pointLight = new THREE.PointLight(0xffffff, 4, 50);
  pointLight.position.set(0, 2, 2);
  figure.add(pointLight);

  // Attach crawling sound
  let sound = null;
  if (crawlingSound.buffer) {
    sound = new THREE.PositionalAudio(listener);
    sound.setBuffer(crawlingSound.buffer);
    sound.setRefDistance(8);
    sound.setMaxDistance(40);
    sound.setLoop(false);
    sound.setVolume(0.08);
    const maxOffset = sound.buffer.duration - 2;
    const randomOffset = Math.random() * maxOffset;
    sound.offset = randomOffset;
    figure.add(sound);
    sound.play();
  }

  // Attach idling sound to the figure
  let figureIdlingSound = null;
  if (idlingSound.buffer) {
    figureIdlingSound = new THREE.PositionalAudio(listener);
    figureIdlingSound.setBuffer(idlingSound.buffer);
    figureIdlingSound.setRefDistance(8);
    figureIdlingSound.setMaxDistance(40);
    figureIdlingSound.setLoop(false); // Start with no loop
    figureIdlingSound.setVolume(0.08);
    figure.add(figureIdlingSound);
    figureIdlingSound.play();
  }

  scene.add(figure);

  // Animate the figure across the scene with collision detection
  const duration = 2.5 + Math.random();
  const startTime = performance.now();
  let lastValidPos = validStart.clone();
  let stuckCount = 0;
  const MAX_STUCK_COUNT = 5;

  function animateFigure() {
    const elapsed = (performance.now() - startTime) / 1000;
    const t = Math.min(elapsed / duration, 1);

    // Calculate next position
    const nextPos = new THREE.Vector3().lerpVectors(validStart, validEnd, t);

    // Check if next position is valid, ignoring the shadow figure's own collision
    if (!checkCollision(nextPos, 1.0, true)) {
      figure.position.copy(nextPos);
      lastValidPos.copy(nextPos);
      stuckCount = 0; // Reset stuck counter when we move successfully

      // If we're moving, ensure idling sound is not looping
      if (figureIdlingSound) {
        figureIdlingSound.setLoop(false);
        // If the sound has finished, play it again
        if (!figureIdlingSound.isPlaying) {
          figureIdlingSound.play();
        }
      }
    } else {
      // If we're stuck, try to find a way around
      stuckCount++;

      // When colliding with wall, loop the idling sound
      if (figureIdlingSound) {
        figureIdlingSound.setLoop(true);
        if (!figureIdlingSound.isPlaying) {
          figureIdlingSound.play();
        }
      }

      if (stuckCount > MAX_STUCK_COUNT) {
        // If we've been stuck too long, end the animation
        if (sound && sound.isPlaying) {
          sound.stop();
        }
        if (figureIdlingSound && figureIdlingSound.isPlaying) {
          figureIdlingSound.stop();
        }
        scene.remove(figure);
        return;
      }

      // Try to slide along the wall
      const moveDir = new THREE.Vector3()
        .subVectors(validEnd, lastValidPos)
        .normalize();
      const rightDir = new THREE.Vector3()
        .crossVectors(moveDir, new THREE.Vector3(0, 1, 0))
        .normalize();

      // Try moving slightly to the right of the wall
      const rightPos = lastValidPos.clone().add(rightDir.multiplyScalar(2));
      if (!checkCollision(rightPos, 1.0, true)) {
        figure.position.copy(rightPos);
        lastValidPos.copy(rightPos);
        return;
      }

      // Try moving slightly to the left of the wall
      const leftPos = lastValidPos.clone().add(rightDir.multiplyScalar(-2));
      if (!checkCollision(leftPos, 1.0, true)) {
        figure.position.copy(leftPos);
        lastValidPos.copy(leftPos);
        return;
      }
    }

    if (t < 1) {
      requestAnimationFrame(animateFigure);
    } else {
      // Fade out the sound if present
      if (sound && sound.isPlaying) {
        const fadeDuration = 0.7;
        const initialVolume = sound.getVolume();
        const fadeStart = performance.now();
        function fadeStep() {
          const fadeElapsed = (performance.now() - fadeStart) / 1000;
          const fadeT = Math.min(fadeElapsed / fadeDuration, 1);
          sound.setVolume(initialVolume * (1 - fadeT));
          if (fadeT < 1) {
            requestAnimationFrame(fadeStep);
          } else {
            sound.stop();
          }
        }
        fadeStep();
      }
      // Stop idling sound when animation ends
      if (figureIdlingSound && figureIdlingSound.isPlaying) {
        figureIdlingSound.stop();
      }
      scene.remove(figure);
    }
  }
  animateFigure();
}

// For testing: press 'F' to trigger the shadowy figure
window.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "f") {
    spawnShadowFigure();
  }
});

// --- Shadowy Figure Turn-Around Trigger System ---
let lastFacingDir = null;
let shadowCooldown = 0;
const SHADOW_COOLDOWN_TIME = 60; // seconds (increased from 30 to 60)
const SHADOW_TRIGGER_ANGLE = (150 * Math.PI) / 180; // radians

// Function to spawn a random drawing on a wall in the current room
function spawnRandomDrawingInRoom() {
  const playerPos = camera.position.clone();
  const cameraDir = new THREE.Vector3();
  camera.getWorldDirection(cameraDir);
  // Get all walls in a large radius (e.g., 18 units)
  const candidateWalls = [];
  for (const { group } of loadedRooms.values()) {
    group.traverse((obj) => {
      if (
        obj.isMesh &&
        obj.geometry.type === "BoxGeometry" &&
        obj.material &&
        obj.material.map
      ) {
        const wallPos = new THREE.Vector3();
        obj.getWorldPosition(wallPos);
        if (wallPos.distanceTo(playerPos) < 18) {
          // Exclude walls in line of sight
          if (!isWallInLineOfSight(obj, playerPos, cameraDir, Math.PI / 2)) {
            // Exclude walls with a drawing already nearby
            const normal = new THREE.Vector3(0, 0, 1);
            obj.getWorldDirection(normal);
            const center = wallPos
              .clone()
              .add(normal.clone().multiplyScalar(0.51));
            if (!isDrawingNearby(center, 2.5)) {
              candidateWalls.push({ obj, center, normal });
            }
          }
        }
      }
    });
  }
  if (candidateWalls.length === 0) return;
  // Pick a random wall from the candidates
  const { obj, center, normal } =
    candidateWalls[Math.floor(Math.random() * candidateWalls.length)];
  const up = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(up, normal).normalize();
  // Randomly choose a drawing function
  const drawingFn =
    SprayDrawings[Math.floor(Math.random() * SprayDrawings.length)];
  // Call the drawing function
  drawingFn(center, normal, right, up, scene);
}

// Add exploration drawing spawn timer
let lastDrawingSpawnTime = 0;
const DRAWING_SPAWN_INTERVAL = 30000; // 30 seconds between random drawing spawns
const NEARBY_DRAWING_COOLDOWN = 15000; // 15 seconds between nearby drawing spawns
let lastNearbyDrawingTime = 0;

// Helper: check if a wall is in the player's line of sight
function isWallInLineOfSight(wall, playerPos, cameraDir, fov = Math.PI / 2) {
  const wallPos = new THREE.Vector3();
  wall.getWorldPosition(wallPos);
  const toWall = wallPos.clone().sub(playerPos).normalize();
  const dot = cameraDir.dot(toWall);
  // FOV is 90 degrees by default (PI/2)
  return dot > Math.cos(fov / 2);
}

// Helper: check if a drawing already exists near a position
function isDrawingNearby(pos, minDist = 2.5) {
  let found = false;
  scene.traverse((obj) => {
    if (obj.userData && obj.userData.isSprayDrawing) {
      if (obj.position.distanceTo(pos) < minDist) {
        found = true;
      }
    }
  });
  return found;
}

// Patch createSprayPaintDecal to mark decals as spray drawings
const originalCreateSprayPaintDecal = createSprayPaintDecal;
function createSprayPaintDecalMarked(position, normal, color = 0xff0000) {
  const decal = originalCreateSprayPaintDecal(position, normal, color);
  decal.userData.isSprayDrawing = true;
  return decal;
}
createSprayPaintDecal = createSprayPaintDecalMarked;
