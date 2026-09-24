import * as THREE from 'three';
import { makePickupMesh } from './meshes.js';

const TYPES = ['weapon', 'armor', 'boost'];

export class Pickups {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this._spawn();
  }

  _spawn() {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const r = i % 2 === 0 ? 26 : 30;
      const type = TYPES[i % TYPES.length];
      this._add(type, Math.cos(a) * r, Math.sin(a) * r);
    }
  }

  _add(type, x, z) {
    const mesh = makePickupMesh(type);
    mesh.position.set(x, 1.35, z);
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

      item.phase += dt * 2.6;
      item.mesh.position.y = 1.35 + Math.sin(item.phase) * 0.4;
      item.mesh.rotation.y += dt * 2.4;
      if (item.mesh.userData.inner) {
        item.mesh.userData.inner.rotation.x += dt * 3.2;
      }
      if (item.mesh.userData.glow) {
        const s = 1 + 0.15 * Math.sin(item.phase * 2);
        item.mesh.userData.glow.scale.setScalar(s);
      }
      if (item.mesh.userData.ring) {
        item.mesh.userData.ring.rotation.z += dt * 1.5;
      }

      for (const car of cars) {
        if (!car.alive) continue;
        const dx = car.position.x - item.x;
        const dz = car.position.z - item.z;
        if (dx * dx + dz * dz < 3.6) {
          car.givePickup(item.type);
          item.alive = false;
          item.mesh.visible = false;
          item.respawn = 8;
          if (onPickup) onPickup(car, item.type);
          break;
        }
      }
    }
  }
}
