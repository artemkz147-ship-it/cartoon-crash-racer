import { makePickupMesh } from './meshes.js';

const TYPES = ['weapon', 'weapon2', 'armor', 'boost'];

export class Pickups {
  constructor(scene, track) {
    this.scene = scene;
    this.track = track;
    this.items = [];
    this._spawn();
  }

  dispose() {
    for (const item of this.items) this.scene.remove(item.mesh);
    this.items = [];
  }

  _spawn() {
    const cfg = this.track?.cfg;
    const count = cfg?.pickupCount || 12;
    const pts = this.track?.waypoints || [];
    if (!pts.length) {
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        const r = 24 + (i % 3) * 4;
        this._add(TYPES[i % TYPES.length], Math.cos(a) * r, Math.sin(a) * r);
      }
      return;
    }
    for (let i = 0; i < count; i++) {
      const idx = Math.floor((i / count) * pts.length) % pts.length;
      const p = pts[idx];
      const n = pts[(idx + 1) % pts.length];
      const ang = Math.atan2(n.x - p.x, n.z - p.z);
      const side = i % 2 ? 1 : -1;
      const nx = Math.cos(ang);
      const nz = -Math.sin(ang);
      this._add(
        TYPES[i % TYPES.length],
        p.x + nx * side * 2.5,
        p.z + nz * side * 2.5
      );
    }
    if (cfg?.shortcut) {
      const mid = pts[Math.floor(pts.length * 0.5)];
      this._add('boost', mid.x * 0.4, mid.z * 0.4);
      this._add('weapon2', mid.x * 0.35, mid.z * 0.35 + 2);
    }
  }

  _add(type, x, z) {
    const mesh = makePickupMesh(type);
    mesh.position.set(x, 1.4, z);
    this.scene.add(mesh);
    this.items.push({ type, mesh, x, z, alive: true, respawn: 0, phase: Math.random() * Math.PI * 2 });
  }

  update(dt, cars, onPickup) {
    for (const item of this.items) {
      if (!item.alive) {
        item.respawn -= dt;
        if (item.respawn <= 0) {
          item.alive = true;
          item.mesh.visible = true;
        }
        continue;
      }
      item.phase += dt * 2.8;
      item.mesh.position.y = 1.4 + Math.sin(item.phase) * 0.45;
      item.mesh.rotation.y += dt * 2.6;
      const ud = item.mesh.userData;
      if (ud.inner) {
        ud.inner.rotation.x += dt * 3.5;
        ud.inner.rotation.z += dt * 1.2;
      }
      if (ud.glow) {
        const s = 1 + 0.2 * Math.sin(item.phase * 2.2);
        ud.glow.scale.setScalar(s);
      }
      if (ud.ring) ud.ring.rotation.z += dt * 1.8;

      for (const car of cars) {
        if (!car.alive) continue;
        const dx = car.position.x - item.x;
        const dz = car.position.z - item.z;
        if (dx * dx + dz * dz < 4.0) {
          car.givePickup(item.type);
          item.alive = false;
          item.mesh.visible = false;
          item.respawn = 7;
          if (onPickup) onPickup(car, item.type);
        }
      }
    }
  }

  nearest(x, z) {
    let best = null;
    let bestD = Infinity;
    for (const item of this.items) {
      if (!item.alive) continue;
      const d = (item.x - x) ** 2 + (item.z - z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = item;
      }
    }
    return best;
  }
}
