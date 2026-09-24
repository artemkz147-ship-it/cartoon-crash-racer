/**
 * Hybrid real-3D assets: Kenney Car/Road/Nature/City kits + Quaternius (CC0),
 * Blender-polished GLBs under public/models/. Procedural meshes.js is fallback.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  makeCarMesh,
  makeCrateMesh,
  makeBarrelMesh,
  makeDebrisPiece,
} from './meshes.js';

const loader = new GLTFLoader();
/** @type {Map<string, THREE.Object3D>} */
const templates = new Map();
let preloadPromise = null;
let ready = false;

const CAR_IDS = [
  'kartoshka', 'zhuk', 'tank', 'raketa', 'monster', 'molniya', 'bulldozer', 'korol',
];
const STYLES = ['buggy', 'coupe', 'tank', 'rocket', 'monster', 'sport', 'truck', 'king'];

const PROP_URLS = {
  'prop:crate': 'models/props/crate.glb',
  'prop:barrel': 'models/props/barrel.glb',
  'prop:barrelBlue': 'models/props/barrel-blue.glb',
  'prop:cone': 'models/props/cone.glb',
};

const DEBRIS_URLS = [
  'models/debris/debris-bumper.glb',
  'models/debris/debris-door.glb',
  'models/debris/debris-door-window.glb',
  'models/debris/debris-plate-a.glb',
  'models/debris/debris-plate-b.glb',
  'models/debris/debris-spoiler-a.glb',
  'models/debris/debris-tire.glb',
];

const ENV_IDS = [
  'road_straight', 'road_straight_barrier', 'road_curve', 'road_slant',
  'curb_red', 'curb_white', 'jersey_barrier', 'guardrail', 'guardrail_double',
  'construction_barrier', 'ramp', 'road_ramp',
  'lamp', 'lamp_double', 'lamp_race', 'billboard', 'billboard_low',
  'cone', 'dumpster', 'grandstand', 'grandstand_covered', 'fence', 'pylon', 'flag_checkers',
  'tree_pine', 'tree_pine_b', 'tree_oak', 'tree_default', 'tree_palm', 'tree_cone',
  'cactus_tall', 'cactus_short', 'rock_large', 'rock_large_b', 'rock_small', 'bush',
  'cliff_rock', 'rocks_castle',
  'building_a', 'building_b', 'building_c', 'building_d', 'skyscraper',
  'house_a', 'house_b', 'tree_suburban',
  'industrial_a', 'industrial_b', 'chimney', 'container', 'container_b', 'water_tower', 'tank',
];

/** Theme → preferred env prop keys (cycled). */
export const THEME_ENV_PROPS = {
  city: ['building_a', 'building_b', 'building_c', 'building_d', 'skyscraper', 'lamp', 'billboard', 'dumpster'],
  desert: ['cactus_tall', 'cactus_short', 'rock_large', 'rock_small', 'tree_palm', 'rock_large_b'],
  snow: ['tree_pine', 'tree_pine_b', 'tree_cone', 'rock_large', 'bush'],
  factory: ['industrial_a', 'industrial_b', 'chimney', 'container', 'tank', 'water_tower', 'lamp', 'dumpster'],
  stadium: ['grandstand', 'grandstand_covered', 'billboard', 'lamp_race', 'fence', 'flag_checkers', 'pylon'],
  forest: ['tree_oak', 'tree_default', 'tree_pine', 'bush', 'rock_small', 'tree_suburban'],
  docks: ['container', 'container_b', 'industrial_a', 'lamp', 'water_tower', 'dumpster', 'billboard_low'],
  volcano: ['cliff_rock', 'rocks_castle', 'rock_large', 'rock_large_b', 'rock_small'],
};


function loadOne(url) {
  return new Promise((resolve) => {
    loader.load(
      url,
      (gltf) => resolve(gltf.scene),
      undefined,
      (err) => {
        console.warn('[Assets] load fail', url, err?.message || err);
        resolve(null);
      }
    );
  });
}

/** Blender Y-up export faces −Z; game forward is +Z → wrap + yaw π. */
function prepTemplate(scene) {
  const wrap = new THREE.Group();
  wrap.add(scene);
  scene.rotation.y = Math.PI;
  scene.updateMatrixWorld(true);
  wrap.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    if (o.material) {
      o.material = Array.isArray(o.material)
        ? o.material.map((m) => m.clone())
        : o.material.clone();
    }
  });
  return wrap;
}

/** Env kits already sit on XZ with Y-up — no extra yaw; share materials across instances. */
function prepEnvTemplate(scene) {
  const wrap = new THREE.Group();
  wrap.add(scene);
  scene.updateMatrixWorld(true);
  wrap.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    o.frustumCulled = true;
  });
  return wrap;
}

function cloneTemplate(key) {
  const t = templates.get(key);
  if (!t) return null;
  const g = t.clone(true);
  g.traverse((o) => {
    if (o.isMesh && o.material) {
      o.material = Array.isArray(o.material)
        ? o.material.map((m) => m.clone())
        : o.material.clone();
    }
  });
  return g;
}

export function assetsReady() {
  return ready;
}

export function preloadAssets() {
  if (preloadPromise) return preloadPromise;
  preloadPromise = (async () => {
    const jobs = [];
    for (const id of CAR_IDS) {
      jobs.push(
        loadOne(`models/cars/${id}.glb`).then((s) => {
          if (s) templates.set(`car:${id}`, prepTemplate(s));
        })
      );
    }
    for (const st of STYLES) {
      jobs.push(
        loadOne(`models/cars/style-${st}.glb`).then((s) => {
          if (s) templates.set(`style:${st}`, prepTemplate(s));
        })
      );
    }
    for (const [key, url] of Object.entries(PROP_URLS)) {
      jobs.push(
        loadOne(url).then((s) => {
          if (s) templates.set(key, prepTemplate(s));
        })
      );
    }
    DEBRIS_URLS.forEach((url, i) => {
      jobs.push(
        loadOne(url).then((s) => {
          if (s) templates.set(`debris:${i}`, prepTemplate(s));
        })
      );
    });
    for (const id of ENV_IDS) {
      jobs.push(
        loadOne(`models/env/${id}.glb`).then((s) => {
          if (s) templates.set(`env:${id}`, prepEnvTemplate(s));
        })
      );
    }
    await Promise.all(jobs);
    ready = true;
    console.log('[Assets] ready, templates=', templates.size);
    return ready;
  })();
  return preloadPromise;
}

function collectWheels(root) {
  const wheels = [];
  root.traverse((o) => {
    const n = (o.name || '').toLowerCase();
    if (n.includes('wheel') && (o.isMesh || o.isGroup || o.isObject3D)) {
      // Prefer mesh leaves for spinning
      if (o.isMesh) wheels.push(o);
    }
  });
  return wheels;
}

function findBody(root) {
  let body = null;
  let best = -1;
  root.traverse((o) => {
    if (!o.isMesh) return;
    const n = (o.name || '').toLowerCase();
    if (n.includes('wheel') || n.includes('character')) return;
    const v = o.geometry?.attributes?.position?.count || 0;
    const score = n === 'body' || n.includes('body') ? v + 1e7 : v;
    if (score > best) {
      best = score;
      body = o;
    }
  });
  return body;
}

function tintMeshes(root, colorHex, accentHex) {
  const body = findBody(root);
  const color = new THREE.Color(colorHex);
  const accent = new THREE.Color(accentHex);
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const n = (o.name || '').toLowerCase();
    if (n.includes('wheel')) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m.color) continue;
      if (o === body || n === 'body' || n.includes('body') || n.includes('chassis')) {
        m.color.copy(color);
      } else if (
        n.includes('spoiler') ||
        n.includes('stripe') ||
        n.includes('shovel') ||
        n.includes('accent')
      ) {
        m.color.copy(accent);
      }
      if (m.roughness != null) m.roughness = Math.min(0.85, m.roughness ?? 0.55);
      if (m.metalness != null) m.metalness = Math.min(0.35, m.metalness ?? 0.15);
      m.flatShading = true;
      m.needsUpdate = true;
    }
  });
  return body;
}

/** Attach arcade FX + userData contract expected by Car.js */
function attachArcadeFx(group, colorHex) {
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1.55, 16),
    new THREE.MeshBasicMaterial({
      color: 0x000000, transparent: true, opacity: 0.38, depthWrite: false,
    })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.03;
  group.add(shadow);

  const shield = new THREE.Mesh(
    new THREE.SphereGeometry(2.15, 12, 10),
    new THREE.MeshBasicMaterial({
      color: 0x44aaff, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide,
    })
  );
  shield.visible = false;
  group.add(shield);

  const dentMat = new THREE.MeshStandardMaterial({
    color: 0x2a2a30, roughness: 0.95, flatShading: true,
  });
  const dents = [];
  for (const [x, y, z, sx, sy, sz] of [
    [0.7, 0.7, 0.6, 0.45, 0.25, 0.5],
    [-0.65, 0.65, -0.4, 0.4, 0.22, 0.45],
    [0.2, 0.95, -0.9, 0.5, 0.3, 0.35],
    [-0.5, 0.6, 1.0, 0.35, 0.2, 0.4],
  ]) {
    const d = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), dentMat);
    d.position.set(x, y, z);
    d.visible = false;
    group.add(d);
    dents.push(d);
  }

  const looseMat = new THREE.MeshStandardMaterial({
    color: colorHex, roughness: 0.7, flatShading: true,
  });
  const looseDoor = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.45, 0.9), looseMat);
  looseDoor.position.set(0.95, 0.7, 0);
  looseDoor.rotation.z = 0.35;
  looseDoor.visible = false;
  group.add(looseDoor);
  const looseHood = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.7), looseMat);
  looseHood.position.set(0.15, 1.0, 0.9);
  looseHood.rotation.x = -0.45;
  looseHood.visible = false;
  group.add(looseHood);

  const smokePuff = new THREE.Mesh(
    new THREE.SphereGeometry(0.4, 6, 5),
    new THREE.MeshStandardMaterial({
      color: 0x555555, transparent: true, opacity: 0.55, flatShading: true,
    })
  );
  smokePuff.position.set(0, 1.4, -1.1);
  smokePuff.visible = false;
  group.add(smokePuff);

  const glowMat = new THREE.MeshStandardMaterial({
    color: 0xffeeaa, emissive: 0xffcc44, emissiveIntensity: 0.95, flatShading: true,
  });
  const headlights = [];
  for (const lx of [-0.55, 0.55]) {
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.1), glowMat);
    light.position.set(lx, 0.55, 1.45);
    group.add(light);
    headlights.push(light);
  }

  const body = findBody(group);
  const bodyMat =
    body && body.material && !Array.isArray(body.material) ? body.material : null;

  group.userData.wheels = collectWheels(group);
  group.userData.shadow = shadow;
  group.userData.shield = shield;
  group.userData.dents = dents;
  group.userData.panels = {
    looseDoor,
    looseHood,
    hood: body,
    cabin: body,
    bumper: body,
    glass: null,
    stripe: null,
  };
  group.userData.smokePuff = smokePuff;
  group.userData.headlights = headlights;
  group.userData.exhausts = [];
  group.userData.glowMat = glowMat;
  group.userData.bodyMat = bodyMat;
  group.userData.bodyMesh = body;
  group.userData.bumper = body;
  group.userData.isGltf = true;
  return group;
}

export function makeHybridCarMesh(colorHex, accentHex = 0xffffff, style = 'buggy', carId = null) {
  let root = null;
  if (carId) root = cloneTemplate(`car:${carId}`);
  if (!root) root = cloneTemplate(`style:${style}`);
  if (!root) return makeCarMesh(colorHex, accentHex, style);
  tintMeshes(root, colorHex, accentHex);
  attachArcadeFx(root, colorHex);
  root.userData.style = style;
  return root;
}

export function makeHybridCrateMesh() {
  const g = cloneTemplate('prop:crate');
  if (!g) return makeCrateMesh();
  return g;
}

export function makeHybridBarrelMesh(explosive = true) {
  const g = cloneTemplate(explosive ? 'prop:barrel' : 'prop:barrelBlue');
  if (!g) return makeBarrelMesh(explosive);
  g.userData.explosive = explosive;
  return g;
}

export function makeHybridDebrisPiece(color, size = 0.35) {
  if (templates.has('debris:0')) {
    const idx = Math.floor(Math.random() * DEBRIS_URLS.length);
    const g = cloneTemplate(`debris:${idx}`);
    if (g) {
      g.scale.setScalar(size / 0.45);
      g.traverse((o) => {
        if (o.isMesh && o.material?.color) o.material.color.set(color);
      });
      return g;
    }
  }
  return makeDebrisPiece(color, size);
}

export function hasEnv(id) {
  return templates.has(`env:${id}`);
}

/** Clone env template; shares materials/geometry for draw-call friendliness. */
export function cloneEnv(id) {
  const t = templates.get(`env:${id}`);
  if (!t) return null;
  return t.clone(true);
}

/** First available env key from list. */
export function cloneEnvAny(ids) {
  for (const id of ids) {
    const g = cloneEnv(id);
    if (g) return g;
  }
  return null;
}

export function envThemeProps(theme) {
  return THEME_ENV_PROPS[theme] || THEME_ENV_PROPS.city;
}
