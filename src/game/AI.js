/**
 * Aggressive arcade AI: chase track, prefer ramming player/rivals.
 */
export class AIController {
  constructor(car, track, rivals) {
    this.car = car;
    this.track = track;
    this.rivals = rivals;
    this.targetAngle = -Math.PI / 2;
    this.wander = Math.random() * Math.PI * 2;
    this.fireTimer = 0.6 + Math.random();
    this.skill = 0.65 + Math.random() * 0.3;
    this.ramBias = 0.55 + Math.random() * 0.35;
  }

  update(dt) {
    const car = this.car;
    if (!car.alive) return { throttle: 0, steer: 0, boost: false, fire: false };

    this.targetAngle += dt * (0.6 + this.skill * 0.4);
    this.wander += dt * 1.5;
    const radius = 26 + Math.sin(this.wander) * 3;
    let tx = Math.cos(this.targetAngle) * radius;
    let tz = Math.sin(this.targetAngle) * radius;

    const pos = car.position;
    const fwd = car.forward;
    const facing = Math.atan2(fwd.x, fwd.z);

    // Prefer ramming nearest rival ahead / player
    let ramTarget = null;
    let bestScore = -1;
    for (const r of this.rivals) {
      if (r === car || !r.alive) continue;
      const dx = r.position.x - pos.x;
      const dz = r.position.z - pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > 420) continue;
      const ahead = dx * fwd.x + dz * fwd.z;
      const score = (r.isPlayer ? 1.6 : 1) * this.ramBias * (ahead > -2 ? 1.4 : 0.6) / Math.sqrt(d2 + 1);
      if (score > bestScore) {
        bestScore = score;
        ramTarget = r;
      }
    }

    if (ramTarget && bestScore > 0.08) {
      // blend track target with ram aim
      const blend = Math.min(0.85, 0.35 + this.ramBias * 0.5);
      tx = tx * (1 - blend) + ramTarget.position.x * blend;
      tz = tz * (1 - blend) + ramTarget.position.z * blend;
    }

    const toX = tx - pos.x;
    const toZ = tz - pos.z;
    const desired = Math.atan2(toX, toZ);

    let diff = desired - facing;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;

    const noise = Math.sin(this.wander * 2.1) * (0.22 - this.skill * 0.12);
    let steer = THREE_clamp(diff * 2.1 + noise, -1, 1);

    let throttle = 0.85 + this.skill * 0.2;
    for (const r of this.rivals) {
      if (r === car || !r.alive) continue;
      const dx = r.position.x - pos.x;
      const dz = r.position.z - pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 64) {
        // commit to ram more often
        if (Math.sin(this.wander * 2.4) > -0.15 || r.isPlayer) {
          steer += Math.sign(dx * fwd.z - dz * fwd.x) * 0.55;
          throttle = 1;
        }
      }
    }

    const dist = Math.hypot(pos.x, pos.z);
    if (dist < 17) {
      const out = Math.atan2(pos.x, pos.z);
      let od = out - facing;
      while (od > Math.PI) od -= Math.PI * 2;
      while (od < -Math.PI) od += Math.PI * 2;
      steer += od * 0.85;
    } else if (dist > 38) {
      const inn = Math.atan2(-pos.x, -pos.z);
      let id = inn - facing;
      while (id > Math.PI) id -= Math.PI * 2;
      while (id < -Math.PI) id += Math.PI * 2;
      steer += id * 0.85;
    }

    const boost =
      car.boost > 15 &&
      ((ramTarget && bestScore > 0.12) || Math.sin(this.wander) > 0.45) &&
      throttle > 0.5;

    this.fireTimer -= dt;
    let fire = false;
    if (car.weapon && this.fireTimer <= 0) {
      for (const r of this.rivals) {
        if (r === car || !r.alive) continue;
        const dx = r.position.x - pos.x;
        const dz = r.position.z - pos.z;
        if (dx * dx + dz * dz < 1100) {
          fire = true;
          this.fireTimer = 0.8 + Math.random();
          break;
        }
      }
      if (!fire) this.fireTimer = 0.25;
    }

    return {
      throttle: THREE_clamp(throttle, -0.2, 1),
      steer: THREE_clamp(steer, -1, 1),
      boost,
      fire,
    };
  }
}

function THREE_clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}
