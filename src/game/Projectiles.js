import * as THREE from 'three';
import { makeRocketMesh, makeMineMesh } from './meshes.js';

export class Projectiles {
  constructor(scene, particles) {
    this.scene = scene;
    this.particles = particles || null;
    this.list = [];
    this.mines = [];
    this._trailT = 0;
  }

  spawn(shot, targetCars) {
    if (shot.type === 'mine') {
      this._spawnMine(shot);
      return;
    }
    if (shot.type === 'shotgun') {
      this._spawnShotgun(shot, targetCars);
      return;
    }
    this._spawnRocket(shot, targetCars);
  }

  _spawnRocket(shot, targetCars) {
    const mesh = makeRocketMesh();
    mesh.position.set(shot.origin.x, shot.origin.y, shot.origin.z);
    const dir = new THREE.Vector3(shot.direction.x, 0, shot.direction.z).normalize();
    mesh.lookAt(mesh.position.clone().add(dir));
    this.scene.add(mesh);

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
      kind: 'rocket',
      mesh,
      pos: new THREE.Vector3(shot.origin.x, shot.origin.y, shot.origin.z),
      vel: dir.multiplyScalar(40),
      owner: shot.owner,
      target,
      life: 4,
      homing: 14,
      damage: 38,
      aoe: 5.5,
    });
  }

  _spawnShotgun(shot) {
    const base = new THREE.Vector3(shot.direction.x, 0, shot.direction.z).normalize();
    for (let i = -2; i <= 2; i++) {
      const ang = i * 0.14;
      const dir = base.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), ang);
      const mesh = makeRocketMesh();
      mesh.scale.setScalar(0.55);
      mesh.position.set(shot.origin.x, shot.origin.y, shot.origin.z);
      mesh.lookAt(mesh.position.clone().add(dir));
      this.scene.add(mesh);
      this.list.push({
        kind: 'pellet',
        mesh,
        pos: new THREE.Vector3(shot.origin.x, shot.origin.y, shot.origin.z),
        vel: dir.multiplyScalar(48),
        owner: shot.owner,
        target: null,
        life: 0.9,
        homing: 0,
        damage: 14,
        aoe: 2.2,
      });
    }
  }

  _spawnMine(shot) {
    const mesh = makeMineMesh();
    mesh.position.set(shot.origin.x, 0.35, shot.origin.z);
    this.scene.add(mesh);
    this.mines.push({
      mesh,
      x: shot.origin.x,
      z: shot.origin.z,
      owner: shot.owner,
      life: 25,
      arm: 0.6,
    });
  }

  _explodeAt(x, y, z, radius, damage, owner, cars, onHit, knock = 1) {
    if (this.particles) this.particles.explosion(x, y, z, 1.1);
    for (const c of cars) {
      if (!c.alive) continue;
      if (c === owner && damage > 20) continue; // mild friendly for rockets
      const dx = c.position.x - x;
      const dy = c.position.y - y;
      const dz = c.position.z - z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < radius * radius) {
        const falloff = 1 - Math.sqrt(d2) / radius;
        c.takeDamage(damage * falloff);
        const len = Math.sqrt(d2) || 1;
        c.body.velocity.x += (dx / len) * 10 * knock * falloff;
        c.body.velocity.z += (dz / len) * 10 * knock * falloff;
        c.body.velocity.y += 4 * falloff;
        if (onHit && c !== owner) onHit(c, owner);
      }
    }
  }

  update(dt, cars, onHit) {
    this._trailT -= dt;

    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;

      if (p.target && p.target.alive && p.homing > 0) {
        const to = new THREE.Vector3(
          p.target.position.x - p.pos.x,
          p.target.position.y + 0.4 - p.pos.y,
          p.target.position.z - p.pos.z
        ).normalize();
        p.vel.lerp(to.multiplyScalar(44), Math.min(1, p.homing * dt * 0.14));
      }

      p.pos.addScaledVector(p.vel, dt);
      p.mesh.position.copy(p.pos);
      p.mesh.lookAt(p.pos.clone().add(p.vel));

      if (this.particles && p.kind === 'rocket' && this._trailT <= 0) {
        this.particles.rocketTrail(p.pos.x, p.pos.y, p.pos.z);
      }

      let hit = false;
      for (const c of cars) {
        if (c === p.owner || !c.alive) continue;
        const dx = c.position.x - p.pos.x;
        const dy = c.position.y - p.pos.y;
        const dz = c.position.z - p.pos.z;
        if (dx * dx + dy * dy + dz * dz < 2.8) {
          this._explodeAt(p.pos.x, p.pos.y, p.pos.z, p.aoe, p.damage, p.owner, cars, onHit, 1.2);
          hit = true;
          break;
        }
      }

      if (p.pos.y < 0.15 || p.life <= 0 || hit || p.pos.length() > 65) {
        if (!hit && (p.pos.y < 0.15 || p.life <= 0)) {
          this._explodeAt(p.pos.x, Math.max(0.3, p.pos.y), p.pos.z, p.aoe * 0.85, p.damage * 0.7, p.owner, cars, onHit, 0.9);
        }
        this.scene.remove(p.mesh);
        this.list.splice(i, 1);
      }
    }

    if (this._trailT <= 0) this._trailT = 0.04;

    for (let i = this.mines.length - 1; i >= 0; i--) {
      const m = this.mines[i];
      m.life -= dt;
      m.arm -= dt;
      m.mesh.rotation.y += dt * 2;
      m.mesh.position.y = 0.35 + Math.sin(performance.now() * 0.008 + i) * 0.05;

      let boom = m.life <= 0;
      if (m.arm <= 0) {
        for (const c of cars) {
          if (!c.alive) continue;
          // Don't trigger on owner until armed longer
          if (c === m.owner && m.arm > -1.5) continue;
          const dx = c.position.x - m.x;
          const dz = c.position.z - m.z;
          if (dx * dx + dz * dz < 4.5) {
            boom = true;
            break;
          }
        }
      }
      if (boom) {
        this._explodeAt(m.x, 0.5, m.z, 6, 42, m.owner, cars, onHit, 1.4);
        this.scene.remove(m.mesh);
        this.mines.splice(i, 1);
      }
    }
  }
}
