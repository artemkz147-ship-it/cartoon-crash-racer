import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { makeHybridCarMesh } from './Assets.js';
import { getCar } from './data/cars.js';

const MAX_HEALTH = 100;
const MAX_ARMOR = 100;
const MAX_BOOST = 100;

export class Car {
  constructor({
    scene, world, color, accent, name, isPlayer = false, spawn, particles,
    carId, style, stats, weaponPower = 1,
  }) {
    this.scene = scene;
    this.world = world;
    this.name = name;
    this.isPlayer = isPlayer;
    this.color = color;
    this.particles = particles || null;
    this.carId = carId || null;
    this.stats = stats || { speed: 0.8, handling: 0.8, armor: 0.7, weapon: 0.7 };
    this.weaponPower = weaponPower || this.stats.weapon || 1;
    this.trackGrip = 1;
    this.wrecks = 0;

    this.health = MAX_HEALTH;
    this.armor = Math.round((this.stats.armor || 0.7) * 15);
    this.boost = 45;
    this.weapon = null;
    this.alive = true;
    this.respawnTimer = 0;
    this.lap = 1;
    this.checkpoint = 0;
    this.progress = 0;
    this.wpIndex = 0;
    this.invuln = 0;
    this.armorTimer = 0;
    this.fireCooldown = 0;
    this._dustTimer = 0;
    this._skidTimer = 0;
    this._trailTimer = 0;
    this._smokeTimer = 0;
    this._exhaustTimer = 0;
    this._sparkTimer = 0;
    this._airborne = false;
    this._airTime = 0;
    this._landPunch = 0;
    this._onBoostPad = false;
    this._draftTimer = 0;
    this.trackRef = null; // set by Game for elevation
    this.speed = 0;
    this.slide = 0;
    this.derbyEliminated = false;

    const meshStyle = style || getCar(carId)?.style || 'buggy';
    this.mesh = makeHybridCarMesh(color, accent, meshStyle, this.carId);
    scene.add(this.mesh);

    const mass = 180 + (this.stats.armor || 0.7) * 80;
    const shape = new CANNON.Box(new CANNON.Vec3(0.9, 0.45, 1.65));
    this.body = new CANNON.Body({
      mass,
      shape,
      linearDamping: 0.42,
      angularDamping: 0.38,
      material: new CANNON.Material('car'),
    });
    this.body.position.set(spawn.px, spawn.py != null ? spawn.py : 1.0, spawn.pz);
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
    this._updateDamageVisuals();
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
    const resist = 0.7 + (this.stats.armor || 0.7) * 0.35;
    let dmg = amount / resist;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, dmg * 0.75);
      this.armor -= absorbed;
      dmg -= absorbed;
    }
    this.health = Math.max(0, this.health - dmg);
    this.invuln = fromRam ? 0.3 : 0.12;
    this._updateDamageVisuals();
    if (this.health <= 0) this._die();
    return dmg;
  }

  _updateDamageVisuals() {
    const ud = this.mesh.userData;
    const hp = this.health;
    if (ud.dents) {
      if (ud.dents[0]) ud.dents[0].visible = hp < 75;
      if (ud.dents[1]) ud.dents[1].visible = hp < 55;
      if (ud.dents[2]) ud.dents[2].visible = hp < 35;
      if (ud.dents[3]) ud.dents[3].visible = hp < 18;
    }
    // Multi-piece panel morph/hide (procedural). GLTF: overlays + tint only.
    const panels = ud.panels;
    const gltf = !!ud.isGltf;
    if (panels) {
      if (panels.looseHood) panels.looseHood.visible = hp < 70 && this.alive;
      if (panels.looseDoor) panels.looseDoor.visible = hp < 50 && this.alive;
      if (panels.glass) {
        panels.glass.visible = hp >= 30;
        if (panels.glass.material && hp < 55) {
          panels.glass.material.opacity = Math.max(0.15, hp / 100);
        }
      }
      if (!gltf && panels.bumper) {
        if (!panels.bumper.userData._baseY) panels.bumper.userData._baseY = panels.bumper.position.y;
        panels.bumper.rotation.x = hp < 40 ? 0.35 : 0;
        panels.bumper.position.y = panels.bumper.userData._baseY - (hp < 25 ? 0.15 : 0);
      }
      if (!gltf && panels.hood && hp < 45) {
        panels.hood.rotation.x = -0.25 * (1 - hp / 45);
      } else if (!gltf && panels.hood) {
        panels.hood.rotation.x = 0;
      }
      if (panels.stripe) panels.stripe.visible = hp >= 20;
    }
    if (ud.smokePuff) ud.smokePuff.visible = hp < 40 && this.alive;
    if (ud.bodyMat) {
      if (!this._baseColor) this._baseColor = ud.bodyMat.color.clone();
      const dmg = 1 - hp / 100;
      ud.bodyMat.color.copy(this._baseColor);
      ud.bodyMat.color.offsetHSL(0, -dmg * 0.22, -dmg * 0.2);
    }
  }

  _die() {
    this.alive = false;
    this.respawnTimer = 2.2;
    this.mesh.visible = false;
    if (this.particles) {
      this.particles.explosion(this.body.position.x, this.body.position.y + 0.5, this.body.position.z, 1.4);
    }
    if (this.onDie) this.onDie(this);
    this.body.velocity.set(0, 0, 0);
    this.body.angularVelocity.set(0, 0, 0);
    this.body.position.y = -5;
  }

  respawn(trackPoint) {
    if (this.derbyEliminated) return;
    this.alive = true;
    this.health = MAX_HEALTH;
    this.armor = Math.round((this.stats.armor || 0.7) * 10);
    this.weapon = null;
    this.invuln = 1.5;
    this.mesh.visible = true;
    if (this.mesh.userData.shield) this.mesh.userData.shield.visible = false;
    this._updateDamageVisuals();
    const p = trackPoint || this.spawnPos;
    const ry = this.trackRef ? this.trackRef.getHeightAt(p.x, p.z) + 1.2 : (p.py != null ? p.py : 1.2);
    this.body.position.set(p.x, ry, p.z);
    this.body.velocity.set(0, 0, 0);
    this.body.angularVelocity.set(0, 0, 0);
    const facing = p.facing != null ? p.facing : this.spawnFacing;
    this.body.quaternion.setFromEuler(0, facing, 0);
  }

  givePickup(type) {
    if (type === 'weapon') {
      this.weapon = { type: 'rocket', ammo: 3 };
    } else if (type === 'weapon2') {
      this.weapon = Math.random() > 0.45 ? { type: 'mine', ammo: 2 } : { type: 'shotgun', ammo: 4 };
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
      if (this.armorTimer <= 0) this.armor = Math.max(0, this.armor - 25);
    }
    if (this.mesh.userData.shield) {
      const sh = this.mesh.userData.shield;
      sh.visible = this.armor > 5;
      if (sh.visible) {
        sh.material.opacity = 0.15 + 0.12 * Math.sin(performance.now() * 0.006);
        sh.rotation.y += dt * 1.2;
      }
    }

    const q = this.body.quaternion;
    const euler = new THREE.Euler().setFromQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w), 'YXZ');
    if (Math.abs(euler.x) > 0.4 || Math.abs(euler.z) > 0.4) {
      this.body.quaternion.setFromEuler(0, euler.y, 0);
      this.body.angularVelocity.x *= 0.15;
      this.body.angularVelocity.z *= 0.15;
    }

    // Follow track elevation when near road surface
    const roadY = this.trackRef ? this.trackRef.getHeightAt(this.body.position.x, this.body.position.z) : 0;
    const rideTarget = roadY + 0.55;
    const aboveRoad = this.body.position.y - rideTarget;
    if (aboveRoad < 0.15) {
      if (this._airborne && this._airTime > 0.18) {
        this._landPunch = 1;
        if (this.particles) {
          this.particles.dust(this.body.position.x, this.body.position.z, 1.2);
          this.particles.sparks(this.body.position.x, rideTarget + 0.3, this.body.position.z, 8);
        }
      }
      this._airborne = false;
      this._airTime = 0;
      this.body.position.y = THREE.MathUtils.lerp(this.body.position.y, rideTarget, Math.min(1, 14 * dt));
      if (this.body.velocity.y < 0) this.body.velocity.y *= 0.35;
    } else if (aboveRoad > 0.7) {
      this._airborne = true;
      this._airTime += dt;
    }
    if (this.body.position.y < roadY + 0.35) {
      this.body.position.y = roadY + 0.45;
      this.body.velocity.y = Math.max(0, this.body.velocity.y);
    }
    if (this.body.position.y > roadY + 6) this.body.velocity.y -= 22 * dt;
    if (this._landPunch > 0) this._landPunch = Math.max(0, this._landPunch - dt * 3);

    const spdMul = 0.75 + (this.stats.speed || 0.8) * 0.45;
    const handMul = 0.7 + (this.stats.handling || 0.8) * 0.5;
    // v1.1 feel: ~40% slower top end, softer accel, more coast drag (arcade CTR/FlatOut)
    const maxSpeed = (this._boosting ? 30 : 19) * spdMul;
    const accel = (this._boosting ? 42 : 28) * spdMul;
    const brake = 52;
    const steerSpeed = 3.15 * handMul;
    const gripBase = (0.9 + (this.stats.handling || 0.8) * 0.08) * (this.trackGrip || 1);

    const fwd = this.forward;
    const right = this.right;
    const speed = this.body.velocity.dot(fwd);
    this.speed = speed;

    const lat = this.body.velocity.dot(right);
    this.slide = lat;
    const grip = Math.abs(this._steer) > 0.4 && Math.abs(speed) > 12 ? gripBase * 0.78 : gripBase;
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
      this.body.velocity.x *= 1 - 2.2 * dt;
      this.body.velocity.z *= 1 - 2.2 * dt;
    }

    // Steering sign (chase cam behind car, Y-up):
    //   +steer (stick RIGHT) → targetYaw NEGATIVE → clockwise yaw → turn RIGHT on screen.
    //   -steer (stick LEFT)  → targetYaw POSITIVE → CCW yaw → turn LEFT on screen.
    // Do not flip the leading minus without also flipping Input stick X.
    const steerFactor = Math.min(1, Math.abs(speed) / 4.5 + 0.25);
    if (Math.abs(this._steer) > 0.04) {
      const dir = speed >= -1 ? 1 : -1;
      const driftExtra = Math.min(0.55, Math.abs(lat) / 16);
      const targetYaw = -this._steer * (steerSpeed + driftExtra) * steerFactor * dir;
      // ~50–70 ms approach (was ~16*dt ≈ sluggish with high angularDamping)
      const k = 1 - Math.exp(-dt / 0.055);
      this.body.angularVelocity.y += (targetYaw - this.body.angularVelocity.y) * k;
    } else {
      this.body.angularVelocity.y *= 0.72;
    }

    if (this._boosting) this.boost = Math.max(0, this.boost - 22 * dt);
    else this.boost = Math.min(MAX_BOOST, this.boost + 9 * dt);

    this.mesh.position.copy(this.body.position);
    this.mesh.quaternion.copy(this.body.quaternion);
    // Pitch mesh to match road slope (visual only — body stays upright)
    const pitch = this.trackRef
      ? this.trackRef.getPitchAt(this.body.position.x, this.body.position.z)
      : 0;
    const wreckLean = this.health < 35 ? (1 - this.health / 35) * 0.22 : 0;
    const landSquash = this._landPunch * 0.08;
    this.mesh.rotation.x = THREE.MathUtils.lerp(this.mesh.rotation.x, pitch * 0.85 - landSquash, Math.min(1, 6 * dt));
    this.mesh.rotation.z = THREE.MathUtils.lerp(
      this.mesh.rotation.z,
      -this._steer * 0.12 - lat * 0.015 + wreckLean,
      Math.min(1, 8 * dt)
    );

    for (const w of this.mesh.userData.wheels || []) w.rotation.x += speed * dt * 1.6;

    if (this.invuln > 0.5) this.mesh.visible = Math.floor(this.invuln * 10) % 2 === 0;
    else this.mesh.visible = true;

    if (this.particles) {
      this._dustTimer -= dt;
      this._skidTimer -= dt;
      this._trailTimer -= dt;
      this._smokeTimer -= dt;
      this._exhaustTimer -= dt;
      if (this._throttle > 0.35 && this._exhaustTimer <= 0) {
        const ex = this.body.position.x - fwd.x * 2.0;
        const ez = this.body.position.z - fwd.z * 2.0;
        if (this.particles.exhaust) {
          this.particles.exhaust(ex, this.body.position.y + 0.35, ez, this._boosting);
        } else {
          this.particles.smoke(ex, this.body.position.y + 0.3, ez);
        }
        this._exhaustTimer = this._boosting ? 0.04 : 0.09;
      }
      if (this._throttle > 0.5 && Math.abs(speed) > 4 && this._dustTimer <= 0) {
        this.particles.dust(this.body.position.x - fwd.x * 1.2, this.body.position.z - fwd.z * 1.2, Math.min(1, Math.abs(speed) / 25));
        this._dustTimer = 0.08;
      }
      if ((Math.abs(lat) > 6 || (Math.abs(this._steer) > 0.5 && Math.abs(speed) > 14)) && this._skidTimer <= 0) {
        this.particles.skidMark(this.body.position.x, this.body.position.z, Math.atan2(fwd.x, fwd.z));
        this._skidTimer = 0.07;
      }
      if (this._boosting && this._trailTimer <= 0) {
        this.particles.boostTrail(this.body.position.x - fwd.x * 1.8, this.body.position.y + 0.4, this.body.position.z - fwd.z * 1.8, 0xffee44);
        this.particles.smoke(this.body.position.x - fwd.x * 2, this.body.position.y + 0.3, this.body.position.z - fwd.z * 2);
        this._trailTimer = 0.04;
      }
      if (this.health < 40 && this._smokeTimer <= 0) {
        this.particles.smoke(this.body.position.x - fwd.x * 1.5, this.body.position.y + 1.0, this.body.position.z - fwd.z * 1.5);
        this._smokeTimer = 0.12;
      }
      this._sparkTimer -= dt;
      if (this.health < 28 && this._sparkTimer <= 0) {
        this.particles.sparks(
          this.body.position.x + (Math.random() - 0.5) * 1.2,
          this.body.position.y + 0.4,
          this.body.position.z + (Math.random() - 0.5) * 1.2,
          4 + Math.floor((28 - this.health) / 7)
        );
        this._sparkTimer = 0.14 + Math.random() * 0.1;
      }
      if (this._onBoostPad) {
        this.particles.boostTrail(
          this.body.position.x - fwd.x * 1.2,
          this.body.position.y + 0.2,
          this.body.position.z - fwd.z * 1.2,
          0x66ffcc
        );
        this._onBoostPad = false;
      }
    }

    // Progress from waypoint index + lap
    this.progress = this.wpIndex + (this.lap - 1) * 1000 + this.checkpoint * 10;
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
      power: this.weaponPower,
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
    if (!this.alive || !checkpoints?.length) return false;
    const pos = this.body.position;
    const next = checkpoints[this.checkpoint % checkpoints.length];
    const dx = pos.x - next.x;
    const dz = pos.z - next.z;
    if (dx * dx + dz * dz < 120) {
      this.checkpoint++;
      this.wpIndex = next.wpIndex || this.checkpoint;
      if (this.checkpoint > 0 && this.checkpoint % checkpoints.length === 0) {
        this.lap++;
        return true;
      }
    }
    return false;
  }

  /** Brighten headlights for night / dark themes. */
  setNightLights(on) {
    const ud = this.mesh.userData;
    if (ud.glowMat) {
      ud.glowMat.emissiveIntensity = on ? 1.6 : 0.95;
      ud.glowMat.emissive.setHex(on ? 0xffee88 : 0xffcc44);
    }
    if (ud.headlights) {
      for (const h of ud.headlights) {
        if (h.material && h.material.opacity != null) {
          h.material.opacity = on ? 0.55 : 0.35;
        }
      }
    }
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.world.removeBody(this.body);
  }
}
