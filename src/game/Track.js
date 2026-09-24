import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { makeBillboard } from './meshes.js';
import { getTrack } from './data/tracks.js';
import {
  hasEnv,
  cloneEnv,
  envThemeProps,
} from './Assets.js';

/**
 * Data-driven cartoon track. Builds layout from config shape + theme.
 */
export class Track {
  constructor(scene, world, trackId = 'city') {
    this.scene = scene;
    this.world = world;
    this.cfg = getTrack(trackId);
    this.lapCheckpoints = [];
    this.waypoints = [];
    this.ramps = [];
    this.hazards = []; // {type:'oil'|'boost'|'lava', x, z, r}
    this.centerLine = [];
    this.innerR = 0;
    this.outerR = 0;
    this.bodies = [];
    this.meshes = [];

    this._buildWaypoints();
    this._buildSky();
    this._buildGround();
    this._envRoad = this._buildRoadHybrid();
    if (!this._envRoad) this._buildRoad();
    this._envWalls = this._buildWallsHybrid();
    if (!this._envWalls) this._buildWalls();
    this._buildRampsHybrid();
    if (this.cfg.shortcut && !this.cfg.derby) this._buildShortcut();
    this._buildHazards();
    this._envDecor = this._buildDecorHybrid();
    if (!this._envDecor) this._buildDecor();
    this._buildCheckpoints();
  }

  dispose() {
    for (const m of this.meshes) this.scene.remove(m);
    for (const b of this.bodies) this.world.removeBody(b);
    this.meshes = [];
    this.bodies = [];
  }

  _addMesh(m) {
    this.scene.add(m);
    this.meshes.push(m);
    return m;
  }

  _addBody(b) {
    this.world.addBody(b);
    this.bodies.push(b);
    return b;
  }

  /** Generate centerline waypoints for different shapes. */
  _buildWaypoints() {
    const cfg = this.cfg;
    const rx = cfg.radiusX;
    const rz = cfg.radiusZ;
    const n = cfg.derby ? 28 : 64;
    const pts = [];

    if (cfg.shape === 'figure8') {
      for (let i = 0; i < n; i++) {
        const t = (i / n) * Math.PI * 2;
        // Lemniscate of Gerono-ish
        const x = rx * Math.sin(t);
        const z = rz * Math.sin(t) * Math.cos(t);
        pts.push({ x, z, t });
      }
    } else if (cfg.shape === 'kidney') {
      for (let i = 0; i < n; i++) {
        const t = (i / n) * Math.PI * 2;
        const pinch = 1 + 0.25 * Math.sin(t * 2);
        pts.push({ x: Math.cos(t) * rx * pinch, z: Math.sin(t) * rz, t });
      }
    } else if (cfg.shape === 'stadium' || cfg.shape === 'rect') {
      // Capsule / rounded rectangle centerline
      const straight = cfg.shape === 'rect' ? 0.55 : 0.4;
      for (let i = 0; i < n; i++) {
        const u = i / n;
        let x, z, t;
        if (u < 0.25) {
          const a = (u / 0.25) * Math.PI;
          x = Math.cos(a - Math.PI / 2) * rz * (1 - straight) + rx * straight;
          z = Math.sin(a - Math.PI / 2) * rz;
          t = a;
        } else if (u < 0.5) {
          const s = (u - 0.25) / 0.25;
          x = rx * straight - s * rx * straight * 2;
          z = rz;
          t = Math.PI / 2 + s;
        } else if (u < 0.75) {
          const a = ((u - 0.5) / 0.25) * Math.PI;
          x = Math.cos(a + Math.PI / 2) * rz * (1 - straight) - rx * straight;
          z = Math.sin(a + Math.PI / 2) * rz;
          t = Math.PI + a;
        } else {
          const s = (u - 0.75) / 0.25;
          x = -rx * straight + s * rx * straight * 2;
          z = -rz;
          t = Math.PI * 1.5 + s;
        }
        pts.push({ x, z, t });
      }
    } else if (cfg.shape === 'tight') {
      for (let i = 0; i < n; i++) {
        const t = (i / n) * Math.PI * 2;
        const wobble = 1 + 0.1 * Math.sin(t * 2) + 0.04 * Math.sin(t * 3);
        pts.push({ x: Math.cos(t) * rx * wobble, z: Math.sin(t) * rz * wobble * 0.95, t });
      }
    } else if (cfg.shape === 'irregular') {
      for (let i = 0; i < n; i++) {
        const t = (i / n) * Math.PI * 2;
        const wobble = 1 + 0.18 * Math.sin(t * 2.5) + 0.08 * Math.cos(t * 5);
        pts.push({ x: Math.cos(t) * rx * wobble, z: Math.sin(t) * rz * wobble, t });
      }
    } else if (cfg.shape === 'arena') {
      // Flat arena — waypoints along outer ring for spawn orientation only
      for (let i = 0; i < n; i++) {
        const t = (i / n) * Math.PI * 2 - Math.PI / 2;
        pts.push({ x: Math.cos(t) * (rx * 0.35), z: Math.sin(t) * (rz * 0.35), t });
      }
    } else {
      // oval / ellipse with gentle sweeping chicanes (readable flow, not twitchy)
      for (let i = 0; i < n; i++) {
        const t = (i / n) * Math.PI * 2 - Math.PI / 2;
        // low-frequency pinch + slight phase offset → long esses, not hairpins
        const sweep = 1 + 0.1 * Math.sin(t * 2 + 0.4) + 0.04 * Math.sin(t * 4);
        pts.push({ x: Math.cos(t) * rx * sweep, z: Math.sin(t) * rz * sweep, t });
      }
    }

    // Elevation along centerline (hills / dips / banked feel)
    const hills = cfg.hills || 0;
    const hillFreq = cfg.hillFreq || 2;
    for (let i = 0; i < pts.length; i++) {
      const t = pts[i].t != null ? pts[i].t : (i / pts.length) * Math.PI * 2;
      let y = 0;
      if (hills > 0) {
        y = hills * (0.55 * Math.sin(t * hillFreq) + 0.35 * Math.sin(t * hillFreq * 0.5 + 0.7)
          + 0.18 * Math.sin(t * (hillFreq * 2.2) + 1.3));
        if (cfg.banks) y += hills * 0.12 * Math.sin(t * 2);
      }
      pts[i].y = y;
      pts[i].elev = y;
    }

    this.waypoints = pts;
    this.centerLine = pts;
    // Approximate radii for AI boundary helpers
    this.innerR = Math.min(rx, rz) - cfg.width * 0.45;
    this.outerR = Math.max(rx, rz) + cfg.width * 0.55;
  }

  /** Sample road height near (x,z). */
  getHeightAt(x, z) {
    const pts = this.waypoints;
    if (!pts.length) return 0;
    let best = 0;
    let bestD = Infinity;
    let second = 0;
    let secondD = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bestD) {
        second = best;
        secondD = bestD;
        best = i;
        bestD = d;
      } else if (d < secondD) {
        second = i;
        secondD = d;
      }
    }
    const a = pts[best];
    const b = pts[second];
    const da = Math.sqrt(bestD) + 1e-4;
    const db = Math.sqrt(secondD) + 1e-4;
    const w = db / (da + db);
    return (a.y || 0) * w + (b.y || 0) * (1 - w);
  }

  /** Approximate pitch (radians) along track tangent near (x,z). */
  getPitchAt(x, z) {
    const idx = this.nearestWaypointIndex(x, z);
    const pts = this.waypoints;
    const a = pts[idx];
    const b = pts[(idx + 1) % pts.length];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const dy = (b.y || 0) - (a.y || 0);
    const horiz = Math.hypot(dx, dz) || 1;
    return Math.atan2(dy, horiz);
  }


  /** Place a cloned env mesh; returns null if missing. */
  _placeEnv(id, x, y, z, { yaw = 0, pitch = 0, sx = 1, sy = 1, sz = 1 } = {}) {
    const m = cloneEnv(id);
    if (!m) return null;
    m.position.set(x, y, z);
    m.rotation.order = 'YXZ';
    m.rotation.y = yaw;
    m.rotation.x = pitch;
    m.scale.set(sx, sy, sz);
    this._addMesh(m);
    return m;
  }

  /**
   * Instance modular road GLBs along centerline + red/white curbs.
   * Keeps a thin procedural ribbon underlay for continuous asphalt / wet look.
   * @returns {boolean} true if GLB road used
   */
  _buildRoadHybrid() {
    if (!hasEnv('road_straight')) return false;
    const cfg = this.cfg;
    const w = cfg.width;
    const pts = this.waypoints;
    const asphaltTex = this._makeAsphaltTexture();
    const wet = !!cfg.wet;
    const asphaltMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(cfg.asphalt),
      map: asphaltTex,
      roughness: wet ? 0.28 : 0.9,
      metalness: wet ? 0.35 : 0.05,
      flatShading: true,
    });

    if (cfg.derby || cfg.shape === 'arena') {
      const rx = cfg.radiusX;
      const rz = cfg.radiusZ;
      const arena = new THREE.Mesh(
        new THREE.CircleGeometry(Math.max(rx, rz) * 0.95, 48),
        asphaltMat
      );
      arena.rotation.x = -Math.PI / 2;
      arena.position.y = 0.02;
      arena.scale.set(rx / Math.max(rx, rz), 1, rz / Math.max(rx, rz));
      arena.receiveShadow = true;
      this._addMesh(arena);
      // Ring of jersey barriers
      const segs = 28;
      for (let i = 0; i < segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        const next = ((i + 1) / segs) * Math.PI * 2;
        const mid = (a + next) / 2;
        const len = Math.hypot(Math.cos(next) * rx - Math.cos(a) * rx, Math.sin(next) * rz - Math.sin(a) * rz);
        this._placeEnv(i % 2 ? 'curb_red' : 'curb_white',
          Math.cos(mid) * rx * 0.98, 0.05, Math.sin(mid) * rz * 0.98,
          { yaw: -mid, sx: Math.max(0.8, len / 2.2), sy: 1.1, sz: 1.1 });
      }
      return true;
    }

    // Continuous underlay ribbon (cheap, fills gaps between tiles)
    this._addMesh(this._makeRibbon(pts, w * 0.5, 0.02, asphaltMat, { uvScale: 0.12 }));
    if (wet) {
      const reflMat = new THREE.MeshStandardMaterial({
        color: 0x88aacc, roughness: 0.15, metalness: 0.55,
        transparent: true, opacity: 0.22, flatShading: true,
      });
      this._addMesh(this._makeRibbon(pts, w * 0.42, 0.04, reflMat, { uvScale: 0.05 }));
    }

    const NATIVE = 8; // polished road_straight footprint
    const step = 1; // every waypoint segment
    for (let i = 0; i < pts.length; i += step) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len < 0.25) continue;
      const ang = Math.atan2(dx, dz);
      const ey = ((a.y || 0) + (b.y || 0)) * 0.5;
      const pitch = Math.atan2((b.y || 0) - (a.y || 0), len);
      // Prefer barrier-edged piece every other tile for visual variety
      const roadId = (i % 3 === 0 && hasEnv('road_straight_barrier'))
        ? 'road_straight_barrier'
        : 'road_straight';
      this._placeEnv(roadId,
        (a.x + b.x) / 2, ey + 0.03, (a.z + b.z) / 2,
        {
          yaw: ang,
          pitch,
          sx: (w * 1.02) / NATIVE,
          sy: 1,
          sz: (len * 1.08) / NATIVE,
        });
    }

    // Center dashed stripes (procedural — cheap readable racing line)
    const stripeMat = new THREE.MeshStandardMaterial({
      color: 0xffe566, emissive: 0xaa8800, emissiveIntensity: 0.15, flatShading: true,
    });
    for (let i = 0; i < pts.length; i += 2) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len < 0.1) continue;
      const ang = Math.atan2(dx, dz);
      const ey = ((a.y || 0) + (b.y || 0)) * 0.5;
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.04, Math.min(2.4, len * 0.55)), stripeMat);
      s.position.set((a.x + b.x) / 2, ey + 0.08, (a.z + b.z) / 2);
      s.rotation.y = ang;
      this._addMesh(s);
    }

    // Red/white kerb modules along edges
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const n = pts[(i + 1) % pts.length];
      const ang = Math.atan2(n.x - p.x, n.z - p.z);
      const nx = Math.cos(ang);
      const nz = -Math.sin(ang);
      const segLen = Math.hypot(n.x - p.x, n.z - p.z);
      const ey = ((p.y || 0) + (n.y || 0)) * 0.5;
      const curbId = i % 2 === 0 ? 'curb_white' : 'curb_red';
      const alt = hasEnv(curbId) ? curbId : (hasEnv('construction_barrier') ? 'construction_barrier' : null);
      if (!alt) continue;
      for (const side of [-1, 1]) {
        this._placeEnv(alt,
          (p.x + n.x) / 2 + nx * side * (w * 0.52),
          ey + 0.02,
          (p.z + n.z) / 2 + nz * side * (w * 0.52),
          { yaw: ang, sx: Math.max(0.6, segLen / 2.2), sy: 0.55, sz: 0.7 });
      }
    }
    return true;
  }

  /**
   * Jersey / guardrail visuals along walls; physics boxes unchanged.
   * @returns {boolean}
   */
  _buildWallsHybrid() {
    const useJersey = hasEnv('jersey_barrier') || hasEnv('guardrail');
    if (!useJersey) return false;
    const cfg = this.cfg;
    const pts = this.waypoints;
    const halfW = cfg.width * 0.55;
    const wallMat = new THREE.MeshStandardMaterial({ color: cfg.wallA, roughness: 0.65, flatShading: true });
    const wallMat2 = new THREE.MeshStandardMaterial({ color: cfg.wallB, roughness: 0.65, flatShading: true });
    const topMat = new THREE.MeshStandardMaterial({
      color: 0xffe566, emissive: 0xaa8800, emissiveIntensity: 0.25, flatShading: true,
    });

    if (cfg.derby || cfg.shape === 'arena') {
      const segs = 36;
      const rx = cfg.radiusX * 1.05;
      const rz = cfg.radiusZ * 1.05;
      for (let i = 0; i < segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        const next = ((i + 1) / segs) * Math.PI * 2;
        const mid = (a + next) / 2;
        const x0 = Math.cos(a) * rx;
        const z0 = Math.sin(a) * rz;
        const x1 = Math.cos(next) * rx;
        const z1 = Math.sin(next) * rz;
        const len = Math.hypot(x1 - x0, z1 - z0) * 1.05;
        const h = 3.2 + (cfg.banks ? Math.abs(Math.sin(mid * 2)) * 1.2 : 0);
        const id = i % 3 === 0 && hasEnv('guardrail_double')
          ? 'guardrail_double'
          : (hasEnv('jersey_barrier') ? 'jersey_barrier' : 'guardrail');
        this._placeEnv(id,
          Math.cos(mid) * rx, 0.05, Math.sin(mid) * rz,
          { yaw: -mid, sx: len / 2.8, sy: h / 0.4, sz: 2.2 });
        const body = new CANNON.Body({ mass: 0 });
        body.addShape(new CANNON.Box(new CANNON.Vec3(len / 2, h / 2, 0.6)));
        body.position.set(Math.cos(mid) * rx, h / 2, Math.sin(mid) * rz);
        body.quaternion.setFromEuler(0, -mid, 0);
        this._addBody(body);
      }
      return true;
    }

    for (let side of [-1, 1]) {
      for (let i = 0; i < pts.length; i++) {
        if (side === -1 && cfg.shortcut && i > pts.length * 0.45 && i < pts.length * 0.55) continue;
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const len = Math.hypot(dx, dz) * 1.06;
        const ang = Math.atan2(dx, dz);
        const nx = Math.cos(ang);
        const nz = -Math.sin(ang);
        const elev = ((a.y || 0) + (b.y || 0)) * 0.5;
        const midX = (a.x + b.x) / 2 + nx * side * halfW;
        const midZ = (a.z + b.z) / 2 + nz * side * halfW;
        const bankH = 2.4 + (cfg.banks ? Math.abs(Math.sin(i * 0.3)) * 1.1 : 0);
        const id = (i + (side > 0 ? 0 : 1)) % 4 === 0 && hasEnv('guardrail')
          ? 'guardrail'
          : (hasEnv('jersey_barrier') ? 'jersey_barrier' : 'guardrail_double');
        // jersey native height ~0.4 → scale sy to bankH
        this._placeEnv(id, midX, elev + 0.05, midZ, {
          yaw: ang,
          sx: len / 2.9,
          sy: bankH / 0.4,
          sz: 2.0,
        });
        // Tint stripe cap (small procedural) for theme color pops
        if (i % 2 === 0) {
          const cap = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.12, len * 0.9), i % 4 ? wallMat : topMat);
          cap.position.set(midX, elev + bankH + 0.08, midZ);
          cap.rotation.y = ang;
          this._addMesh(cap);
        }
      }
      // Physics every 2 segs (same as procedural)
      for (let i = 0; i < pts.length; i += 2) {
        if (side === -1 && cfg.shortcut && i > pts.length * 0.45 && i < pts.length * 0.55) continue;
        const a = pts[i];
        const c = pts[(i + 2) % pts.length];
        const mid = pts[(i + 1) % pts.length];
        const dx = c.x - a.x;
        const dz = c.z - a.z;
        const len = Math.hypot(dx, dz) * 1.08;
        if (len < 0.5) continue;
        const ang = Math.atan2(dx, dz);
        const nx = Math.cos(ang);
        const nz = -Math.sin(ang);
        const elev = ((a.y || 0) + (mid.y || 0) + (c.y || 0)) / 3;
        const midX = (a.x + c.x) / 2 + nx * side * halfW;
        const midZ = (a.z + c.z) / 2 + nz * side * halfW;
        const bankH = 2.6 + (cfg.banks ? Math.abs(Math.sin(i * 0.3)) * 1.0 : 0);
        const body = new CANNON.Body({ mass: 0 });
        body.addShape(new CANNON.Box(new CANNON.Vec3(0.65, bankH / 2, len / 2)));
        body.position.set(midX, elev + bankH / 2, midZ);
        body.quaternion.setFromEuler(0, ang, 0);
        this._addBody(body);
      }
    }

    if (cfg.shape !== 'figure8' && !cfg.derby) {
      const islandMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(cfg.groundA), roughness: 0.85, flatShading: true,
      });
      const island = new THREE.Mesh(
        new THREE.CylinderGeometry(this.innerR * 0.85, this.innerR * 0.85, 0.5, 24),
        islandMat
      );
      island.position.y = 0.2;
      this._addMesh(island);
    }
    return true;
  }

  _buildRampsHybrid() {
    const cfg = this.cfg;
    const count = cfg.ramps || 0;
    if (!count) return;
    const hasRamp = hasEnv('ramp') || hasEnv('road_ramp');
    if (!hasRamp) {
      this._buildRamps();
      return;
    }
    const pts = this.waypoints;
    for (let r = 0; r < count; r++) {
      const idx = Math.floor(((r + 0.5) / count) * pts.length) % pts.length;
      const p = pts[idx];
      const n = pts[(idx + 1) % pts.length];
      const ang = Math.atan2(n.x - p.x, n.z - p.z);
      const fx = Math.sin(ang);
      const fz = Math.cos(ang);
      const ey = p.y || 0;
      const id = hasEnv('ramp') ? 'ramp' : 'road_ramp';
      this._placeEnv(id, p.x, ey, p.z, { yaw: ang, sx: 1.6, sy: 1.4, sz: 1.6 });
      const body = new CANNON.Body({ mass: 0 });
      body.addShape(new CANNON.Box(new CANNON.Vec3(2.3, 0.22, 3.1)));
      body.position.set(p.x, ey + 0.75, p.z);
      body.quaternion.setFromEuler(-0.32, ang, 0);
      this._addBody(body);
      this.ramps.push({ x: p.x, z: p.z, y: ey, fx, fz, boost: 14 });
    }
  }

  /**
   * Theme scenery from Kenney kits. Falls back to procedural _buildDecor.
   * @returns {boolean}
   */
  _buildDecorHybrid() {
    const props = envThemeProps(this.cfg.theme);
    const any = props.some((id) => hasEnv(id));
    if (!any) return false;
    const cfg = this.cfg;

    // Clouds stay procedural (cheap sky fluff)
    const cloudMat = new THREE.MeshStandardMaterial({
      color: cfg.theme === 'volcano' ? 0x554444 : cfg.theme === 'factory' ? 0x888899 : 0xffffff,
      roughness: 1, flatShading: true, transparent: true,
      opacity: cfg.theme === 'volcano' ? 0.7 : 0.9,
    });
    const cloudN = cfg.theme === 'snow' ? 10 : 8;
    for (let i = 0; i < cloudN; i++) {
      const cloud = new THREE.Group();
      for (let j = 0; j < 4; j++) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(2.5 + Math.random() * 2.5, 1.1, 1.8), cloudMat);
        p.position.set(j * 1.8 - 2.2, Math.random() * 0.6, (Math.random() - 0.5) * 1.8);
        cloud.add(p);
      }
      const a = (i / cloudN) * Math.PI * 2;
      cloud.position.set(Math.cos(a) * (50 + (i % 3) * 6), 12 + Math.random() * 10, Math.sin(a) * (50 + (i % 3) * 6));
      this._addMesh(cloud);
    }

    // Ring of theme props (buildings / trees / rocks…)
    const n = cfg.derby ? 14 : 22;
    const baseR = 52;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.07;
      const r = baseR + (i % 5) * 3.5 + (i % 3) * 1.2;
      const id = props[i % props.length];
      if (!hasEnv(id)) continue;
      const scale = 0.85 + (i % 4) * 0.12;
      const yaw = -a + Math.PI + (i % 5) * 0.15;
      this._placeEnv(id, Math.cos(a) * r, 0, Math.sin(a) * r, {
        yaw, sx: scale, sy: scale, sz: scale,
      });
    }

    // Inner scatter (fewer, for depth without draw-call blowup)
    const innerN = cfg.derby ? 6 : 10;
    for (let i = 0; i < innerN; i++) {
      const a = (i / innerN) * Math.PI * 2 + 0.4;
      const r = 38 + (i % 3) * 2.5;
      const id = props[(i * 3) % props.length];
      if (!hasEnv(id)) continue;
      // Skip tall buildings too close to track
      if (id.startsWith('building') || id === 'skyscraper' || id.startsWith('industrial') || id.startsWith('grandstand')) {
        continue;
      }
      this._placeEnv(id, Math.cos(a) * r, 0, Math.sin(a) * r, {
        yaw: a, sx: 0.7, sy: 0.7, sz: 0.7,
      });
    }

    // Trackside lamps / billboards
    const lampId = hasEnv('lamp') ? 'lamp' : (hasEnv('lamp_race') ? 'lamp_race' : null);
    if (lampId && (cfg.night || cfg.theme === 'city' || cfg.theme === 'docks' || cfg.theme === 'stadium')) {
      const pts = this.waypoints;
      for (let i = 0; i < pts.length; i += 4) {
        const p = pts[i];
        const n2 = pts[(i + 1) % pts.length];
        const ang = Math.atan2(n2.x - p.x, n2.z - p.z);
        const nx = Math.cos(ang);
        const nz = -Math.sin(ang);
        const side = (i / 4) % 2 ? 1 : -1;
        this._placeEnv(lampId,
          p.x + nx * side * (cfg.width * 0.72),
          p.y || 0,
          p.z + nz * side * (cfg.width * 0.72),
          { yaw: ang, sx: 1, sy: 1, sz: 1 });
      }
    }

    if (hasEnv('billboard')) {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.25;
        this._placeEnv(i % 2 ? 'billboard' : (hasEnv('billboard_low') ? 'billboard_low' : 'billboard'),
          Math.cos(a) * 48, 0, Math.sin(a) * 48,
          { yaw: -a + Math.PI, sx: 1.1, sy: 1.1, sz: 1.1 });
      }
    } else {
      const colors = [0xff4466, 0x44aaff, 0xffee44, 0x66ff99, 0xff88cc, 0xff9944];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.2;
        const bb = makeBillboard(5.5, 3.2, colors[i % colors.length]);
        bb.position.set(Math.cos(a) * 48, 4.2, Math.sin(a) * 48);
        bb.lookAt(0, 4.2, 0);
        this._addMesh(bb);
      }
    }
    return true;
  }

  _buildSky() {
    const cfg = this.cfg;
    const geo = new THREE.SphereGeometry(160, 32, 16);
    const cols = [];
    const pos = geo.attributes.position;
    const [tr, tg, tb] = cfg.skyTop;
    const [br, bg, bb] = cfg.skyBot;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 160;
      const t = (y + 1) * 0.5;
      cols.push(br + (tr - br) * t, bg + (tg - bg) * t, bb + (tb - bb) * t);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    this._addMesh(
      new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false }))
    );
  }

  _buildGround() {
    const cfg = this.cfg;
    const size = 150;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const cell = 32;
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? cfg.groundA : cfg.groundB;
        ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(8, 8);
    tex.colorSpace = THREE.SRGBColorSpace;

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, flatShading: true })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this._addMesh(ground);

    const groundBody = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this._addBody(groundBody);
  }


  /** Continuous ribbon mesh along centerline (left/right offsets). Uses pt.y elevation. */
  _makeRibbon(pts, halfW, yBase, mat, { closed = true, uvScale = 0.08, height = 0 } = {}) {
    const n = pts.length;
    const segs = closed ? n : n - 1;
    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];
    let dist = 0;
    const left = [];
    const right = [];
    for (let i = 0; i < n; i++) {
      const prev = pts[(i - 1 + n) % n];
      const cur = pts[i];
      const next = pts[(i + 1) % n];
      let tx = next.x - prev.x;
      let tz = next.z - prev.z;
      if (!closed && i === 0) { tx = next.x - cur.x; tz = next.z - cur.z; }
      if (!closed && i === n - 1) { tx = cur.x - prev.x; tz = cur.z - prev.z; }
      const len = Math.hypot(tx, tz) || 1;
      tx /= len; tz /= len;
      const nx = tz;
      const nz = -tx;
      const ey = (cur.y != null ? cur.y : 0) + yBase + height;
      left.push({ x: cur.x - nx * halfW, z: cur.z - nz * halfW, y: ey, u: dist });
      right.push({ x: cur.x + nx * halfW, z: cur.z + nz * halfW, y: ey, u: dist });
      if (i < n - 1 || closed) {
        const nxt = pts[(i + 1) % n];
        dist += Math.hypot(nxt.x - cur.x, nxt.z - cur.z);
      }
    }
    for (let i = 0; i < n; i++) {
      const L = left[i];
      const R = right[i];
      const v = L.u * uvScale;
      positions.push(L.x, L.y, L.z, R.x, R.y, R.z);
      normals.push(0, 1, 0, 0, 1, 0);
      uvs.push(0, v, 1, v);
    }
    for (let i = 0; i < segs; i++) {
      const a = i * 2;
      const b = a + 1;
      const c = ((i + 1) % n) * 2;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    return mesh;
  }

  /** Asphalt canvas texture with faint grain. */
  _makeAsphaltTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = this.cfg.asphalt;
    ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 400; i++) {
      const g = 40 + Math.random() * 40;
      ctx.fillStyle = `rgba(${g},${g},${g + 10},0.15)`;
      ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 1);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  _buildRoad() {
    const cfg = this.cfg;
    const w = cfg.width;
    const asphaltTex = this._makeAsphaltTexture();
    const wet = !!cfg.wet;
    const asphaltMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(cfg.asphalt),
      map: asphaltTex,
      roughness: wet ? 0.28 : 0.9,
      metalness: wet ? 0.35 : 0.05,
      flatShading: true,
    });
    const stripeMat = new THREE.MeshStandardMaterial({
      color: 0xffe566,
      emissive: 0xaa8800,
      emissiveIntensity: 0.15,
      flatShading: true,
    });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true });
    const curbA = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true });
    const curbB = new THREE.MeshStandardMaterial({ color: 0xff3344, flatShading: true });

    if (cfg.derby || cfg.shape === 'arena') {
      const rx = cfg.radiusX;
      const rz = cfg.radiusZ;
      const arena = new THREE.Mesh(
        new THREE.CircleGeometry(Math.max(rx, rz) * 0.95, 48),
        asphaltMat
      );
      arena.rotation.x = -Math.PI / 2;
      arena.position.y = 0.02;
      arena.scale.set(rx / Math.max(rx, rz), 1, rz / Math.max(rx, rz));
      arena.receiveShadow = true;
      this._addMesh(arena);
      // Arena outer ring marking
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(Math.max(rx, rz) * 0.88, Math.max(rx, rz) * 0.95, 48),
        whiteMat
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.04;
      ring.scale.set(rx / Math.max(rx, rz), 1, rz / Math.max(rx, rz));
      this._addMesh(ring);
      return;
    }

    const pts = this.waypoints;
    // Continuous extruded road strip (merged quads with UVs + elevation)
    const road = this._makeRibbon(pts, w * 0.5, 0.03, asphaltMat, { uvScale: 0.12 });
    this._addMesh(road);

    // Cheap wet-road reflection fake (glossy translucent overlay)
    if (wet) {
      const reflMat = new THREE.MeshStandardMaterial({
        color: 0x88aacc,
        roughness: 0.15,
        metalness: 0.55,
        transparent: true,
        opacity: 0.22,
        flatShading: true,
      });
      this._addMesh(this._makeRibbon(pts, w * 0.42, 0.05, reflMat, { uvScale: 0.05 }));
    }

    // Center dashed line following elevation
    for (let i = 0; i < pts.length; i += 2) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len < 0.1) continue;
      const ang = Math.atan2(dx, dz);
      const ey = ((a.y || 0) + (b.y || 0)) * 0.5;
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.04, Math.min(2.4, len * 0.55)), stripeMat);
      s.position.set((a.x + b.x) / 2, ey + 0.06, (a.z + b.z) / 2);
      s.rotation.y = ang;
      this._addMesh(s);
    }

    // Continuous white edge lines (thin ribbons)
    const edgeHalf = w * 0.48;
    // Offset centerline for left/right edge ribbons
    const leftEdge = [];
    const rightEdge = [];
    for (let i = 0; i < pts.length; i++) {
      const prev = pts[(i - 1 + pts.length) % pts.length];
      const cur = pts[i];
      const next = pts[(i + 1) % pts.length];
      let tx = next.x - prev.x;
      let tz = next.z - prev.z;
      const len = Math.hypot(tx, tz) || 1;
      tx /= len; tz /= len;
      const nx = tz;
      const nz = -tx;
      leftEdge.push({ x: cur.x - nx * edgeHalf, z: cur.z - nz * edgeHalf, y: cur.y || 0 });
      rightEdge.push({ x: cur.x + nx * edgeHalf, z: cur.z + nz * edgeHalf, y: cur.y || 0 });
    }
    this._addMesh(this._makeRibbon(leftEdge, 0.18, 0.055, whiteMat, { uvScale: 0.2 }));
    this._addMesh(this._makeRibbon(rightEdge, 0.18, 0.055, whiteMat, { uvScale: 0.2 }));

    // Red/white kerbs along edges (every segment, alternating)
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const n = pts[(i + 1) % pts.length];
      const ang = Math.atan2(n.x - p.x, n.z - p.z);
      const nx = Math.cos(ang);
      const nz = -Math.sin(ang);
      const segLen = Math.hypot(n.x - p.x, n.z - p.z);
      for (const side of [-1, 1]) {
        const c = new THREE.Mesh(
          new THREE.BoxGeometry(0.5, 0.28, Math.max(0.8, segLen * 0.92)),
          i % 2 === 0 ? curbA : curbB
        );
        const ey = ((p.y || 0) + (n.y || 0)) * 0.5;
        c.position.set(
          (p.x + n.x) / 2 + nx * side * (w * 0.52),
          ey + 0.14,
          (p.z + n.z) / 2 + nz * side * (w * 0.52)
        );
        c.rotation.y = ang;
        c.castShadow = true;
        this._addMesh(c);
      }
    }

    // Racing-line chevrons (every 4th, subtler)
    const chevMat = new THREE.MeshStandardMaterial({
      color: 0x66ffcc,
      emissive: 0x22aa66,
      emissiveIntensity: 0.4,
      flatShading: true,
    });
    for (let i = 0; i < pts.length; i += 4) {
      const p = pts[i];
      const n = pts[(i + 1) % pts.length];
      const ang = Math.atan2(n.x - p.x, n.z - p.z);
      const chev = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.0, 3), chevMat);
      chev.rotation.x = Math.PI / 2;
      chev.rotation.z = ang;
      chev.position.set(p.x, (p.y || 0) + 0.08, p.z);
      this._addMesh(chev);
    }
  }

  _buildWalls() {
    const cfg = this.cfg;
    const wallMat = new THREE.MeshStandardMaterial({ color: cfg.wallA, roughness: 0.65, flatShading: true });
    const wallMat2 = new THREE.MeshStandardMaterial({ color: cfg.wallB, roughness: 0.65, flatShading: true });
    const topMat = new THREE.MeshStandardMaterial({
      color: 0xffe566,
      emissive: 0xaa8800,
      emissiveIntensity: 0.25,
      flatShading: true,
    });
    const pts = this.waypoints;
    const halfW = cfg.width * 0.55;

    if (cfg.derby || cfg.shape === 'arena') {
      const segs = 36;
      const rx = cfg.radiusX * 1.05;
      const rz = cfg.radiusZ * 1.05;
      for (let i = 0; i < segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        const next = ((i + 1) / segs) * Math.PI * 2;
        const mid = (a + next) / 2;
        const x0 = Math.cos(a) * rx;
        const z0 = Math.sin(a) * rz;
        const x1 = Math.cos(next) * rx;
        const z1 = Math.sin(next) * rz;
        const len = Math.hypot(x1 - x0, z1 - z0) * 1.05;
        const h = 3.2 + (cfg.banks ? Math.abs(Math.sin(mid * 2)) * 1.2 : 0);
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(len, h, 1.2), i % 2 ? wallMat : wallMat2);
        mesh.position.set(Math.cos(mid) * rx, h / 2, Math.sin(mid) * rz);
        mesh.rotation.y = -mid;
        mesh.castShadow = true;
        this._addMesh(mesh);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(len * 0.98, 0.18, 1.35), topMat);
        cap.position.set(mesh.position.x, h + 0.05, mesh.position.z);
        cap.rotation.y = -mid;
        this._addMesh(cap);
        const body = new CANNON.Body({ mass: 0 });
        body.addShape(new CANNON.Box(new CANNON.Vec3(len / 2, h / 2, 0.6)));
        body.position.set(mesh.position.x, h / 2, mesh.position.z);
        body.quaternion.setFromEuler(0, -mid, 0);
        this._addBody(body);
      }
      return;
    }

    // Outer + inner walls — jersey silhouette; visuals per-seg, physics every 2 segs (smoother)
    for (let side of [-1, 1]) {
      for (let i = 0; i < pts.length; i++) {
        if (side === -1 && cfg.shortcut && i > pts.length * 0.45 && i < pts.length * 0.55) continue;
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const len = Math.hypot(dx, dz) * 1.06;
        const ang = Math.atan2(dx, dz);
        const nx = Math.cos(ang);
        const nz = -Math.sin(ang);
        const elev = ((a.y || 0) + (b.y || 0)) * 0.5;
        const midX = (a.x + b.x) / 2 + nx * side * halfW;
        const midZ = (a.z + b.z) / 2 + nz * side * halfW;
        const bankH = 2.4 + (cfg.banks ? Math.abs(Math.sin(i * 0.3)) * 1.1 : 0);
        const mat = (i + (side > 0 ? 0 : 1)) % 2 ? wallMat : wallMat2;
        const base = new THREE.Mesh(new THREE.BoxGeometry(1.35, bankH * 0.45, len), mat);
        base.position.set(midX, elev + bankH * 0.22, midZ);
        base.rotation.y = ang;
        base.castShadow = true;
        this._addMesh(base);
        const upper = new THREE.Mesh(new THREE.BoxGeometry(0.95, bankH * 0.6, len * 0.98), mat);
        upper.position.set(midX, elev + bankH * 0.65, midZ);
        upper.rotation.y = ang;
        upper.castShadow = true;
        this._addMesh(upper);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.14, len * 0.96), topMat);
        cap.position.set(midX, elev + bankH + 0.05, midZ);
        cap.rotation.y = ang;
        this._addMesh(cap);
      }
      // Merged physics boxes (2 segments) — fewer seams, smoother slide
      for (let i = 0; i < pts.length; i += 2) {
        if (side === -1 && cfg.shortcut && i > pts.length * 0.45 && i < pts.length * 0.55) continue;
        const a = pts[i];
        const c = pts[(i + 2) % pts.length];
        const mid = pts[(i + 1) % pts.length];
        const dx = c.x - a.x;
        const dz = c.z - a.z;
        const len = Math.hypot(dx, dz) * 1.08;
        if (len < 0.5) continue;
        const ang = Math.atan2(dx, dz);
        const nx = Math.cos(ang);
        const nz = -Math.sin(ang);
        const elev = ((a.y || 0) + (mid.y || 0) + (c.y || 0)) / 3;
        const midX = (a.x + c.x) / 2 + nx * side * halfW;
        const midZ = (a.z + c.z) / 2 + nz * side * halfW;
        const bankH = 2.6 + (cfg.banks ? Math.abs(Math.sin(i * 0.3)) * 1.0 : 0);
        const body = new CANNON.Body({ mass: 0 });
        body.addShape(new CANNON.Box(new CANNON.Vec3(0.65, bankH / 2, len / 2)));
        body.position.set(midX, elev + bankH / 2, midZ);
        body.quaternion.setFromEuler(0, ang, 0);
        this._addBody(body);
      }
    }

    if (cfg.shape !== 'figure8' && !cfg.derby) {
      const islandMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(cfg.groundA),
        roughness: 0.85,
        flatShading: true,
      });
      const island = new THREE.Mesh(
        new THREE.CylinderGeometry(this.innerR * 0.85, this.innerR * 0.85, 0.5, 24),
        islandMat
      );
      island.position.y = 0.2;
      this._addMesh(island);
    }
  }

  _buildRamps() {
    const cfg = this.cfg;
    const count = cfg.ramps || 0;
    if (!count) return;
    const rampMat = new THREE.MeshStandardMaterial({ color: 0xff9944, roughness: 0.6, flatShading: true });
    const stripe = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true });
    const railMat = new THREE.MeshStandardMaterial({ color: 0xff3344, flatShading: true });
    const pts = this.waypoints;
    for (let r = 0; r < count; r++) {
      const idx = Math.floor(((r + 0.5) / count) * pts.length) % pts.length;
      const p = pts[idx];
      const n = pts[(idx + 1) % pts.length];
      const ang = Math.atan2(n.x - p.x, n.z - p.z);
      const fx = Math.sin(ang);
      const fz = Math.cos(ang);
      const group = new THREE.Group();
      // Wedge-ish ramp: stepped boxes for clearer silhouette
      const ramp = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.4, 6.2), rampMat);
      ramp.rotation.x = -0.32;
      ramp.position.y = 0.65;
      ramp.castShadow = true;
      group.add(ramp);
      const lip = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.2, 0.5), rampMat);
      lip.position.set(0, 1.55, 2.6);
      group.add(lip);
      for (const sx of [-1.8, 0, 1.8]) {
        const sm = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.42, 5.5), stripe);
        sm.rotation.x = -0.32;
        sm.position.set(sx * 0.55, 0.7, 0);
        group.add(sm);
      }
      // Side rails
      for (const sx of [-2.4, 2.4]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 5.8), railMat);
        rail.rotation.x = -0.32;
        rail.position.set(sx, 0.95, 0);
        group.add(rail);
      }
      const ey = p.y || 0;
      group.position.set(p.x, ey, p.z);
      group.rotation.y = ang;
      this._addMesh(group);
      const body = new CANNON.Body({ mass: 0 });
      body.addShape(new CANNON.Box(new CANNON.Vec3(2.3, 0.22, 3.1)));
      body.position.set(p.x, ey + 0.75, p.z);
      body.quaternion.setFromEuler(-0.32, ang, 0);
      this._addBody(body);
      this.ramps.push({ x: p.x, z: p.z, y: ey, fx, fz, boost: 14 });
    }
  }

  _buildShortcut() {
    const pts = this.waypoints;
    const mid = pts[Math.floor(pts.length * 0.5)];
    const pathMat = new THREE.MeshStandardMaterial({ color: 0x4a4a58, roughness: 0.9, flatShading: true });
    const path = new THREE.Mesh(new THREE.BoxGeometry(7, 0.05, 12), pathMat);
    path.position.set(mid.x * 0.4, 0.03, mid.z * 0.4);
    this._addMesh(path);
    const chevMat = new THREE.MeshStandardMaterial({ color: 0x44ffaa, flatShading: true });
    for (let i = 0; i < 4; i++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.8, 3), chevMat);
      c.rotation.x = Math.PI / 2;
      c.position.set(mid.x * 0.35 - i * 1.2, 0.15, mid.z * 0.35);
      this._addMesh(c);
    }
  }

  _buildHazards() {
    const cfg = this.cfg;
    // Boost pads
    const pts = this.waypoints;
    const boostCount = cfg.derby ? 4 : 5;
    for (let i = 0; i < boostCount; i++) {
      const idx = Math.floor(((i + 0.3) / boostCount) * pts.length) % pts.length;
      const p = pts[idx];
      const n = pts[(idx + 1) % pts.length];
      const ang = Math.atan2(n.x - p.x, n.z - p.z);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x44ffaa,
        emissive: 0x22aa66,
        emissiveIntensity: 0.6,
        flatShading: true,
      });
      const pad = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.08, 3.5), mat);
      const bey = p.y || 0;
      pad.position.set(p.x, bey + 0.06, p.z);
      pad.rotation.y = ang;
      this._addMesh(pad);
      // Soft emissive glow halo for boost pads
      const glow = new THREE.Mesh(
        new THREE.CircleGeometry(2.0, 16),
        new THREE.MeshBasicMaterial({ color: 0x44ffaa, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide })
      );
      glow.rotation.x = -Math.PI / 2;
      glow.position.set(p.x, bey + 0.04, p.z);
      this._addMesh(glow);
      this.hazards.push({ type: 'boost', x: p.x, z: p.z, y: bey, r: 2.2, ang });
    }

    // Oil slicks
    const oils = cfg.oilSlicks || (cfg.theme === 'snow' ? 4 : 3);
    for (let i = 0; i < oils; i++) {
      const idx = Math.floor(((i + 0.7) / oils) * pts.length) % pts.length;
      const p = pts[idx];
      const side = i % 2 ? 1 : -1;
      const n = pts[(idx + 1) % pts.length];
      const ang = Math.atan2(n.x - p.x, n.z - p.z);
      const nx = Math.cos(ang);
      const nz = -Math.sin(ang);
      const ox = p.x + nx * side * 3;
      const oz = p.z + nz * side * 3;
      const mat = new THREE.MeshStandardMaterial({
        color: 0x1a1a22,
        transparent: true,
        opacity: 0.75,
        roughness: 0.3,
        flatShading: true,
      });
      const oil = new THREE.Mesh(new THREE.CircleGeometry(1.8, 12), mat);
      oil.rotation.x = -Math.PI / 2;
      oil.position.set(ox, (p.y || 0) + 0.05, oz);
      this._addMesh(oil);
      this.hazards.push({ type: 'oil', x: ox, z: oz, r: 2.0 });
    }

    // Lava pits (volcano)
    if (cfg.lavaHazards) {
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        const x = Math.cos(a) * 8;
        const z = Math.sin(a) * 8;
        const mat = new THREE.MeshStandardMaterial({
          color: 0xff4400,
          emissive: 0xff2200,
          emissiveIntensity: 0.85,
          flatShading: true,
        });
        const lava = new THREE.Mesh(new THREE.CircleGeometry(3.2, 16), mat);
        lava.rotation.x = -Math.PI / 2;
        lava.position.set(x, 0.04, z);
        this._addMesh(lava);
        this.hazards.push({ type: 'lava', x, z, r: 3.0 });
      }
    }
  }

  _buildDecor() {
    const cfg = this.cfg;
    const cloudMat = new THREE.MeshStandardMaterial({
      color: cfg.theme === 'volcano' ? 0x554444 : cfg.theme === 'factory' ? 0x888899 : 0xffffff,
      roughness: 1,
      flatShading: true,
      transparent: true,
      opacity: cfg.theme === 'volcano' ? 0.7 : 0.9,
    });
    const cloudN = cfg.theme === 'snow' ? 10 : 8;
    for (let i = 0; i < cloudN; i++) {
      const cloud = new THREE.Group();
      for (let j = 0; j < 4; j++) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(2.5 + Math.random() * 2.5, 1.1, 1.8), cloudMat);
        p.position.set(j * 1.8 - 2.2, Math.random() * 0.6, (Math.random() - 0.5) * 1.8);
        cloud.add(p);
      }
      const a = (i / cloudN) * Math.PI * 2;
      cloud.position.set(Math.cos(a) * (50 + (i % 3) * 6), 12 + Math.random() * 10, Math.sin(a) * (50 + (i % 3) * 6));
      this._addMesh(cloud);
    }

    // Soft fill light orbs for night-ish themes
    if (cfg.theme === 'factory' || cfg.theme === 'volcano' || cfg.theme === 'docks') {
      const lampMat = new THREE.MeshStandardMaterial({
        color: 0xffee88,
        emissive: cfg.theme === 'volcano' ? 0xff6622 : 0xffcc44,
        emissiveIntensity: 1.2,
        flatShading: true,
      });
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + 0.15;
        const pole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.12, 0.15, 5, 6),
          new THREE.MeshStandardMaterial({ color: 0x445566, flatShading: true })
        );
        const r = 42 + (i % 2) * 4;
        pole.position.set(Math.cos(a) * r, 2.5, Math.sin(a) * r);
        this._addMesh(pole);
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), lampMat);
        lamp.position.set(Math.cos(a) * r, 5.2, Math.sin(a) * r);
        this._addMesh(lamp);
      }
    }

    const decor = cfg.decor;
    if (decor === 'buildings' || decor === 'stands') {
      const bMat = [
        new THREE.MeshStandardMaterial({ color: 0xff8899, flatShading: true }),
        new THREE.MeshStandardMaterial({ color: 0x88aaff, flatShading: true }),
        new THREE.MeshStandardMaterial({ color: 0xffcc66, flatShading: true }),
        new THREE.MeshStandardMaterial({ color: 0x66ddaa, flatShading: true }),
      ];
      const n = decor === 'stands' ? 18 : 20;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const h = decor === 'stands' ? 4 + (i % 4) * 1.8 : 5 + (i % 5) * 2.8;
        const bw = decor === 'stands' ? 5 : 3.5 + (i % 3);
        const b = new THREE.Mesh(new THREE.BoxGeometry(bw, h, 4), bMat[i % 4]);
        b.position.set(Math.cos(a) * 62, h / 2, Math.sin(a) * 62);
        b.castShadow = true;
        this._addMesh(b);
        // Window strip
        if (decor === 'buildings' && i % 2 === 0) {
          const win = new THREE.Mesh(
            new THREE.BoxGeometry(bw * 0.7, h * 0.5, 0.15),
            new THREE.MeshStandardMaterial({
              color: 0xffee88, emissive: 0xffcc44, emissiveIntensity: 0.5, flatShading: true,
            })
          );
          win.position.set(Math.cos(a) * 59.8, h * 0.45, Math.sin(a) * 59.8);
          win.lookAt(0, h * 0.45, 0);
          this._addMesh(win);
        }
      }
    }
    if (decor === 'cacti') {
      const cactus = new THREE.MeshStandardMaterial({ color: 0x3aaa4a, flatShading: true });
      const rock = new THREE.MeshStandardMaterial({ color: 0xc4a070, flatShading: true });
      for (let i = 0; i < 22; i++) {
        const a = (i / 22) * Math.PI * 2;
        const r = 46 + (i % 4) * 4;
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.48, 2.5 + (i % 4), 6), cactus);
        stem.position.set(Math.cos(a) * r, 1.4, Math.sin(a) * r);
        this._addMesh(stem);
        if (i % 3 === 0) {
          const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 1.2, 5), cactus);
          arm.rotation.z = Math.PI / 2;
          arm.position.set(Math.cos(a) * r + 0.7, 2.2, Math.sin(a) * r);
          this._addMesh(arm);
        }
        if (i % 2 === 0) {
          const rk = new THREE.Mesh(new THREE.DodecahedronGeometry(0.7 + (i % 3) * 0.3, 0), rock);
          rk.position.set(Math.cos(a + 0.08) * (r - 3), 0.5, Math.sin(a + 0.08) * (r - 3));
          this._addMesh(rk);
        }
      }
    }
    if (decor === 'pines' || decor === 'trees') {
      const trunk = new THREE.MeshStandardMaterial({ color: 0x6a4422, flatShading: true });
      const leaf = new THREE.MeshStandardMaterial({
        color: decor === 'pines' ? 0x2a6a3a : 0x3a8a4a,
        flatShading: true,
      });
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * Math.PI * 2;
        const r = 44 + (i % 5) * 3.2;
        const t = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 1.8, 5), trunk);
        t.position.set(Math.cos(a) * r, 0.9, Math.sin(a) * r);
        this._addMesh(t);
        if (decor === 'pines') {
          for (let k = 0; k < 3; k++) {
            const l = new THREE.Mesh(new THREE.ConeGeometry(1.5 - k * 0.3, 2.2, 6), leaf);
            l.position.set(Math.cos(a) * r, 2.2 + k * 1.3, Math.sin(a) * r);
            this._addMesh(l);
          }
        } else {
          const l = new THREE.Mesh(new THREE.SphereGeometry(1.5, 6, 5), leaf);
          l.position.set(Math.cos(a) * r, 2.8, Math.sin(a) * r);
          this._addMesh(l);
          const l2 = new THREE.Mesh(new THREE.SphereGeometry(1.1, 6, 5), leaf);
          l2.position.set(Math.cos(a) * r + 0.6, 2.4, Math.sin(a) * r - 0.3);
          this._addMesh(l2);
        }
      }
    }
    if (decor === 'pipes' || decor === 'cranes') {
      const metal = new THREE.MeshStandardMaterial({ color: 0x8899aa, flatShading: true, metalness: 0.45 });
      const rust = new THREE.MeshStandardMaterial({ color: 0xaa6644, flatShading: true, metalness: 0.3 });
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const h = 7 + (i % 5) * 2.5;
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, h, 8), i % 3 ? metal : rust);
        p.position.set(Math.cos(a) * 56, h / 2, Math.sin(a) * 56);
        this._addMesh(p);
        if (decor === 'cranes' || i % 2 === 0) {
          const arm = new THREE.Mesh(new THREE.BoxGeometry(11, 0.45, 0.45), metal);
          arm.position.set(Math.cos(a) * 56, h, Math.sin(a) * 56);
          arm.rotation.y = -a + (i % 2) * 0.4;
          this._addMesh(arm);
        }
      }
      // Cargo crates in distance
      const crate = new THREE.MeshStandardMaterial({ color: 0xcc7744, flatShading: true });
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.4;
        const box = new THREE.Mesh(new THREE.BoxGeometry(2.5, 2.2, 2.5), crate);
        box.position.set(Math.cos(a) * 48, 1.1, Math.sin(a) * 48);
        this._addMesh(box);
      }
    }
    if (decor === 'lava') {
      const rock = new THREE.MeshStandardMaterial({ color: 0x3a2018, flatShading: true });
      const glow = new THREE.MeshStandardMaterial({
        color: 0xff4400, emissive: 0xff2200, emissiveIntensity: 0.9, flatShading: true,
      });
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const h = 2.5 + (i % 4) * 1.8;
        const m = new THREE.Mesh(new THREE.ConeGeometry(2.2, h, 5), rock);
        m.position.set(Math.cos(a) * 54, h / 2, Math.sin(a) * 54);
        this._addMesh(m);
        if (i % 3 === 0) {
          const g = new THREE.Mesh(new THREE.SphereGeometry(0.8, 6, 5), glow);
          g.position.set(Math.cos(a) * 50, 0.6, Math.sin(a) * 50);
          this._addMesh(g);
        }
      }
    }

    const colors = [0xff4466, 0x44aaff, 0xffee44, 0x66ff99, 0xff88cc, 0xff9944];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.2;
      const bb = makeBillboard(5.5, 3.2, colors[i % colors.length]);
      bb.position.set(Math.cos(a) * 48, 4.2, Math.sin(a) * 48);
      bb.lookAt(0, 4.2, 0);
      this._addMesh(bb);
    }
  }

  _buildCheckpoints() {
    const pts = this.waypoints;
    const n = this.cfg.derby ? 4 : 8;
    for (let i = 0; i < n; i++) {
      const idx = Math.floor((i / n) * pts.length) % pts.length;
      const p = pts[idx];
      this.lapCheckpoints.push({
        index: i,
        angle: Math.atan2(p.z, p.x),
        x: p.x,
        z: p.z,
        wpIndex: idx,
      });
      if (i === 0 && !this.cfg.derby) {
        const postMat = new THREE.MeshStandardMaterial({
          color: 0xffe566,
          emissive: 0xffaa22,
          emissiveIntensity: 0.4,
          flatShading: true,
        });
        const n2 = pts[(idx + 1) % pts.length];
        const ang = Math.atan2(n2.x - p.x, n2.z - p.z);
        const nx = Math.cos(ang);
        const nz = -Math.sin(ang);
        for (const side of [-1, 1]) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4, 0.4), postMat);
          const ey = p.y || 0;
          post.position.set(p.x + nx * side * 6, ey + 2, p.z + nz * side * 6);
          this._addMesh(post);
        }
        const banner = new THREE.Mesh(
          new THREE.BoxGeometry(12, 0.8, 0.2),
          new THREE.MeshStandardMaterial({ color: 0xff3344, flatShading: true })
        );
        banner.position.set(p.x, (p.y || 0) + 4.2, p.z);
        banner.rotation.y = ang;
        this._addMesh(banner);
      }
    }
  }

  checkRamps(car) {
    if (!car.alive) return;
    const pos = car.position;
    for (const r of this.ramps) {
      const dx = pos.x - r.x;
      const dz = pos.z - r.z;
      if (dx * dx + dz * dz < 16) {
        const spd = car.body.velocity.length();
        if (spd > 8 && car.body.velocity.y < 5) {
          car.body.velocity.y += r.boost * 0.08;
          car.body.velocity.x += r.fx * 2;
          car.body.velocity.z += r.fz * 2;
        }
      }
    }
  }

  checkHazards(car, dt) {
    if (!car.alive) return;
    const pos = car.position;
    for (const h of this.hazards) {
      const dx = pos.x - h.x;
      const dz = pos.z - h.z;
      if (dx * dx + dz * dz < h.r * h.r) {
        if (h.type === 'oil') {
          car.body.angularVelocity.y += (Math.random() - 0.5) * 4 * dt;
          car.body.velocity.x *= 1 - 0.4 * dt;
          car.body.velocity.z *= 1 - 0.4 * dt;
        } else if (h.type === 'boost') {
          const fwd = car.forward;
          car.body.velocity.x += fwd.x * 22 * dt;
          car.body.velocity.z += fwd.z * 22 * dt;
          car.body.velocity.y += 1.2 * dt;
          if (car.boost < 100) car.boost = Math.min(100, car.boost + 32 * dt);
          car._onBoostPad = true;
        } else if (h.type === 'lava') {
          car.takeDamage(18 * dt, false);
        }
      }
    }
    // Ice grip from theme
    if (this.cfg.iceGrip && this.cfg.iceGrip < 1) {
      // slight extra slide handled in car via trackGrip
      car.trackGrip = this.cfg.iceGrip;
    } else {
      car.trackGrip = 1;
    }
  }

  getPointOnTrack(angle, radius) {
    // Find nearest waypoint by angle, or by progress
    const pts = this.waypoints;
    let best = pts[0];
    let bestD = Infinity;
    for (const p of pts) {
      const a = Math.atan2(p.z, p.x);
      let d = Math.abs(a - angle);
      while (d > Math.PI) d = Math.abs(d - Math.PI * 2);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    if (radius != null) {
      const len = Math.hypot(best.x, best.z) || 1;
      const s = radius / len;
      return { x: best.x * s, z: best.z * s, angle };
    }
    return { x: best.x, z: best.z, angle };
  }

  getWaypoint(index) {
    return this.waypoints[index % this.waypoints.length];
  }

  nearestWaypointIndex(x, z) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < this.waypoints.length; i++) {
      const p = this.waypoints[i];
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  getSpawn(index, total = 3) {
    const pts = this.waypoints;
    const startIdx = 0;
    const p = pts[startIdx];
    const n = pts[1];
    const fx = n.x - p.x;
    const fz = n.z - p.z;
    const len = Math.hypot(fx, fz) || 1;
    const fxx = fx / len;
    const fzz = fz / len;
    const rx = fzz;
    const rz = -fxx;
    const lane = (index - (total - 1) / 2) * 2.8;
    const back = index * 4.2;
    if (this.cfg.derby) {
      const a = (index / total) * Math.PI * 2;
      const r = Math.min(this.cfg.radiusX, this.cfg.radiusZ) * 0.45;
      return {
        px: Math.cos(a) * r,
        pz: Math.sin(a) * r,
        py: 1.0,
        facing: a + Math.PI,
      };
    }
    return {
      px: p.x - fxx * back + rx * lane,
      pz: p.z - fzz * back + rz * lane,
      py: (p.y || 0) + 1.0,
      facing: Math.atan2(fxx, fzz),
    };
  }
}
