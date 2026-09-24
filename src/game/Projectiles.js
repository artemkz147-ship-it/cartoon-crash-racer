import * as THREE from 'three';
import { makeRocketMesh } from './meshes.js';

export class Projectiles {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
  }

  spawn(shot, targetCars) {
    const mesh = makeRocketMesh();
    mesh.position.set(shot.origin.x, shot.origin.y, shot.origin.z);
    const dir = new THREE.Vector3(shot.direction.x, 0, shot.direction.z).normalize();
    mesh.lookAt(mesh.position.clone().add(dir));
    this.scene.add(mesh);

    // Prefer nearest enemy ahead / overall nearest
    let target = null;
    let best = Infinity;
    for (const c of targetCars) {
      if (c === shot.owner || !c.alive) continue;
      const dx = c.position.x - shot.origin.x;
      const dz = c.position.z - shot.origin.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < best) {
        best = d2;
        target = c;
      }
    }

    this.list.push({
      mesh,
      pos: new THREE.Vector3(shot.origin.x, shot.origin.y, shot.origin.z),
      vel: dir.multiplyScalar(38),
      owner: shot.owner,
      target,
      life: 4,
      homing: 12,
    });
  }

  update(dt, cars, onHit) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;

      if (p.target && p.target.alive) {
        const to = new THREE.Vector3(
          p.target.position.x - p.pos.x,
          p.target.position.y + 0.4 - p.pos.y,
          p.target.position.z - p.pos.z
        ).normalize();
        p.vel.lerp(to.multiplyScalar(42), Math.min(1, p.homing * dt * 0.15));
      }

      p.pos.addScaledVector(p.vel, dt);
      p.mesh.position.copy(p.pos);
      p.mesh.lookAt(p.pos.clone().add(p.vel));

      let hit = false;
      for (const c of cars) {
        if (c === p.owner || !c.alive) continue;
        const dx = c.position.x - p.pos.x;
        const dy = c.position.y - p.pos.y;
        const dz = c.position.z - p.pos.z;
        if (dx * dx + dy * dy + dz * dz < 2.5) {
          c.takeDamage(35);
          // knockback
          c.body.velocity.x += p.vel.x * 0.15;
          c.body.velocity.z += p.vel.z * 0.15;
          c.body.velocity.y += 3;
          if (onHit) onHit(c, p.owner);
          hit = true;
          break;
        }
      }

      // Ground / out of bounds
      if (p.pos.y < 0.2 || p.life <= 0 || hit || p.pos.length() > 60) {
        this.scene.remove(p.mesh);
        this.list.splice(i, 1);
      }
    }
  }
}
