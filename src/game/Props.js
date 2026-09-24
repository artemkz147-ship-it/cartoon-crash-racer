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
  constructor(scene, world, particles) {
    this.scene = scene;
    this.world = world;
    this.particles = particles || null;
    this.items = [];
    this.debris = [];
    this._spawnAll();
  }

  _spawnAll() {
    const spots = [];
    // Dense clusters for FlatOut feel
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2 + 0.15;
      spots.push({ type: 'crate', x: Math.cos(a) * 20.5, z: Math.sin(a) * 20.5 });
      spots.push({ type: 'crate', x: Math.cos(a + 0.08) * 35.5, z: Math.sin(a + 0.08) * 35.5 });
    }
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + 0.35;
      spots.push({ type: 'barrel', x: Math.cos(a) * 23.5, z: Math.sin(a) * 23.5 });
      spots.push({ type: 'barrel', x: Math.cos(a) * 33, z: Math.sin(a) * 33 });
    }
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.12;
      spots.push({ type: 'barrier', x: Math.cos(a) * 21.5, z: Math.sin(a) * 21.5, yaw: -a });
    }
    // Prop piles in corners
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      for (let j = 0; j < 4; j++) {
        spots.push({
          type: j % 2 ? 'crate' : 'barrel',
          x: Math.cos(a) * 30 + (j - 1.5) * 1.4,
          z: Math.sin(a) * 30 + ((j % 3) - 1) * 1.2,
        });
      }
    }
    // Breakable shortcut walls
    spots.push({ type: 'wall', x: -13.5, z: 3.5, yaw: 0.3 });
    spots.push({ type: 'wall', x: -13.5, z: -3.5, yaw: -0.3 });
    spots.push({ type: 'wall', x: 30, z: 8, yaw: 1.2 });

    for (const s of spots) this._addProp(s);
  }

  _addProp(s) {
    let mesh;
    let half;
    let mass;
    let color;
    let hp;
    if (s.type === 'crate') {
      mesh = makeCrateMesh();
      half = new CANNON.Vec3(0.62, 0.62, 0.62);
      mass = 28;
      color = 0xc48a3a;
      hp = 28;
    } else if (s.type === 'barrel') {
      mesh = makeBarrelMesh();
      half = new CANNON.Vec3(0.48, 0.58, 0.48);
      mass = 22;
      color = 0xd4452a;
      hp = 22;
    } else if (s.type === 'wall') {
      mesh = makeWallBreakableMesh();
      half = new CANNON.Vec3(1.6, 1.0, 0.3);
      mass = 55;
      color = 0x8899aa;
      hp = 55;
    } else {
      mesh = makeBarrierMesh();
      half = new CANNON.Vec3(1.15, 0.48, 0.3);
      mass = 42;
      color = 0xff8c1a;
      hp = 48;
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

    const item = { type: s.type, mesh, body, hp, color, alive: true };
    body.userData.item = item;
    this.items.push(item);
  }

  damageProp(item, amount, impactVel) {
    if (!item || !item.alive) return;
    item.hp -= amount;
    if (item.hp <= 0) this._shatter(item, impactVel);
  }

  _shatter(item, impactVel) {
    item.alive = false;
    this.scene.remove(item.mesh);
    this.world.removeBody(item.body);

    const origin = item.body.position;
    if (this.particles) {
      this.particles.explosion(origin.x, origin.y + 0.4, origin.z, item.type === 'wall' ? 1.2 : 0.8);
      this.particles.sparks(origin.x, origin.y + 0.3, origin.z, 10);
    }

    const count = item.type === 'wall' ? 14 : item.type === 'barrier' ? 12 : 10;
    // Cap live debris for mobile
    const room = Math.max(0, 60 - this.debris.length);
    const n = Math.min(count, room);
    for (let i = 0; i < n; i++) {
      const pieceSize = 0.35 + Math.random() * 0.5;
      const piece = makeDebrisPiece(item.color, pieceSize);
      piece.position.set(origin.x, origin.y + 0.3, origin.z);
      this.scene.add(piece);

      const size = pieceSize * 0.4;
      const body = new CANNON.Body({
        mass: 2.8,
        shape: new CANNON.Box(new CANNON.Vec3(size, size, size)),
        linearDamping: 0.12,
        angularDamping: 0.1,
      });
      body.position.set(
        origin.x + (Math.random() - 0.5) * 1.0,
        origin.y + 0.5 + Math.random() * 0.7,
        origin.z + (Math.random() - 0.5) * 1.0
      );
      const force = impactVel || { x: 0, y: 6, z: 0 };
      body.velocity.set(
        force.x * 0.45 + (Math.random() - 0.5) * 14,
        7 + Math.random() * 10,
        force.z * 0.45 + (Math.random() - 0.5) * 14
      );
      body.angularVelocity.set(
        (Math.random() - 0.5) * 18,
        (Math.random() - 0.5) * 18,
        (Math.random() - 0.5) * 18
      );
      this.world.addBody(body);
      this.debris.push({ mesh: piece, body, life: 2.8 + Math.random() * 1.2 });
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
