import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { makeCarMesh } from './meshes.js';

const MAX_HEALTH = 100;
const MAX_ARMOR = 100;
const MAX_BOOST = 100;

export class Car {
  constructor({ scene, world, color, accent, name, isPlayer = false, spawn, particles }) {
    this.scene = scene;
    this.world = world;
    this.name = name;
    this.isPlayer = isPlayer;
    this.color = color;
    this.particles = particles || null;

    this.health = MAX_HEALTH;
    this.armor = 0;
    this.boost = 45;
    this.weapon = null;
    this.alive = true;
    this.respawnTimer = 0;
    this.lap = 1;
    this.checkpoint = 0;
    this.progress = 0;
    this.invuln = 0;
    this.armorTimer = 0;
    this.fireCooldown = 0;
    this.lastCollision = 0;
    this._dustTimer = 0;
    this._skidTimer = 0;
    this._trailTimer = 0;
    this.speed = 0;
    this.slide = 0;

    this.mesh = makeCarMesh(color, accent);
    scene.add(this.mesh);

    const shape = new CANNON.Box(new CANNON.Vec3(0.9, 0.45, 1.65));
    this.body = new CANNON.Body({
      mass: 200,
      shape,
      linearDamping: 0.28,
      angularDamping: 0.55,
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
    this.onBoostStart = null;
    this.onDie = null;
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
    const was = this._boosting;
    this._boosting = !!boost && this.boost > 0 && this._throttle > 0.1;
    if (this._boosting && !was && this.onBoostStart) this.onBoostStart();
  }

  takeDamage(amount, fromRam = false) {
    if (!this.alive || this.invuln > 0) return 0;
    let dmg = amount;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, dmg * 0.75);
      this.armor -= absorbed;
      dmg -= absorbed;
    }
    this.health = Math.max(0, this.health - dmg);
    this.invuln = fromRam ? 0.3 : 0.12;
    if (this.health <= 0) this._die();
    return dmg;
  }

  _die() {
    this.alive = false;
    this.respawnTimer = 2.2;
    this.mesh.visible = false;
    if (this.particles) {
      this.particles.explosion(this.body.position.x, this.body.position.y + 0.5, this.body.position.z, 1.3);
    }
    if (this.onDie) this.onDie(this);
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
    if (this.mesh.userData.shield) this.mesh.userData.shield.visible = false;
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
    } else if (type === 'weapon2') {
      // Alternate: mines or shotgun randomly
      this.weapon =
        Math.random() > 0.45
          ? { type: 'mine', ammo: 2 }
          : { type: 'shotgun', ammo: 4 };
    } else if (type === 'armor') {
      this.armor = Math.min(MAX_ARMOR, this.armor + 70);
      this.armorTimer = 10;
      if (this.mesh.userData.shield) this.mesh.userData.shield.visible = true;
    } else if (type === 'boost') {
      this.boost = Math.min(MAX_BOOST, this.boost + 55);
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
      if (this.armorTimer <= 0) {
        this.armor = Math.max(0, this.armor - 25);
      }
    }
    if (this.mesh.userData.shield) {
      const sh = this.mesh.userData.shield;
      sh.visible = this.armor > 5;
      if (sh.visible) {
        sh.material.opacity = 0.15 + 0.12 * Math.sin(performance.now() * 0.006);
        sh.rotation.y += dt * 1.2;
      }
    }

    // Keep upright
    const q = this.body.quaternion;
    const euler = new THREE.Euler().setFromQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w), 'YXZ');
    if (Math.abs(euler.x) > 0.4 || Math.abs(euler.z) > 0.4) {
      this.body.quaternion.setFromEuler(0, euler.y, 0);
      this.body.angularVelocity.x *= 0.15;
      this.body.angularVelocity.z *= 0.15;
    }

    if (this.body.position.y < 0.4) {
      this.body.position.y = 0.5;
      this.body.velocity.y = Math.max(0, this.body.velocity.y);
    }
    if (this.body.position.y > 5) {
      this.body.velocity.y -= 22 * dt;
    }

    // Arcade handling: weighty but responsive + drift-ish lateral slide
    const maxSpeed = this._boosting ? 50 : 32;
    const accel = this._boosting ? 70 : 48;
    const brake = 58;
    const steerSpeed = 3.4;

    const fwd = this.forward;
    const right = this.right;
    const speed = this.body.velocity.dot(fwd);
    this.speed = speed;

    // Lateral velocity (drift)
    const lat = this.body.velocity.dot(right);
    this.slide = lat;
    // Grip: allow more slide when steering hard at speed
    const grip = Math.abs(this._steer) > 0.4 && Math.abs(speed) > 12 ? 0.72 : 0.92;
    this.body.velocity.x -= right.x * lat * (1 - grip) * Math.min(1, 8 * dt);
    this.body.velocity.z -= right.z * lat * (1 - grip) * Math.min(1, 8 * dt);

    if (this._throttle > 0) {
      if (speed < maxSpeed) {
        const force = accel * this._throttle * 200;
        this.body.applyForce(new CANNON.Vec3(fwd.x * force, 0, fwd.z * force), this.body.position);
      }
    } else if (this._throttle < 0) {
      const force = brake * this._throttle * 200;
      this.body.applyForce(new CANNON.Vec3(fwd.x * force, 0, fwd.z * force), this.body.position);
    } else {
      this.body.velocity.x *= 1 - 1.4 * dt;
      this.body.velocity.z *= 1 - 1.4 * dt;
    }

    const steerFactor = Math.min(1, Math.abs(speed) / 5.5 + 0.2);
    if (Math.abs(this._steer) > 0.04) {
      const dir = speed >= -1 ? 1 : -1;
      // Drift yaw boost when sliding
      const driftExtra = Math.min(0.6, Math.abs(lat) / 18);
      const targetYaw = -this._steer * (steerSpeed + driftExtra) * steerFactor * dir;
      this.body.angularVelocity.y += (targetYaw - this.body.angularVelocity.y) * Math.min(1, 16 * dt);
    } else {
      this.body.angularVelocity.y *= 0.75;
    }

    if (this._boosting) {
      this.boost = Math.max(0, this.boost - 30 * dt);
    } else {
      this.boost = Math.min(MAX_BOOST, this.boost + 7 * dt);
    }

    // Sync mesh
    this.mesh.position.copy(this.body.position);
    this.mesh.quaternion.copy(this.body.quaternion);
    // Visual body lean into turns / drift
    this.mesh.rotation.z = THREE.MathUtils.lerp(
      this.mesh.rotation.z,
      -this._steer * 0.12 - lat * 0.015,
      Math.min(1, 8 * dt)
    );

    const wheels = this.mesh.userData.wheels || [];
    for (const w of wheels) {
      w.rotation.x += speed * dt * 1.6;
    }

    if (this.invuln > 0.5) {
      this.mesh.visible = Math.floor(this.invuln * 10) % 2 === 0;
    } else {
      this.mesh.visible = true;
    }

    // FX
    if (this.particles) {
      this._dustTimer -= dt;
      this._skidTimer -= dt;
      this._trailTimer -= dt;
      if (this._throttle > 0.5 && Math.abs(speed) > 4 && this._dustTimer <= 0) {
        this.particles.dust(this.body.position.x - fwd.x * 1.2, this.body.position.z - fwd.z * 1.2, Math.min(1, Math.abs(speed) / 25));
        this._dustTimer = 0.08;
      }
      if ((Math.abs(lat) > 6 || (Math.abs(this._steer) > 0.5 && Math.abs(speed) > 14)) && this._skidTimer <= 0) {
        const yaw = Math.atan2(fwd.x, fwd.z);
        this.particles.skidMark(this.body.position.x, this.body.position.z, yaw);
        this._skidTimer = 0.07;
      }
      if (this._boosting && this._trailTimer <= 0) {
        this.particles.boostTrail(
          this.body.position.x - fwd.x * 1.8,
          this.body.position.y + 0.4,
          this.body.position.z - fwd.z * 1.8,
          0xffee44
        );
        this.particles.smoke(
          this.body.position.x - fwd.x * 2,
          this.body.position.y + 0.3,
          this.body.position.z - fwd.z * 2
        );
        this._trailTimer = 0.04;
      }
    }

    // Progress
    const ang = Math.atan2(this.body.position.z, this.body.position.x);
    this.progress = ((ang + Math.PI * 2.5) % (Math.PI * 2)) + (this.lap - 1) * Math.PI * 2;
  }

  tryFire() {
    if (!this.alive || !this.weapon || this.weapon.ammo <= 0 || this.fireCooldown > 0) return null;
    this.weapon.ammo -= 1;
    const type = this.weapon.type;
    this.fireCooldown = type === 'shotgun' ? 0.35 : type === 'mine' ? 0.7 : 0.55;
    const fwd = this.forward;
    const origin = {
      x: this.body.position.x + fwd.x * 2.2,
      y: this.body.position.y + 0.55,
      z: this.body.position.z + fwd.z * 2.2,
    };
    const shot = {
      type,
      origin,
      direction: { x: fwd.x, y: 0, z: fwd.z },
      owner: this,
    };
    if (type === 'mine') {
      shot.origin = {
        x: this.body.position.x - fwd.x * 2.5,
        y: 0.35,
        z: this.body.position.z - fwd.z * 2.5,
      };
    }
    if (this.weapon.ammo <= 0) this.weapon = null;
    return shot;
  }

  updateLap(checkpoints) {
    if (!this.alive) return false;
    const pos = this.body.position;
    const next = checkpoints[this.checkpoint % checkpoints.length];
    const dx = pos.x - next.x;
    const dz = pos.z - next.z;
    // Wider radius for reliable detection
    if (dx * dx + dz * dz < 100) {
      // Must be roughly progressing forward (angle proximity)
      const expected = next.angle;
      const ang = Math.atan2(pos.z, pos.x);
      let ad = ang - expected;
      while (ad > Math.PI) ad -= Math.PI * 2;
      while (ad < -Math.PI) ad += Math.PI * 2;
      if (Math.abs(ad) < 0.9) {
        this.checkpoint++;
        if (this.checkpoint > 0 && this.checkpoint % checkpoints.length === 0) {
          this.lap++;
          return true;
        }
      }
    }
    return false;
  }
}
