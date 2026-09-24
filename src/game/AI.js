/**
 * Arcade AI v1.2: racing-line lookahead, softer rubber-band, smarter weapons.
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
    this.ramBias = 0.35 + Math.random() * 0.45 * difficulty;
    this.targetWp = track.nearestWaypointIndex(car.position.x, car.position.z);
    this._lineBias = (Math.random() - 0.5) * 1.6; // preferred lane offset
  }

  update(dt) {
    const car = this.car;
    if (!car.alive) return { throttle: 0, steer: 0, boost: false, fire: false };

    let playerProg = car.progress;
    for (const r of this.rivals) {
      if (r.isPlayer) playerProg = r.progress;
    }
    const lag = playerProg - car.progress;
    // Softer rubber-band: catch-up without teleport feel; cap lead drag lightly
    const rubber = clamp(lag * 0.07 * this.difficulty, -0.18, 0.38);

    this.wander += dt * 1.2;
    const pts = this.track.waypoints;
    const near = this.track.nearestWaypointIndex(car.position.x, car.position.z);

    // Curvature-aware lookahead: look further on straights, shorter into bends
    const look = this._curvatureLookahead(near);
    let targetIdx = (near + look) % pts.length;
    if ((targetIdx - near + pts.length) % pts.length > pts.length * 0.55) {
      targetIdx = (near + look) % pts.length;
    }
    this.targetWp = targetIdx;
    car.wpIndex = near;

    // Racing line: blend toward apex (inside on entry) then unwind
    const line = this._racingLinePoint(near, targetIdx);
    let tx = line.x;
    let tz = line.z;

    // Mild preferred lane + wander (not drunk)
    const lane = this._lineBias + Math.sin(this.wander * 0.55) * 1.4;
    const n2 = pts[(targetIdx + 1) % pts.length];
    const ang = Math.atan2(n2.x - pts[targetIdx].x, n2.z - pts[targetIdx].z);
    tx += Math.cos(ang) * lane * 0.55;
    tz += -Math.sin(ang) * lane * 0.55;

    const pos = car.position;
    const fwd = car.forward;
    const facing = Math.atan2(fwd.x, fwd.z);

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
        // Only detour if truly useful and close
        if (useful && d2 < 280) {
          const blend = 0.5;
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
      if (d2 > 420) continue;
      const ahead = dx * fwd.x + dz * fwd.z;
      const score =
        (r.isPlayer ? 1.6 : 1) * this.ramBias * (ahead > -1 ? 1.4 : 0.4) / Math.sqrt(d2 + 1);
      if (score > bestScore) {
        bestScore = score;
        ramTarget = r;
      }
    }

    // Less mindless ramming — only when lined up or player is close ahead
    if (ramTarget && bestScore > 0.09 * (1.3 - this.difficulty * 0.25)) {
      const blend = Math.min(0.55, 0.2 + this.ramBias * 0.35 * this.difficulty);
      tx = tx * (1 - blend) + ramTarget.position.x * blend;
      tz = tz * (1 - blend) + ramTarget.position.z * blend;
    }

    const toX = tx - pos.x;
    const toZ = tz - pos.z;
    const desired = Math.atan2(toX, toZ);
    let diff = desired - facing;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;

    const noise = Math.sin(this.wander * 1.9) * (0.16 - this.skill * 0.08);
    let steer = clamp(diff * 2.5 + noise, -1, 1);

    // Throttle: ease off into sharp turns
    const turnSharp = Math.abs(diff);
    let throttle = 0.78 + this.skill * 0.22 + rubber * 0.35;
    if (turnSharp > 0.55) throttle *= 0.72 + this.skill * 0.15;
    else if (turnSharp > 0.35) throttle *= 0.88;

    for (const r of this.rivals) {
      if (r === car || !r.alive) continue;
      const dx = r.position.x - pos.x;
      const dz = r.position.z - pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 55) {
        const side = Math.sign(dx * fwd.z - dz * fwd.x) || 1;
        steer += side * 0.45;
        throttle = Math.min(1, throttle + 0.1);
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
      turnSharp < 0.45 &&
      ((ramTarget && bestScore > 0.12) || rubber > 0.12 || Math.sin(this.wander) > 0.4) &&
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
    const bend = 1 - dot; // 0 straight, ~2 hairpin
    // 2..5 waypoints ahead
    return Math.max(2, Math.min(5, Math.round(5 - bend * 3 + this.skill)));
  }

  _racingLinePoint(near, targetIdx) {
    const pts = this.track.waypoints;
    const n = pts.length;
    const p = pts[targetIdx];
    // Estimate corner: cross product of incoming/outgoing
    const prev = pts[(targetIdx - 2 + n) % n];
    const next = pts[(targetIdx + 2) % n];
    const ix = p.x - prev.x;
    const iz = p.z - prev.z;
    const ox = next.x - p.x;
    const oz = next.z - p.z;
    const cross = ix * oz - iz * ox; // signed turn
    const tangLen = Math.hypot(ox, oz) || 1;
    const nx = oz / tangLen;
    const nz = -ox / tangLen;
    // Bias toward inside of corner (apex)
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
      const aligned = ahead > 0 && side < dist * 0.35; // roughly in cone

      if (w.type === 'mine') {
        // Drop when someone is behind and closing
        if (d2 < 280 && ahead < -1) return true;
      } else if (w.type === 'shotgun') {
        if (aligned && dist < 22) return true;
      } else {
        // Rocket: fire when target is ahead in cone, not random spray
        if (aligned && dist < 45 && dist > 4) return true;
        // Also fire at nearby player even if slightly off if difficulty high
        if (r.isPlayer && ahead > 2 && dist < 30 && side < dist * 0.5) return true;
      }
    }
    return false;
  }
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}
