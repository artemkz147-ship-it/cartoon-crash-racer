import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {
  makeCrateMesh,
  makeBarrelMesh,
  makeBarrierMesh,
  makeWallBreakableMesh,
  makeDebrisPiece,
} from './meshes.js';

export class DestructibleProps {
  constructor(scene, world, particles, track) {
    this.scene = scene;
    this.world = world;
    this.particles = particles || null;
    this.track = track;
    this.items = [];
    this.debris = [];
    this.destructionScore = 0;
    this.onExplode = null;
    this._spawnAll();
  }

  dispose() {
    for (const item of this.items) {
      if (item.alive) {
        this.scene.remove(item.mesh);
        this.world.removeBody(item.body);
      }
    }
    for (const d of this.debris) {
      this.scene.remove(d.mesh);
      this.world.removeBody(d.body);
    }
    this.items = [];
    this.debris = [];
  }

  _spawnAll() {
    const cfg = this.track.cfg;
    const density = cfg.propDensity || 1;
    const pts = this.track.waypoints;
    const w = cfg.width || 11;
    const spots = [];

    const crateN = Math.floor(22 * density);
    for (let i = 0; i < crateN; i++) {
      const idx = Math.floor((i / crateN) * pts.length) % pts.length;
      const p = pts[idx];
      const n = pts[(idx + 1) % pts.length];
      const ang = Math.atan2(n.x - p.x, n.z - p.z);
      const nx = Math.cos(ang);
      const nz = -Math.sin(ang);
      const side = i % 2 ? 1 : -1;
      const along = ((i % 5) - 2) * 0.8;
      spots.push({
        type: 'crate',
        x: p.x + nx * side * (w * 0.32) + Math.sin(ang) * along,
        z: p.z + nz * side * (w * 0.32) + Math.cos(ang) * along,
      });
    }

    const barrelN = Math.floor((cfg.barrelsExtra ? 26 : 18) * density);
    for (let i = 0; i < barrelN; i++) {
      const idx = Math.floor(((i + 0.5) / barrelN) * pts.length) % pts.length;
      const p = pts[idx];
      const n = pts[(idx + 1) % pts.length];
      const ang = Math.atan2(n.x - p.x, n.z - p.z);
      const nx = Math.cos(ang);
      const nz = -Math.sin(ang);
      const side = i % 2 ? -1 : 1;
      spots.push({
        type: 'barrel',
        explosive: true,
        x: p.x + nx * side * (w * 0.28),
        z: p.z + nz * side * (w * 0.28),
      });
    }

    const barN = Math.floor(12 * density);
    for (let i = 0; i < barN; i++) {
      const idx = Math.floor(((i + 0.25) / barN) * pts.length) % pts.length;
      const p = pts[idx];
      const n = pts[(idx + 1) % pts.length];
      const ang = Math.atan2(n.x - p.x, n.z - p.z);
      spots.push({ type: 'barrier', x: p.x, z: p.z, yaw: ang + Math.PI / 2 });
    }

    // Piles in corners / center-ish
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.3;
      const r = cfg.derby ? 8 : 22;
      for (let j = 0; j < 3; j++) {
        spots.push({
          type: j === 1 ? 'barrel' : 'crate',
          explosive: j === 1,
          x: Math.cos(a) * r + (j - 1) * 1.3,
          z: Math.sin(a) * r + ((j % 2) - 0.5) * 1.2,
        });
      }
    }

    if (cfg.shortcut) {
      const mid = pts[Math.floor(pts.length * 0.5)];
      spots.push({ type: 'wall', x: mid.x * 0.55, z: mid.z * 0.55 + 3, yaw: 0.3 });
      spots.push({ type: 'wall', x: mid.x * 0.55, z: mid.z * 0.55 - 3, yaw: -0.3 });
    }

    for (const s of spots) this._addProp(s);
  }

  _addProp(s) {
    let mesh, half, mass, color, hp;
    if (s.type === 'crate') {
      mesh = makeCrateMesh();
      half = new CANNON.Vec3(0.62, 0.62, 0.62);
      mass = 28; color = 0xc48a3a; hp = 28;
    } else if (s.type === 'barrel') {
      mesh = makeBarrelMesh(s.explosive !== false);
      half = new CANNON.Vec3(0.48, 0.58, 0.48);
      mass = 22; color = 0xd4452a; hp = 18;
    } else if (s.type === 'wall') {
      mesh = makeWallBreakableMesh();
      half = new CANNON.Vec3(1.6, 1.0, 0.3);
      mass = 55; color = 0x8899aa; hp = 55;
    } else {
      mesh = makeBarrierMesh();
      half = new CANNON.Vec3(1.15, 0.48, 0.3);
      mass = 42; color = 0xff8c1a; hp = 48;
    }
    mesh.position.set(s.x, half.y + 0.05, s.z);
    if (s.yaw != null) mesh.rotation.y = s.yaw;
    this.scene.add(mesh);

    const body = new CANNON.Body({
      mass,
      shape: new CANNON.Box(half),
      linearDamping: 0.35,
      angularDamping: 0.35,
    });
    body.position.set(s.x, half.y + 0.05, s.z);
    if (s.yaw != null) body.quaternion.setFromEuler(0, s.yaw, 0);
    body.userData = { prop: true };
    this.world.addBody(body);

    const item = {
      type: s.type,
      mesh,
      body,
      hp,
      color,
      alive: true,
      explosive: s.type === 'barrel' && s.explosive !== false,
    };
    body.userData.item = item;
    this.items.push(item);
  }

  damageProp(item, amount, impactVel, fromChain = false) {
    if (!item || !item.alive) return;
    item.hp -= amount;
    if (item.hp <= 0) this._shatter(item, impactVel, fromChain);
  }

  _shatter(item, impactVel, fromChain = false) {
    item.alive = false;
    this.scene.remove(item.mesh);
    this.world.removeBody(item.body);

    const origin = item.body.position;
    const points = item.type === 'wall' ? 12 : item.type === 'barrier' ? 8 : item.explosive ? 15 : 5;
    this.destructionScore += points;

    if (this.particles) {
      this.particles.explosion(origin.x, origin.y + 0.4, origin.z, item.explosive ? 1.8 : item.type === 'wall' ? 1.3 : 0.9);
      this.particles.sparks(origin.x, origin.y + 0.3, origin.z, item.explosive ? 22 : 12);
      if (item.explosive) this.particles.shockwave(origin.x, origin.z, 1.4);
    }

    if (item.explosive) {
      this._chainExplode(origin.x, origin.y, origin.z, fromChain ? 9 : 14);
      if (this.onExplode) this.onExplode(origin.x, origin.y, origin.z, 16);
    }

    const count = item.type === 'wall' ? 14 : item.explosive ? 16 : 9;
    const room = Math.max(0, 64 - this.debris.length);
    const n = Math.min(count, room);
    for (let i = 0; i < n; i++) {
      const pieceSize = 0.3 + Math.random() * 0.45;
      const piece = makeDebrisPiece(item.color, pieceSize);
      piece.position.set(origin.x, origin.y + 0.3, origin.z);
      this.scene.add(piece);
      const size = pieceSize * 0.4;
      const body = new CANNON.Body({
        mass: 2.5,
        shape: new CANNON.Box(new CANNON.Vec3(size, size, size)),
        linearDamping: 0.12,
        angularDamping: 0.1,
      });
      body.position.set(
        origin.x + (Math.random() - 0.5),
        origin.y + 0.5 + Math.random() * 0.6,
        origin.z + (Math.random() - 0.5)
      );
      const force = impactVel || { x: 0, y: 6, z: 0 };
      body.velocity.set(
        force.x * 0.4 + (Math.random() - 0.5) * (item.explosive ? 18 : 12),
        6 + Math.random() * (item.explosive ? 14 : 9),
        force.z * 0.4 + (Math.random() - 0.5) * (item.explosive ? 18 : 12)
      );
      body.angularVelocity.set((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16);
      this.world.addBody(body);
      this.debris.push({ mesh: piece, body, life: 3.0 + Math.random() * 1.2 });
    }
  }

  _chainExplode(x, y, z, radius) {
    const r2 = radius * radius;
    for (const other of this.items) {
      if (!other.alive || !other.explosive) continue;
      const dx = other.body.position.x - x;
      const dy = other.body.position.y - y;
      const dz = other.body.position.z - z;
      if (dx * dx + dy * dy + dz * dz < r2) {
        // Delayed-feel: damage enough to shatter
        this.damageProp(other, 100, { x: dx * 2, y: 10, z: dz * 2 }, true);
      }
    }
  }

  /** AoE damage to cars from barrel blast — called by Game via onExplode */
  blastDamageCars(cars, x, y, z, radius) {
    const r2 = radius * radius;
    for (const car of cars) {
      if (!car.alive) continue;
      const dx = car.position.x - x;
      const dz = car.position.z - z;
      const d2 = dx * dx + dz * dz;
      if (d2 < r2) {
        const falloff = 1 - Math.sqrt(d2) / radius;
        car.takeDamage(32 * falloff, true);
        const len = Math.sqrt(d2) || 1;
        car.body.velocity.x += (dx / len) * 14 * falloff;
        car.body.velocity.z += (dz / len) * 14 * falloff;
        car.body.velocity.y += 7.5 * falloff;
      }
    }
  }

  update(dt) {
    for (const item of this.items) {
      if (!item.alive) continue;
      item.mesh.position.copy(item.body.position);
      item.mesh.quaternion.copy(item.body.quaternion);
      if (item.body.position.y > 7 || item.body.velocity.length() > 28) {
        this.damageProp(item, 100, item.body.velocity);
      }
    }
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.life -= dt;
      d.mesh.position.copy(d.body.position);
      d.mesh.quaternion.copy(d.body.quaternion);
      if (d.life <= 0) {
        this.scene.remove(d.mesh);
        this.world.removeBody(d.body);
        this.debris.splice(i, 1);
      } else if (d.life < 0.4) {
        d.mesh.traverse((c) => {
          if (c.material) {
            c.material.transparent = true;
            c.material.opacity = d.life / 0.4;
          }
        });
      }
    }
  }

  findByBody(body) {
    return body?.userData?.item || null;
  }
}
