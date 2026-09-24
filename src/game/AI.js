/**
 * Aggressive arcade AI with light rubber-band, pickup seeking, weapons, ramming.
 */
export class AIController {
  constructor(car, track, rivals, pickups) {
    this.car = car;
    this.track = track;
    this.rivals = rivals;
    this.pickups = pickups || null;
    this.targetAngle = -Math.PI / 2;
    this.wander = Math.random() * Math.PI * 2;
    this.fireTimer = 0.5 + Math.random();
    this.skill = 0.7 + Math.random() * 0.25;
    this.ramBias = 0.5 + Math.random() * 0.4;
  }

  update(dt) {
    const car = this.car;
    if (!car.alive) return { throttle: 0, steer: 0, boost: false, fire: false };

    // Rubber-band: compare progress to player
    let playerProg = car.progress;
    for (const r of this.rivals) {
      if (r.isPlayer) playerProg = r.progress;
    }
    const lag = playerProg - car.progress;
    const rubber = THREE_clamp(lag * 0.15, -0.25, 0.55);

    this.targetAngle += dt * (0.55 + this.skill * 0.4 + rubber * 0.2);
    this.wander += dt * 1.4;
    const radius = 26 + Math.sin(this.wander) * 3.5 + rubber * 2;
    let tx = Math.cos(this.targetAngle) * radius;
    let tz = Math.sin(this.targetAngle) * radius;

    const pos = car.position;
    const fwd = car.forward;
    const facing = Math.atan2(fwd.x, fwd.z);

    // Seek pickups if close and need them
    if (this.pickups) {
      const needWeapon = !car.weapon;
      const needArmor = car.armor < 20;
      const needBoost = car.boost < 30;
      const near = this.pickups.nearest(pos.x, pos.z);
      if (near) {
        const d2 = (near.x - pos.x) ** 2 + (near.z - pos.z) ** 2;
        const useful =
          (near.type === 'weapon' || near.type === 'weapon2') && needWeapon
            ? true
            : near.type === 'armor' && needArmor
              ? true
              : near.type === 'boost' && needBoost
                ? true
                : d2 < 80;
        if (useful && d2 < 400) {
          const blend = 0.45;
          tx = tx * (1 - blend) + near.x * blend;
          tz = tz * (1 - blend) + near.z * blend;
        }
      }
    }

    // Prefer ramming
    let ramTarget = null;
    let bestScore = -1;
    for (const r of this.rivals) {
      if (r === car || !r.alive) continue;
      const dx = r.position.x - pos.x;
      const dz = r.position.z - pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > 480) continue;
      const ahead = dx * fwd.x + dz * fwd.z;
      const score =
        (r.isPlayer ? 1.7 : 1) * this.ramBias * (ahead > -2 ? 1.5 : 0.55) / Math.sqrt(d2 + 1);
      if (score > bestScore) {
        bestScore = score;
        ramTarget = r;
      }
    }

    if (ramTarget && bestScore > 0.07) {
      const blend = Math.min(0.9, 0.35 + this.ramBias * 0.55);
      tx = tx * (1 - blend) + ramTarget.position.x * blend;
      tz = tz * (1 - blend) + ramTarget.position.z * blend;
    }

    const toX = tx - pos.x;
    const toZ = tz - pos.z;
    const desired = Math.atan2(toX, toZ);

    let diff = desired - facing;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;

    const noise = Math.sin(this.wander * 2.1) * (0.2 - this.skill * 0.1);
    let steer = THREE_clamp(diff * 2.2 + noise, -1, 1);

    let throttle = 0.8 + this.skill * 0.22 + rubber * 0.35;
    for (const r of this.rivals) {
      if (r === car || !r.alive) continue;
      const dx = r.position.x - pos.x;
      const dz = r.position.z - pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 70) {
        if (Math.sin(this.wander * 2.4) > -0.2 || r.isPlayer) {
          steer += Math.sign(dx * fwd.z - dz * fwd.x) * 0.6;
          throttle = 1;
        }
      }
    }

    const dist = Math.hypot(pos.x, pos.z);
    if (dist < 16.5) {
      const out = Math.atan2(pos.x, pos.z);
      let od = out - facing;
      while (od > Math.PI) od -= Math.PI * 2;
      while (od < -Math.PI) od += Math.PI * 2;
      steer += od * 0.9;
    } else if (dist > 39) {
      const inn = Math.atan2(-pos.x, -pos.z);
      let id = inn - facing;
      while (id > Math.PI) id -= Math.PI * 2;
      while (id < -Math.PI) id += Math.PI * 2;
      steer += id * 0.9;
    }

    const boost =
      car.boost > 12 &&
      ((ramTarget && bestScore > 0.1) || rubber > 0.2 || Math.sin(this.wander) > 0.4) &&
      throttle > 0.45;

    this.fireTimer -= dt;
    let fire = false;
    if (car.weapon && this.fireTimer <= 0) {
      for (const r of this.rivals) {
        if (r === car || !r.alive) continue;
        const dx = r.position.x - pos.x;
        const dz = r.position.z - pos.z;
        const d2 = dx * dx + dz * dz;
        const ahead = dx * fwd.x + dz * fwd.z;
        if (car.weapon.type === 'mine') {
          if (d2 < 200 && ahead < 0) {
            fire = true;
            this.fireTimer = 1.2 + Math.random();
            break;
          }
        } else if (d2 < 1200 && ahead > -5) {
          fire = true;
          this.fireTimer = 0.7 + Math.random() * 0.6;
          break;
        }
      }
      if (!fire) this.fireTimer = 0.2;
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
