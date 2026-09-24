import * as THREE from 'three';

/**
 * Lightweight pooled particle FX for mobile: dust, sparks, explosions, skids, trails.
 */
const MAX_PARTICLES = 180;
const MAX_SKIDS = 48;
const MAX_TRAILS = 40;

export class Particles {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
    this.active = [];
    this.skids = [];
    this.trails = [];

    const geo = new THREE.SphereGeometry(0.25, 5, 4);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });

    for (let i = 0; i < MAX_PARTICLES; i++) {
      const m = new THREE.Mesh(geo, mat.clone());
      m.visible = false;
      scene.add(m);
      this.pool.push(m);
    }

    // Shared skid mark geometry (flat quads)
    this._skidGeo = new THREE.PlaneGeometry(0.35, 1.1);
    this._skidMat = new THREE.MeshBasicMaterial({
      color: 0x1a1a22,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }

  _alloc() {
    return this.pool.pop() || null;
  }

  _free(mesh) {
    mesh.visible = false;
    this.pool.push(mesh);
  }

  burst(x, y, z, opts = {}) {
    const {
      count = 10,
      color = 0xffaa44,
      speed = 8,
      life = 0.6,
      size = 0.4,
      gravity = 12,
      upward = 4,
    } = opts;
    for (let i = 0; i < count; i++) {
      const m = this._alloc();
      if (!m) break;
      m.visible = true;
      m.position.set(x, y, z);
      m.scale.setScalar(size * (0.5 + Math.random()));
      m.material.color.setHex(color);
      m.material.opacity = 0.95;
      const vx = (Math.random() - 0.5) * speed;
      const vy = upward + Math.random() * speed * 0.5;
      const vz = (Math.random() - 0.5) * speed;
      this.active.push({
        mesh: m,
        vx, vy, vz,
        life: life * (0.6 + Math.random() * 0.6),
        maxLife: life,
        gravity,
        drag: 1.8,
      });
    }
  }

  dust(x, z, intensity = 1) {
    this.burst(x, 0.2, z, {
      count: Math.min(6, 2 + Math.floor(intensity * 4)),
      color: 0xc4b89a,
      speed: 3 + intensity * 2,
      life: 0.45,
      size: 0.5,
      gravity: 2,
      upward: 1.2,
    });
  }

  smoke(x, y, z) {
    this.burst(x, y, z, {
      count: 3,
      color: 0x8899aa,
      speed: 2,
      life: 0.7,
      size: 0.7,
      gravity: -1.5,
      upward: 2,
    });
  }

  sparks(x, y, z, count = 12) {
    this.burst(x, y, z, {
      count,
      color: 0xffee66,
      speed: 14,
      life: 0.4,
      size: 0.22,
      gravity: 18,
      upward: 6,
    });
  }

  explosion(x, y, z, scale = 1) {
    this.burst(x, y, z, {
      count: Math.floor(14 * scale),
      color: 0xff6622,
      speed: 12 * scale,
      life: 0.7,
      size: 0.55 * scale,
      gravity: 8,
      upward: 8,
    });
    this.burst(x, y + 0.5, z, {
      count: Math.floor(8 * scale),
      color: 0xffee88,
      speed: 6,
      life: 0.45,
      size: 0.35,
      gravity: 4,
      upward: 5,
    });
  }

  skidMark(x, z, yaw) {
    if (this.skids.length >= MAX_SKIDS) {
      const old = this.skids.shift();
      this.scene.remove(old.mesh);
      old.mesh.geometry.dispose();
    }
    const mesh = new THREE.Mesh(this._skidGeo, this._skidMat.clone());
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = -yaw;
    mesh.position.set(x, 0.03, z);
    this.scene.add(mesh);
    this.skids.push({ mesh, life: 2.8 });
  }

  boostTrail(x, y, z, color = 0xffee44) {
    if (this.trails.length >= MAX_TRAILS) {
      const old = this.trails.shift();
      this._free(old.mesh);
    }
    const m = this._alloc();
    if (!m) return;
    m.visible = true;
    m.position.set(x, y, z);
    m.scale.setScalar(0.55);
    m.material.color.setHex(color);
    m.material.opacity = 0.85;
    this.trails.push({ mesh: m, life: 0.35 });
  }

  rocketTrail(x, y, z) {
    this.burst(x, y, z, {
      count: 2,
      color: 0xff8844,
      speed: 1.5,
      life: 0.28,
      size: 0.3,
      gravity: -2,
      upward: 0.5,
    });
  }

  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      p.life -= dt;
      p.vy -= p.gravity * dt;
      p.vx *= 1 - p.drag * dt;
      p.vz *= 1 - p.drag * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      const t = Math.max(0, p.life / p.maxLife);
      p.mesh.material.opacity = t * 0.9;
      p.mesh.scale.multiplyScalar(1 + dt * 0.8);
      if (p.life <= 0 || p.mesh.position.y < -1) {
        this._free(p.mesh);
        this.active.splice(i, 1);
      }
    }

    for (let i = this.skids.length - 1; i >= 0; i--) {
      const s = this.skids[i];
      s.life -= dt;
      s.mesh.material.opacity = Math.max(0, (s.life / 2.8) * 0.55);
      if (s.life <= 0) {
        this.scene.remove(s.mesh);
        s.mesh.geometry.dispose();
        s.mesh.material.dispose();
        this.skids.splice(i, 1);
      }
    }

    for (let i = this.trails.length - 1; i >= 0; i--) {
      const t = this.trails[i];
      t.life -= dt;
      t.mesh.material.opacity = Math.max(0, t.life / 0.35);
      t.mesh.scale.multiplyScalar(1 + dt * 2);
      if (t.life <= 0) {
        this._free(t.mesh);
        this.trails.splice(i, 1);
      }
    }
  }
}
