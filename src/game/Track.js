import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { makeBillboard } from './meshes.js';
import { getTrack } from './data/tracks.js';

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
    this._buildRoad();
    this._buildWalls();
    this._buildRamps();
    if (this.cfg.shortcut && !this.cfg.derby) this._buildShortcut();
    this._buildHazards();
    this._buildDecor();
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
    const n = cfg.derby ? 24 : 48;
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
        const wobble = 1 + 0.12 * Math.sin(t * 3);
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
      // oval / ellipse
      for (let i = 0; i < n; i++) {
        const t = (i / n) * Math.PI * 2 - Math.PI / 2;
        pts.push({ x: Math.cos(t) * rx, z: Math.sin(t) * rz, t });
      }
    }

    this.waypoints = pts;
    this.centerLine = pts;
    // Approximate radii for AI boundary helpers
    this.innerR = Math.min(rx, rz) - cfg.width * 0.45;
    this.outerR = Math.max(rx, rz) + cfg.width * 0.55;
  }

  _buildSky() {
    const cfg = this.cfg;
    const geo = new THREE.SphereGeometry(160, 24, 12);
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

  _buildRoad() {
    const cfg = this.cfg;
    const w = cfg.width;
    const asphaltMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(cfg.asphalt),
      roughness: 0.88,
      flatShading: true,
    });
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0xffe566, flatShading: true });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true });

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
      return;
    }

    // Road as overlapping boxes along centerline
    const pts = this.waypoints;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz) + 0.4;
      const ang = Math.atan2(dx, dz);
      const midX = (a.x + b.x) / 2;
      const midZ = (a.z + b.z) / 2;
      const seg = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, len), asphaltMat);
      seg.position.set(midX, 0.03, midZ);
      seg.rotation.y = ang;
      seg.receiveShadow = true;
      this._addMesh(seg);

      if (i % 2 === 0) {
        const s = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, Math.min(2.2, len * 0.6)), stripeMat);
        s.position.set(midX, 0.06, midZ);
        s.rotation.y = ang;
        this._addMesh(s);
      }
      if (i % 3 === 0) {
        for (const side of [-1, 1]) {
          const e = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.04, len * 0.9), whiteMat);
          const nx = Math.cos(ang);
          const nz = -Math.sin(ang);
          e.position.set(midX + nx * side * (w * 0.48), 0.055, midZ + nz * side * (w * 0.48));
          e.rotation.y = ang;
          this._addMesh(e);
        }
      }
    }

    // Red/white curbs sample
    const curbA = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true });
    const curbB = new THREE.MeshStandardMaterial({ color: 0xff3344, flatShading: true });
    for (let i = 0; i < pts.length; i += 2) {
      const p = pts[i];
      const n = pts[(i + 1) % pts.length];
      const ang = Math.atan2(n.x - p.x, n.z - p.z);
      const nx = Math.cos(ang);
      const nz = -Math.sin(ang);
      for (const side of [-1, 1]) {
        const c = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.32, 1.2), i % 4 === 0 ? curbA : curbB);
        c.position.set(p.x + nx * side * (w * 0.52), 0.16, p.z + nz * side * (w * 0.52));
        c.rotation.y = ang;
        this._addMesh(c);
      }
    }
  }

  _buildWalls() {
    const cfg = this.cfg;
    const wallMat = new THREE.MeshStandardMaterial({ color: cfg.wallA, roughness: 0.7, flatShading: true });
    const wallMat2 = new THREE.MeshStandardMaterial({ color: cfg.wallB, roughness: 0.7, flatShading: true });
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
        const body = new CANNON.Body({ mass: 0 });
        body.addShape(new CANNON.Box(new CANNON.Vec3(len / 2, h / 2, 0.6)));
        body.position.set(mesh.position.x, h / 2, mesh.position.z);
        body.quaternion.setFromEuler(0, -mid, 0);
        this._addBody(body);
      }
      return;
    }

    // Outer + inner walls along centerline offset
    for (let side of [-1, 1]) {
      for (let i = 0; i < pts.length; i++) {
        // Gap for shortcut on inner wall
        if (side === -1 && cfg.shortcut && i > pts.length * 0.45 && i < pts.length * 0.55) continue;
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const len = Math.hypot(dx, dz) * 1.08;
        const ang = Math.atan2(dx, dz);
        const nx = Math.cos(ang);
        const nz = -Math.sin(ang);
        const midX = (a.x + b.x) / 2 + nx * side * halfW;
        const midZ = (a.z + b.z) / 2 + nz * side * halfW;
        const bankH = 2.6 + (cfg.banks ? Math.abs(Math.sin(i * 0.3)) * 1.3 : 0);
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(1.1, bankH, len),
          (i + (side > 0 ? 0 : 1)) % 2 ? wallMat : wallMat2
        );
        mesh.position.set(midX, bankH / 2, midZ);
        mesh.rotation.y = ang;
        mesh.castShadow = true;
        this._addMesh(mesh);
        const body = new CANNON.Body({ mass: 0 });
        body.addShape(new CANNON.Box(new CANNON.Vec3(0.55, bankH / 2, len / 2)));
        body.position.set(midX, bankH / 2, midZ);
        body.quaternion.setFromEuler(0, ang, 0);
        this._addBody(body);
      }
    }

    // Inner island fill for non-figure8
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
    const rampMat = new THREE.MeshStandardMaterial({ color: 0xff9944, roughness: 0.65, flatShading: true });
    const stripe = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true });
    const pts = this.waypoints;
    for (let r = 0; r < count; r++) {
      const idx = Math.floor(((r + 0.5) / count) * pts.length) % pts.length;
      const p = pts[idx];
      const n = pts[(idx + 1) % pts.length];
      const ang = Math.atan2(n.x - p.x, n.z - p.z);
      const fx = Math.sin(ang);
      const fz = Math.cos(ang);
      const group = new THREE.Group();
      const ramp = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.35, 5.5), rampMat);
      ramp.rotation.x = -0.28;
      ramp.position.y = 0.55;
      group.add(ramp);
      const sm = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.36, 5), stripe);
      sm.rotation.x = -0.28;
      sm.position.y = 0.58;
      group.add(sm);
      group.position.set(p.x, 0, p.z);
      group.rotation.y = ang;
      this._addMesh(group);
      const body = new CANNON.Body({ mass: 0 });
      body.addShape(new CANNON.Box(new CANNON.Vec3(2.1, 0.2, 2.75)));
      body.position.set(p.x, 0.7, p.z);
      body.quaternion.setFromEuler(-0.28, ang, 0);
      this._addBody(body);
      this.ramps.push({ x: p.x, z: p.z, fx, fz, boost: 14 });
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
      pad.position.set(p.x, 0.06, p.z);
      pad.rotation.y = ang;
      this._addMesh(pad);
      this.hazards.push({ type: 'boost', x: p.x, z: p.z, r: 2.2, ang });
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
      oil.position.set(ox, 0.05, oz);
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
      color: cfg.theme === 'volcano' ? 0x554444 : 0xffffff,
      roughness: 1,
      flatShading: true,
      transparent: true,
      opacity: 0.9,
    });
    for (let i = 0; i < 8; i++) {
      const cloud = new THREE.Group();
      for (let j = 0; j < 3; j++) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(3 + Math.random() * 2, 1.2, 2), cloudMat);
        p.position.set(j * 2 - 2, Math.random() * 0.5, (Math.random() - 0.5) * 1.5);
        cloud.add(p);
      }
      const a = (i / 8) * Math.PI * 2;
      cloud.position.set(Math.cos(a) * 55, 14 + Math.random() * 8, Math.sin(a) * 55);
      this._addMesh(cloud);
    }

    const decor = cfg.decor;
    if (decor === 'buildings' || decor === 'stands') {
      const bMat = [
        new THREE.MeshStandardMaterial({ color: 0xff8899, flatShading: true }),
        new THREE.MeshStandardMaterial({ color: 0x88aaff, flatShading: true }),
        new THREE.MeshStandardMaterial({ color: 0xffcc66, flatShading: true }),
      ];
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const h = decor === 'stands' ? 4 + (i % 3) * 2 : 6 + (i % 4) * 3;
        const b = new THREE.Mesh(new THREE.BoxGeometry(4, h, 4), bMat[i % 3]);
        b.position.set(Math.cos(a) * 62, h / 2, Math.sin(a) * 62);
        this._addMesh(b);
      }
    }
    if (decor === 'cacti') {
      const cactus = new THREE.MeshStandardMaterial({ color: 0x3aaa4a, flatShading: true });
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const r = 48 + (i % 3) * 4;
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 3 + (i % 3), 6), cactus);
        stem.position.set(Math.cos(a) * r, 1.5, Math.sin(a) * r);
        this._addMesh(stem);
      }
    }
    if (decor === 'pines' || decor === 'trees') {
      const trunk = new THREE.MeshStandardMaterial({ color: 0x6a4422, flatShading: true });
      const leaf = new THREE.MeshStandardMaterial({
        color: decor === 'pines' ? 0x2a6a3a : 0x3a8a4a,
        flatShading: true,
      });
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2;
        const r = 46 + (i % 4) * 3;
        const t = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 2, 5), trunk);
        t.position.set(Math.cos(a) * r, 1, Math.sin(a) * r);
        const l = new THREE.Mesh(new THREE.ConeGeometry(1.6, 3.5, 6), leaf);
        l.position.set(Math.cos(a) * r, 3.2, Math.sin(a) * r);
        this._addMesh(t);
        this._addMesh(l);
      }
    }
    if (decor === 'pipes' || decor === 'cranes') {
      const metal = new THREE.MeshStandardMaterial({ color: 0x8899aa, flatShading: true, metalness: 0.4 });
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const h = 8 + (i % 4) * 3;
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, h, 8), metal);
        p.position.set(Math.cos(a) * 58, h / 2, Math.sin(a) * 58);
        this._addMesh(p);
        if (decor === 'cranes') {
          const arm = new THREE.Mesh(new THREE.BoxGeometry(10, 0.5, 0.5), metal);
          arm.position.set(Math.cos(a) * 58, h, Math.sin(a) * 58);
          arm.rotation.y = -a;
          this._addMesh(arm);
        }
      }
    }
    if (decor === 'lava') {
      const rock = new THREE.MeshStandardMaterial({ color: 0x3a2018, flatShading: true });
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const h = 3 + (i % 3) * 2;
        const m = new THREE.Mesh(new THREE.ConeGeometry(2.5, h, 5), rock);
        m.position.set(Math.cos(a) * 55, h / 2, Math.sin(a) * 55);
        this._addMesh(m);
      }
    }

    const colors = [0xff4466, 0x44aaff, 0xffee44, 0x66ff99, 0xff88cc];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.2;
      const bb = makeBillboard(5, 3, colors[i % colors.length]);
      bb.position.set(Math.cos(a) * 50, 4, Math.sin(a) * 50);
      bb.lookAt(0, 4, 0);
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
          post.position.set(p.x + nx * side * 6, 2, p.z + nz * side * 6);
          this._addMesh(post);
        }
        const banner = new THREE.Mesh(
          new THREE.BoxGeometry(12, 0.8, 0.2),
          new THREE.MeshStandardMaterial({ color: 0xff3344, flatShading: true })
        );
        banner.position.set(p.x, 4.2, p.z);
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
          car.body.velocity.x += fwd.x * 18 * dt;
          car.body.velocity.z += fwd.z * 18 * dt;
          if (car.boost < 100) car.boost = Math.min(100, car.boost + 25 * dt);
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
        facing: a + Math.PI,
      };
    }
    return {
      px: p.x - fxx * back + rx * lane,
      pz: p.z - fzz * back + rz * lane,
      facing: Math.atan2(fxx, fzz),
    };
  }
}
