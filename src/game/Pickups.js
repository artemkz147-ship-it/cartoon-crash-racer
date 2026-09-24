import { makePickupMesh } from './meshes.js';

const TYPES = ['weapon', 'weapon2', 'armor', 'boost'];

export class Pickups {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this._spawn();
  }

  _spawn() {
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const r = i % 3 === 0 ? 24 : i % 3 === 1 ? 28 : 33;
      const type = TYPES[i % TYPES.length];
      this._add(type, Math.cos(a) * r, Math.sin(a) * r);
    }
    // Shortcut pickups
    this._add('boost', -8, 0);
    this._add('weapon2', -10, 2);
  }

  _add(type, x, z) {
    const mesh = makePickupMesh(type);
    mesh.position.set(x, 1.4, z);
    this.scene.add(mesh);
    this.items.push({
      type,
      mesh,
      x,
      z,
      alive: true,
      respawn: 0,
      phase: Math.random() * Math.PI * 2,
    });
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
      if (ud.ring2) {
        ud.ring2.rotation.y += dt * 2.2;
        ud.ring2.rotation.z -= dt * 1.4;
      }
      if (ud.icon) {
        ud.icon.position.y = 1.5 + Math.sin(item.phase * 1.5) * 0.15;
        ud.icon.rotation.y += dt * 4;
      }

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
          break;
        }
      }
    }
  }

  /** Nearest alive pickup for AI. */
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
