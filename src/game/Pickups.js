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
    mesh.position.set(x, 1.1, z);
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

      item.phase += dt * 2;
      item.mesh.position.y = 1.1 + Math.sin(item.phase) * 0.25;
      item.mesh.rotation.y += dt * 1.8;
      if (item.mesh.userData.inner) {
        item.mesh.userData.inner.rotation.x += dt * 2.5;
      }

      for (const car of cars) {
        if (!car.alive) continue;
        const dx = car.position.x - item.x;
        const dz = car.position.z - item.z;
        if (dx * dx + dz * dz < 2.8) {
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
