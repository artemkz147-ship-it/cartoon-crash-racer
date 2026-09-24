import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { makeCarMesh } from './meshes.js';

const MAX_HEALTH = 100;
const MAX_ARMOR = 100;
const MAX_BOOST = 100;

export class Car {
  constructor({ scene, world, color, accent, name, isPlayer = false, spawn }) {
    this.scene = scene;
    this.world = world;
    this.name = name;
    this.isPlayer = isPlayer;
    this.color = color;

    this.health = MAX_HEALTH;
    this.armor = 0;
    this.boost = 40;
    this.weapon = null; // { type, ammo }
    this.alive = true;
    this.respawnTimer = 0;
    this.lap = 1;
    this.checkpoint = 0;
    this.progress = 0;
    this.invuln = 0;
    this.armorTimer = 0;
    this.fireCooldown = 0;
    this.lastCollision = 0;

    this.mesh = makeCarMesh(color, accent);
    scene.add(this.mesh);

    const shape = new CANNON.Box(new CANNON.Vec3(0.9, 0.45, 1.6));
    this.body = new CANNON.Body({
      mass: 180,
      shape,
      linearDamping: 0.35,
      angularDamping: 0.6,
      material: new CANNON.Material('car'),
    });
    this.body.position.set(spawn.px, 1.0, spawn.pz);
    this.body.quaternion.setFromEuler(0, spawn.facing, 0);
    this.body.allowSleep = false;
    this.body.userData = { car: this };
    world.addBody(this.body);

    this._steer = 0;
    this._throttle = 0;
    this._boosting = false;
    this.spawnFacing = spawn.facing;
    this.spawnPos = { x: spawn.px, z: spawn.pz };
  }

  get position() {
    return this.body.position;
  }

  get forward() {
    const q = this.body.quaternion;
    const v = new CANNON.Vec3(0, 0, 1);
    q.vmult(v, v);
    return v;
  }

  get right() {
    const q = this.body.quaternion;
    const v = new CANNON.Vec3(1, 0, 0);
    q.vmult(v, v);
    return v;
  }

  setControls({ throttle, steer, boost }) {
    this._throttle = THREE.MathUtils.clamp(throttle, -1, 1);
    this._steer = THREE.MathUtils.clamp(steer, -1, 1);
    this._boosting = !!boost && this.boost > 0 && this._throttle > 0;
  }

  takeDamage(amount, fromRam = false) {
    if (!this.alive || this.invuln > 0) return 0;
    let dmg = amount;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, dmg * 0.7);
      this.armor -= absorbed;
      dmg -= absorbed;
    }
    this.health = Math.max(0, this.health - dmg);
    this.invuln = fromRam ? 0.35 : 0.15;
    if (this.health <= 0) {
      this._die();
    }
    return dmg;
  }

  _die() {
    this.alive = false;
    this.respawnTimer = 2.2;
    this.mesh.visible = false;
    this.body.velocity.set(0, 0, 0);
    this.body.angularVelocity.set(0, 0, 0);
    this.body.position.y = -5;
  }

  respawn(trackPoint) {
    this.alive = true;
    this.health = MAX_HEALTH;
    this.armor = 0;
    this.weapon = null;
    this.invuln = 1.5;
    this.mesh.visible = true;
    const p = trackPoint || this.spawnPos;
    this.body.position.set(p.x, 1.2, p.z);
    this.body.velocity.set(0, 0, 0);
    this.body.angularVelocity.set(0, 0, 0);
    const facing = p.facing != null ? p.facing : this.spawnFacing;
    this.body.quaternion.setFromEuler(0, facing, 0);
  }

  givePickup(type) {
    if (type === 'weapon') {
      this.weapon = { type: 'rocket', ammo: 3 };
    } else if (type === 'armor') {
      this.armor = Math.min(MAX_ARMOR, this.armor + 60);
      this.armorTimer = 8;
    } else if (type === 'boost') {
      this.boost = Math.min(MAX_BOOST, this.boost + 50);
    }
  }

  update(dt) {
    if (!this.alive) {
      this.respawnTimer -= dt;
      return;
    }

    this.invuln = Math.max(0, this.invuln - dt);
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    if (this.armorTimer > 0) {
      this.armorTimer -= dt;
      if (this.armorTimer <= 0) this.armor = Math.max(0, this.armor - 20);
    }

    // Keep upright-ish: damp roll/pitch
    const q = this.body.quaternion;
    const euler = new THREE.Euler().setFromQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w), 'YXZ');
    if (Math.abs(euler.x) > 0.35 || Math.abs(euler.z) > 0.35) {
      this.body.quaternion.setFromEuler(0, euler.y, 0);
      this.body.angularVelocity.x *= 0.2;
      this.body.angularVelocity.z *= 0.2;
    }

    // Keep on ground contact height soft
    if (this.body.position.y < 0.4) {
      this.body.position.y = 0.5;
      this.body.velocity.y = Math.max(0, this.body.velocity.y);
    }
    if (this.body.position.y > 4) {
      this.body.velocity.y -= 20 * dt;
    }

    const maxSpeed = this._boosting ? 42 : 28;
    const accel = this._boosting ? 55 : 38;
    const brake = 45;
    const steerSpeed = 2.6;

    const fwd = this.forward;
    const speed = this.body.velocity.dot(fwd);

    if (this._throttle > 0) {
      if (speed < maxSpeed) {
        this.body.applyForce(
          new CANNON.Vec3(fwd.x * accel * this._throttle * 180, 0, fwd.z * accel * this._throttle * 180),
          this.body.position
        );
      }
    } else if (this._throttle < 0) {
      this.body.applyForce(
        new CANNON.Vec3(fwd.x * brake * this._throttle * 180, 0, fwd.z * brake * this._throttle * 180),
        this.body.position
      );
    } else {
      this.body.velocity.x *= 1 - 1.2 * dt;
      this.body.velocity.z *= 1 - 1.2 * dt;
    }

    // Steering scales with speed
    const steerFactor = Math.min(1, Math.abs(speed) / 8 + 0.15);
    if (Math.abs(this._steer) > 0.05) {
      const dir = speed >= -1 ? 1 : -1;
      this.body.angularVelocity.y = -this._steer * steerSpeed * steerFactor * dir;
    } else {
      this.body.angularVelocity.y *= 0.85;
    }

    if (this._boosting) {
      this.boost = Math.max(0, this.boost - 28 * dt);
    } else {
      this.boost = Math.min(MAX_BOOST, this.boost + 6 * dt);
    }

    // Sync mesh
    this.mesh.position.copy(this.body.position);
    this.mesh.quaternion.copy(this.body.quaternion);

    // Wheel spin visual
    const wheels = this.mesh.userData.wheels || [];
    for (const w of wheels) {
      w.rotation.x += speed * dt * 1.5;
    }

    // Flash when invuln after respawn
    if (this.invuln > 0.5) {
      this.mesh.visible = Math.floor(this.invuln * 10) % 2 === 0;
    } else {
      this.mesh.visible = true;
    }

    // Track progress angle
    const ang = Math.atan2(this.body.position.z, this.body.position.x);
    this.progress = ((ang + Math.PI * 2.5) % (Math.PI * 2)) + (this.lap - 1) * Math.PI * 2;
  }

  tryFire() {
    if (!this.alive || !this.weapon || this.weapon.ammo <= 0 || this.fireCooldown > 0) return null;
    this.weapon.ammo -= 1;
    this.fireCooldown = 0.55;
    const fwd = this.forward;
    const origin = {
      x: this.body.position.x + fwd.x * 2.2,
      y: this.body.position.y + 0.6,
      z: this.body.position.z + fwd.z * 2.2,
    };
    const shot = {
      type: this.weapon.type,
      origin,
      direction: { x: fwd.x, y: 0, z: fwd.z },
      owner: this,
    };
    if (this.weapon.ammo <= 0) this.weapon = null;
    return shot;
  }

  updateLap(checkpoints) {
    if (!this.alive) return;
    const pos = this.body.position;
    const next = checkpoints[this.checkpoint % checkpoints.length];
    const dx = pos.x - next.x;
    const dz = pos.z - next.z;
    if (dx * dx + dz * dz < 64) {
      this.checkpoint++;
      if (this.checkpoint > 0 && this.checkpoint % checkpoints.length === 0) {
        this.lap++;
      }
    }
  }
}
