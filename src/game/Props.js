import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { makeCrateMesh, makeBarrelMesh, makeBarrierMesh, makeDebrisPiece } from './meshes.js';

export class DestructibleProps {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.items = [];
    this.debris = [];
    this._spawnAll();
  }

  _spawnAll() {
    const spots = [];
    // Crates along inner/outer edges
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + 0.2;
      spots.push({ type: 'crate', x: Math.cos(a) * 20, z: Math.sin(a) * 20 });
      spots.push({ type: 'crate', x: Math.cos(a + 0.1) * 35, z: Math.sin(a + 0.1) * 35 });
    }
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.4;
      spots.push({ type: 'barrel', x: Math.cos(a) * 24, z: Math.sin(a) * 24 });
      spots.push({ type: 'barrel', x: Math.cos(a) * 32, z: Math.sin(a) * 32 });
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.15;
      spots.push({ type: 'barrier', x: Math.cos(a) * 22, z: Math.sin(a) * 22, yaw: -a });
    }

    for (const s of spots) {
      this._addProp(s);
    }
  }

  _addProp(s) {
    let mesh;
    let half;
    let mass;
    let color;
    if (s.type === 'crate') {
      mesh = makeCrateMesh();
      half = new CANNON.Vec3(0.6, 0.6, 0.6);
      mass = 25;
      color = 0xc48a3a;
    } else if (s.type === 'barrel') {
      mesh = makeBarrelMesh();
      half = new CANNON.Vec3(0.45, 0.55, 0.45);
      mass = 20;
      color = 0xd4452a;
    } else {
      mesh = makeBarrierMesh();
      half = new CANNON.Vec3(1.1, 0.45, 0.28);
      mass = 40;
      color = 0xff8c1a;
    }
    mesh.position.set(s.x, half.y + 0.05, s.z);
    if (s.yaw != null) mesh.rotation.y = s.yaw;
    this.scene.add(mesh);

    const body = new CANNON.Body({
      mass,
      shape: new CANNON.Box(half),
      linearDamping: 0.4,
      angularDamping: 0.4,
    });
    body.position.set(s.x, half.y + 0.05, s.z);
    if (s.yaw != null) body.quaternion.setFromEuler(0, s.yaw, 0);
    body.userData = { prop: true };
    this.world.addBody(body);

    const item = {
      type: s.type,
      mesh,
      body,
      hp: s.type === 'barrier' ? 45 : 25,
      color,
      alive: true,
    };
    body.userData.item = item;
    this.items.push(item);
  }

  /** Call when something hits a prop body hard. */
  damageProp(item, amount, impactVel) {
    if (!item || !item.alive) return;
    item.hp -= amount;
    if (item.hp <= 0) {
      this._shatter(item, impactVel);
    }
  }

  _shatter(item, impactVel) {
    item.alive = false;
    this.scene.remove(item.mesh);
    this.world.removeBody(item.body);

    const count = item.type === 'barrier' ? 12 : 9;
    const origin = item.body.position;
    for (let i = 0; i < count; i++) {
      const pieceSize = 0.4 + Math.random() * 0.45;
      const piece = makeDebrisPiece(item.color, pieceSize);
      piece.position.set(origin.x, origin.y + 0.3, origin.z);
      this.scene.add(piece);

      const size = pieceSize * 0.45;
      const body = new CANNON.Body({
        mass: 3.5,
        shape: new CANNON.Box(new CANNON.Vec3(size, size, size)),
        linearDamping: 0.15,
        angularDamping: 0.15,
      });
      body.position.set(
        origin.x + (Math.random() - 0.5) * 0.9,
        origin.y + 0.5 + Math.random() * 0.6,
        origin.z + (Math.random() - 0.5) * 0.9
      );
      const force = impactVel || { x: 0, y: 6, z: 0 };
      body.velocity.set(
        force.x * 0.4 + (Math.random() - 0.5) * 12,
        6 + Math.random() * 9,
        force.z * 0.4 + (Math.random() - 0.5) * 12
      );
      body.angularVelocity.set(
        (Math.random() - 0.5) * 14,
        (Math.random() - 0.5) * 14,
        (Math.random() - 0.5) * 14
      );
      this.world.addBody(body);
      this.debris.push({ mesh: piece, body, life: 4.2 + Math.random() });
    }
  }

  update(dt) {
    for (const item of this.items) {
      if (!item.alive) continue;
      item.mesh.position.copy(item.body.position);
      item.mesh.quaternion.copy(item.body.quaternion);
      // If flung far, shatter
      if (item.body.position.y > 6 || item.body.velocity.length() > 25) {
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
      } else if (d.life < 0.5) {
        d.mesh.traverse((c) => {
          if (c.material) {
            c.material.transparent = true;
            c.material.opacity = d.life / 0.5;
          }
        });
      }
    }
  }

  findByBody(body) {
    return body?.userData?.item || null;
  }
}
