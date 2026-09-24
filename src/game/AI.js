/**
 * Arcade AI v1.3: block/defend, overtake lines, fair difficulty tiers.
 */
export class AIController {
  constructor(car, track, rivals, pickups, difficulty = 0.7) {
    this.car = car;
    this.track = track;
    this.rivals = rivals;
    this.pickups = pickups || null;
    this.difficulty = difficulty; // 0..1
    this.wpLookahead = 3;
    this.wander = Math.random() * Math.PI * 2;
    this.fireTimer = 0.5 + Math.random();
    this.skill = (0.55 + Math.random() * 0.25) * (0.7 + difficulty * 0.4);
    this.ramBias = 0.35 + Math.random() * 0.45 * difficulty;
    this.targetWp = track.nearestWaypointIndex(car.position.x, car.position.z);
    this._lineBias = (Math.random() - 0.5) * 1.6;
    this._overtakeSide = Math.random() > 0.5 ? 1 : -1;
    this._blockTimer = 0;
    this._defendSide = 1;
    // Tier labels for tuning feel
    this.tier = difficulty < 0.4 ? 'easy' : difficulty < 0.75 ? 'medium' : 'hard';
  }

  update(dt) {
    const car = this.car;
    if (!car.alive) return { throttle: 0, steer: 0, boost: false, fire: false };

    let player = null;
    let playerProg = car.progress;
    for (const r of this.rivals) {
      if (r.isPlayer) {
        player = r;
        playerProg = r.progress;
      }
    }
    const lag = playerProg - car.progress;
    // Fair rubber-band: mild catch-up, soft lead drag (tier-scaled)
    const rbScale = this.tier === 'easy' ? 0.55 : this.tier === 'hard' ? 1.0 : 0.8;
    const rubber = clamp(lag * 0.065 * this.difficulty * rbScale, -0.16, 0.36);

    this.wander += dt * 1.15;
    this._blockTimer = Math.max(0, this._blockTimer - dt);
    const pts = this.track.waypoints;
    const near = this.track.nearestWaypointIndex(car.position.x, car.position.z);

    const look = this._curvatureLookahead(near);
    let targetIdx = (near + look) % pts.length;
    this.targetWp = targetIdx;
    car.wpIndex = near;

    const line = this._racingLinePoint(near, targetIdx);
    let tx = line.x;
    let tz = line.z;

    const lane = this._lineBias + Math.sin(this.wander * 0.55) * 1.2;
    const n2 = pts[(targetIdx + 1) % pts.length];
    const ang = Math.atan2(n2.x - pts[targetIdx].x, n2.z - pts[targetIdx].z);
    const nx = Math.cos(ang);
    const nz = -Math.sin(ang);
    tx += nx * lane * 0.5;
    tz += nz * lane * 0.5;

    const pos = car.position;
    const fwd = car.forward;
    const facing = Math.atan2(fwd.x, fwd.z);
    const right = car.right;

    // --- Pickup detours (useful only) ---
    if (this.pickups) {
      const needWeapon = !car.weapon;
      const needArmor = car.armor < 25;
      const needBoost = car.boost < 35;
      const nearest = this.pickups.nearest(pos.x, pos.z);
      if (nearest) {
        const d2 = (nearest.x - pos.x) ** 2 + (nearest.z - pos.z) ** 2;
        const useful =
          ((nearest.type === 'weapon' || nearest.type === 'weapon2') && needWeapon) ||
          (nearest.type === 'armor' && needArmor) ||
          (nearest.type === 'boost' && needBoost);
        if (useful && d2 < 260) {
          const blend = 0.45;
          tx = tx * (1 - blend) + nearest.x * blend;
          tz = tz * (1 - blend) + nearest.z * blend;
        }
      }
    }

    // --- Classify nearby rivals: ahead (block/defend) vs behind (ignore) vs side (overtake) ---
    let ramTarget = null;
    let bestScore = -1;
    let blockTarget = null; // rival behind us trying to pass
    let overtakeTarget = null; // rival ahead we want to pass

    for (const r of this.rivals) {
      if (r === car || !r.alive) continue;
      const dx = r.position.x - pos.x;
      const dz = r.position.z - pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > 520) continue;
      const ahead = dx * fwd.x + dz * fwd.z;
      const side = dx * right.x + dz * right.z;
      const dist = Math.sqrt(d2);

      // Defend / block: someone close behind, especially player
      if (ahead < -1.5 && ahead > -18 && dist < 16) {
        const threat = (r.isPlayer ? 1.8 : 1) * (1 / (dist + 1));
        if (!blockTarget || threat > blockTarget._threat) {
          blockTarget = r;
          blockTarget._threat = threat;
        }
      }

      // Overtake: rival ahead and slow-ish relative
      if (ahead > 2 && ahead < 28 && dist < 26) {
        const rel = car.speed - (r.speed || 0);
        if (rel > -4) {
          overtakeTarget = r;
          overtakeTarget._side = side;
        }
      }

      const score =
        (r.isPlayer ? 1.5 : 1) * this.ramBias * (ahead > -1 ? 1.35 : 0.35) / (dist + 1);
      if (score > bestScore) {
        bestScore = score;
        ramTarget = r;
      }
    }

    // --- Block / defend: weave to cover the chasing line ---
    if (blockTarget && this.difficulty > 0.35 && this.tier !== 'easy') {
      const dx = blockTarget.position.x - pos.x;
      const dz = blockTarget.position.z - pos.z;
      const chaseSide = Math.sign(dx * right.x + dz * right.z) || this._defendSide;
      this._defendSide = chaseSide;
      // Slide toward their approach side to close the gap
      const blockAmt = (0.35 + this.difficulty * 0.45) * (blockTarget.isPlayer ? 1.15 : 0.85);
      tx += nx * chaseSide * blockAmt * 2.2;
      tz += nz * chaseSide * blockAmt * 2.2;
      this._blockTimer = 0.6;
    }

    // --- Overtake line: pick free side, commit ---
    if (overtakeTarget && !blockTarget && this.difficulty > 0.25) {
      const sideClear = this._pickOvertakeSide(pos, fwd, right, overtakeTarget);
      this._overtakeSide = sideClear;
      const pull = 0.4 + this.skill * 0.35;
      tx += nx * sideClear * pull * 2.8;
      tz += nz * sideClear * pull * 2.8;
      // Slightly more throttle when committed to pass
    }

    // Soft ram only when lined up (less mindless)
    if (ramTarget && bestScore > 0.1 * (1.35 - this.difficulty * 0.3) && this._blockTimer <= 0) {
      const blend = Math.min(0.5, 0.18 + this.ramBias * 0.3 * this.difficulty);
      tx = tx * (1 - blend) + ramTarget.position.x * blend;
      tz = tz * (1 - blend) + ramTarget.position.z * blend;
    }

    const toX = tx - pos.x;
    const toZ = tz - pos.z;
    const desired = Math.atan2(toX, toZ);
    let diff = desired - facing;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;

    const noiseAmp = this.tier === 'easy' ? 0.2 : this.tier === 'hard' ? 0.1 : 0.15;
    const noise = Math.sin(this.wander * 1.9) * (noiseAmp - this.skill * 0.06);
    let steer = clamp(diff * 2.55 + noise, -1, 1);

    const turnSharp = Math.abs(diff);
    let throttle = 0.76 + this.skill * 0.24 + rubber * 0.35;
    if (overtakeTarget) throttle = Math.min(1, throttle + 0.12);
    if (turnSharp > 0.55) throttle *= 0.7 + this.skill * 0.16;
    else if (turnSharp > 0.35) throttle *= 0.87;

    // Separation from packed rivals
    for (const r of this.rivals) {
      if (r === car || !r.alive) continue;
      const dx = r.position.x - pos.x;
      const dz = r.position.z - pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 55) {
        const side = Math.sign(dx * fwd.z - dz * fwd.x) || 1;
        steer += side * 0.42;
        throttle = Math.min(1, throttle + 0.08);
      }
    }

    if (!this.track.cfg.derby) {
      const dist = Math.hypot(pos.x, pos.z);
      if (dist < this.track.innerR * 0.72) {
        const out = Math.atan2(pos.x, pos.z);
        let od = out - facing;
        while (od > Math.PI) od -= Math.PI * 2;
        while (od < -Math.PI) od += Math.PI * 2;
        steer += od * 0.85;
      } else if (dist > this.track.outerR * 1.04) {
        const inn = Math.atan2(-pos.x, -pos.z);
        let id = inn - facing;
        while (id > Math.PI) id -= Math.PI * 2;
        while (id < -Math.PI) id += Math.PI * 2;
        steer += id * 0.85;
      }
    }

    const boost =
      car.boost > 12 &&
      turnSharp < 0.42 &&
      ((overtakeTarget && this.difficulty > 0.4) ||
        (ramTarget && bestScore > 0.12) ||
        rubber > 0.12 ||
        Math.sin(this.wander) > 0.45) &&
      throttle > 0.45;

    this.fireTimer -= dt;
    let fire = false;
    if (car.weapon && this.fireTimer <= 0) {
      fire = this._wantFire(car, fwd, pos);
      if (fire) {
        this.fireTimer =
          car.weapon.type === 'mine' ? 1.0 + Math.random() * 0.6 : 0.55 + Math.random() * 0.45;
      } else {
        this.fireTimer = 0.15;
      }
    }

    return {
      throttle: clamp(throttle, -0.15, 1),
      steer: clamp(steer, -1, 1),
      boost,
      fire,
    };
  }

  _pickOvertakeSide(pos, fwd, right, target) {
    // Prefer the side with more clearance from nearby cars
    let leftClear = 8;
    let rightClear = 8;
    for (const r of this.rivals) {
      if (r === this.car || r === target || !r.alive) continue;
      const dx = r.position.x - pos.x;
      const dz = r.position.z - pos.z;
      const ahead = dx * fwd.x + dz * fwd.z;
      if (ahead < -2 || ahead > 22) continue;
      const side = dx * right.x + dz * right.z;
      const dist = Math.hypot(dx, dz);
      if (side < 0) leftClear = Math.min(leftClear, dist);
      else rightClear = Math.min(rightClear, dist);
    }
    // Also bias away from track center congestion
    if (Math.abs(target._side || 0) > 1.5) {
      return target._side > 0 ? -1 : 1; // go opposite of where they sit
    }
    return leftClear >= rightClear ? -1 : 1;
  }

  _curvatureLookahead(near) {
    const pts = this.track.waypoints;
    const n = pts.length;
    const a = pts[near];
    const b = pts[(near + 2) % n];
    const c = pts[(near + 5) % n];
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const bcx = c.x - b.x;
    const bcz = c.z - b.z;
    const lab = Math.hypot(abx, abz) || 1;
    const lbc = Math.hypot(bcx, bcz) || 1;
    const dot = clamp((abx * bcx + abz * bcz) / (lab * lbc), -1, 1);
    const bend = 1 - dot;
    const bonus = this.tier === 'hard' ? 1 : 0;
    return Math.max(2, Math.min(5, Math.round(5 - bend * 3 + this.skill + bonus)));
  }

  _racingLinePoint(near, targetIdx) {
    const pts = this.track.waypoints;
    const n = pts.length;
    const p = pts[targetIdx];
    const prev = pts[(targetIdx - 2 + n) % n];
    const next = pts[(targetIdx + 2) % n];
    const ix = p.x - prev.x;
    const iz = p.z - prev.z;
    const ox = next.x - p.x;
    const oz = next.z - p.z;
    const cross = ix * oz - iz * ox;
    const tangLen = Math.hypot(ox, oz) || 1;
    const nx = oz / tangLen;
    const nz = -ox / tangLen;
    const apex = clamp(cross * 0.04, -2.2, 2.2);
    return { x: p.x - nx * apex, z: p.z - nz * apex };
  }

  _wantFire(car, fwd, pos) {
    const w = car.weapon;
    for (const r of this.rivals) {
      if (r === car || !r.alive) continue;
      const dx = r.position.x - pos.x;
      const dz = r.position.z - pos.z;
      const d2 = dx * dx + dz * dz;
      const dist = Math.sqrt(d2);
      const ahead = dx * fwd.x + dz * fwd.z;
      const side = Math.abs(dx * fwd.z - dz * fwd.x);
      const aligned = ahead > 0 && side < dist * 0.35;

      if (w.type === 'mine') {
        if (d2 < 280 && ahead < -1) return true;
      } else if (w.type === 'shotgun') {
        if (aligned && dist < 22) return true;
      } else {
        if (aligned && dist < 45 && dist > 4) return true;
        if (r.isPlayer && ahead > 2 && dist < 30 && side < dist * 0.5 && this.difficulty > 0.45) {
          return true;
        }
      }
    }
    return false;
  }
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}
