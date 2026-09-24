/**
 * Aggressive arcade AI: waypoint following, rubber-band, ramming, weapons.
 */
export class AIController {
  constructor(car, track, rivals, pickups, difficulty = 0.7) {
    this.car = car;
    this.track = track;
    this.rivals = rivals;
    this.pickups = pickups || null;
    this.difficulty = difficulty;
    this.wpLookahead = 3;
    this.wander = Math.random() * Math.PI * 2;
    this.fireTimer = 0.5 + Math.random();
    this.skill = (0.55 + Math.random() * 0.25) * (0.7 + difficulty * 0.4);
    this.ramBias = 0.4 + Math.random() * 0.5 * difficulty;
    // Sync start waypoint
    this.targetWp = track.nearestWaypointIndex(car.position.x, car.position.z);
  }

  update(dt) {
    const car = this.car;
    if (!car.alive) return { throttle: 0, steer: 0, boost: false, fire: false };

    let playerProg = car.progress;
    for (const r of this.rivals) {
      if (r.isPlayer) playerProg = r.progress;
    }
    const lag = playerProg - car.progress;
    const rubber = clamp(lag * 0.12 * this.difficulty, -0.3, 0.6);

    this.wander += dt * 1.4;
    const pts = this.track.waypoints;
    const near = this.track.nearestWaypointIndex(car.position.x, car.position.z);
    // Advance target if we're close to current target
    let targetIdx = (near + this.wpLookahead + Math.floor(rubber * 2)) % pts.length;
    // If somehow behind near, jump forward
    if ((targetIdx - near + pts.length) % pts.length > pts.length * 0.6) {
      targetIdx = (near + this.wpLookahead) % pts.length;
    }
    this.targetWp = targetIdx;
    car.wpIndex = near;

    let tx = pts[targetIdx].x;
    let tz = pts[targetIdx].z;

    // Slight lane offset
    const lane = Math.sin(this.wander * 0.7) * 2.5;
    const n2 = pts[(targetIdx + 1) % pts.length];
    const ang = Math.atan2(n2.x - tx, n2.z - tz);
    tx += Math.cos(ang) * lane;
    tz += -Math.sin(ang) * lane;

    const pos = car.position;
    const fwd = car.forward;
    const facing = Math.atan2(fwd.x, fwd.z);

    if (this.pickups) {
      const needWeapon = !car.weapon;
      const needArmor = car.armor < 20;
      const needBoost = car.boost < 30;
      const nearest = this.pickups.nearest(pos.x, pos.z);
      if (nearest) {
        const d2 = (nearest.x - pos.x) ** 2 + (nearest.z - pos.z) ** 2;
        const useful =
          ((nearest.type === 'weapon' || nearest.type === 'weapon2') && needWeapon) ||
          (nearest.type === 'armor' && needArmor) ||
          (nearest.type === 'boost' && needBoost) ||
          d2 < 60;
        if (useful && d2 < 350) {
          const blend = 0.4;
          tx = tx * (1 - blend) + nearest.x * blend;
          tz = tz * (1 - blend) + nearest.z * blend;
        }
      }
    }

    let ramTarget = null;
    let bestScore = -1;
    for (const r of this.rivals) {
      if (r === car || !r.alive) continue;
      const dx = r.position.x - pos.x;
      const dz = r.position.z - pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > 500) continue;
      const ahead = dx * fwd.x + dz * fwd.z;
      const score =
        (r.isPlayer ? 1.8 : 1) * this.ramBias * (ahead > -2 ? 1.5 : 0.5) / Math.sqrt(d2 + 1);
      if (score > bestScore) {
        bestScore = score;
        ramTarget = r;
      }
    }

    if (ramTarget && bestScore > 0.06 * (1.2 - this.difficulty * 0.3)) {
      const blend = Math.min(0.85, 0.3 + this.ramBias * 0.5 * this.difficulty);
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
    let steer = clamp(diff * 2.3 + noise, -1, 1);

    let throttle = 0.75 + this.skill * 0.25 + rubber * 0.4;
    for (const r of this.rivals) {
      if (r === car || !r.alive) continue;
      const dx = r.position.x - pos.x;
      const dz = r.position.z - pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 70) {
        if (Math.sin(this.wander * 2.4) > -0.15 || r.isPlayer) {
          steer += Math.sign(dx * fwd.z - dz * fwd.x) * 0.55;
          throttle = 1;
        }
      }
    }

    // Stay on track roughly
    if (!this.track.cfg.derby) {
      const dist = Math.hypot(pos.x, pos.z);
      if (dist < this.track.innerR * 0.7) {
        const out = Math.atan2(pos.x, pos.z);
        let od = out - facing;
        while (od > Math.PI) od -= Math.PI * 2;
        while (od < -Math.PI) od += Math.PI * 2;
        steer += od * 0.8;
      } else if (dist > this.track.outerR * 1.05) {
        const inn = Math.atan2(-pos.x, -pos.z);
        let id = inn - facing;
        while (id > Math.PI) id -= Math.PI * 2;
        while (id < -Math.PI) id += Math.PI * 2;
        steer += id * 0.8;
      }
    }

    const boost =
      car.boost > 10 &&
      ((ramTarget && bestScore > 0.1) || rubber > 0.15 || Math.sin(this.wander) > 0.35) &&
      throttle > 0.4;

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
          if (d2 < 220 && ahead < 0) {
            fire = true;
            this.fireTimer = 1.1 + Math.random();
            break;
          }
        } else if (d2 < 1400 && ahead > -5) {
          fire = true;
          this.fireTimer = 0.65 + Math.random() * 0.5;
          break;
        }
      }
      if (!fire) this.fireTimer = 0.2;
    }

    return {
      throttle: clamp(throttle, -0.2, 1),
      steer: clamp(steer, -1, 1),
      boost,
      fire,
    };
  }
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}
