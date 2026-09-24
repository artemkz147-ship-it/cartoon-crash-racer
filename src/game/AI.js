/**
 * Simple "poor but visible" AI: chase next track point with noisy steering,
 * occasional boost, and fire when weapon + enemy nearby.
 */
export class AIController {
  constructor(car, track, rivals) {
    this.car = car;
    this.track = track;
    this.rivals = rivals;
    this.targetAngle = -Math.PI / 2;
    this.wander = Math.random() * Math.PI * 2;
    this.fireTimer = 1 + Math.random() * 2;
    this.skill = 0.55 + Math.random() * 0.25;
  }

  update(dt) {
    const car = this.car;
    if (!car.alive) return { throttle: 0, steer: 0, boost: false, fire: false };

    // Advance target along oval
    this.targetAngle += dt * (0.55 + this.skill * 0.35);
    this.wander += dt * 1.3;
    const radius = 26 + Math.sin(this.wander) * 3;
    const tx = Math.cos(this.targetAngle) * radius;
    const tz = Math.sin(this.targetAngle) * radius;

    const pos = car.position;
    const toX = tx - pos.x;
    const toZ = tz - pos.z;
    const desired = Math.atan2(toX, toZ);

    // Current facing from quaternion
    const fwd = car.forward;
    const facing = Math.atan2(fwd.x, fwd.z);
    let diff = desired - facing;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;

    // Imperfect steering
    const noise = Math.sin(this.wander * 2.1) * (0.35 - this.skill * 0.2);
    let steer = THREE_clamp(diff * 1.8 + noise, -1, 1);

    // Avoid nearest rival a bit
    let throttle = 0.75 + this.skill * 0.25;
    for (const r of this.rivals) {
      if (r === car || !r.alive) continue;
      const dx = r.position.x - pos.x;
      const dz = r.position.z - pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 36) {
        // try to ram or dodge randomly
        if (Math.sin(this.wander * 3) > 0.2) {
          steer += Math.sign(dx * fwd.z - dz * fwd.x) * 0.4;
        } else {
          throttle = 1;
        }
      }
    }

    // Stay roughly on track ring
    const dist = Math.hypot(pos.x, pos.z);
    if (dist < 17) {
      // push outward
      const out = Math.atan2(pos.x, pos.z);
      let od = out - facing;
      while (od > Math.PI) od -= Math.PI * 2;
      while (od < -Math.PI) od += Math.PI * 2;
      steer += od * 0.8;
    } else if (dist > 38) {
      const inn = Math.atan2(-pos.x, -pos.z);
      let id = inn - facing;
      while (id > Math.PI) id -= Math.PI * 2;
      while (id < -Math.PI) id += Math.PI * 2;
      steer += id * 0.8;
    }

    const boost = car.boost > 20 && Math.sin(this.wander) > 0.6 && throttle > 0.5;

    this.fireTimer -= dt;
    let fire = false;
    if (car.weapon && this.fireTimer <= 0) {
      // fire if any rival somewhat close
      for (const r of this.rivals) {
        if (r === car || !r.alive) continue;
        const dx = r.position.x - pos.x;
        const dz = r.position.z - pos.z;
        if (dx * dx + dz * dz < 900) {
          fire = true;
          this.fireTimer = 1.2 + Math.random() * 1.5;
          break;
        }
      }
      if (!fire) this.fireTimer = 0.4;
    }

    return {
      throttle: THREE_clamp(throttle, -0.3, 1),
      steer: THREE_clamp(steer, -1, 1),
      boost,
      fire,
    };
  }
}

function THREE_clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}
