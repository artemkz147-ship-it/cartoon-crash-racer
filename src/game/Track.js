import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { makeBillboard } from './meshes.js';

/**
 * Cartoon arena: oval with banks, shortcut, ramps, checkpoints, scenery.
 */
export class Track {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.lapCheckpoints = [];
    this.ramps = [];
    this._buildSky();
    this._buildGround();
    this._buildArena();
    this._buildRamps();
    this._buildShortcut();
    this._buildDecor();
    this._buildCheckpoints();
  }

  _buildSky() {
    // Gradient sky dome (vertex colors)
    const geo = new THREE.SphereGeometry(160, 24, 12);
    const cols = [];
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 160;
      // top cyan-blue → horizon peach → bottom greenish
      const t = (y + 1) * 0.5;
      const r = 0.45 + (1 - t) * 0.4;
      const g = 0.65 + t * 0.2;
      const b = 0.95 - (1 - t) * 0.35;
      cols.push(r, g, b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const sky = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false })
    );
    this.scene.add(sky);
  }

  _buildGround() {
    // Checker grass field
    const size = 140;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const cell = 32;
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? '#3aaa4a' : '#2e8a3a';
        ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(8, 8);
    tex.colorSpace = THREE.SRGBColorSpace;

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, flatShading: true })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const groundBody = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(groundBody);

    // Painted asphalt ring with baked lane markings
    const asphaltCanvas = document.createElement('canvas');
    asphaltCanvas.width = 512;
    asphaltCanvas.height = 512;
    const ac = asphaltCanvas.getContext('2d');
    ac.fillStyle = '#3a3a48';
    ac.fillRect(0, 0, 512, 512);
    // noise-ish dots
    for (let i = 0; i < 800; i++) {
      ac.fillStyle = Math.random() > 0.5 ? '#444455' : '#323240';
      ac.fillRect(Math.random() * 512, Math.random() * 512, 3, 3);
    }
    // yellow dashed center (radial approximation as rings of dashes drawn in world instead)
    const asphaltTex = new THREE.CanvasTexture(asphaltCanvas);
    asphaltTex.colorSpace = THREE.SRGBColorSpace;

    const track = new THREE.Mesh(
      new THREE.RingGeometry(17, 39, 72),
      new THREE.MeshStandardMaterial({
        map: asphaltTex,
        color: 0xffffff,
        roughness: 0.88,
        flatShading: true,
      })
    );
    track.rotation.x = -Math.PI / 2;
    track.position.y = 0.02;
    track.receiveShadow = true;
    this.scene.add(track);

    // Lane stripes + white edge lines
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0xffe566, flatShading: true });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true });
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      const r = 28;
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.04, 2.4), stripeMat);
      s.position.set(Math.cos(a) * r, 0.045, Math.sin(a) * r);
      s.rotation.y = -a;
      this.scene.add(s);
    }
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      for (const r of [18.2, 37.8]) {
        const e = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.03, 0.25), whiteMat);
        e.position.set(Math.cos(a) * r, 0.04, Math.sin(a) * r);
        e.rotation.y = -a;
        this.scene.add(e);
      }
    }
  }

  _buildArena() {
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x6ec8ff,
      roughness: 0.7,
      flatShading: true,
    });
    const wallMat2 = new THREE.MeshStandardMaterial({
      color: 0xff7eb0,
      roughness: 0.7,
      flatShading: true,
    });

    // Outer wall with slight bank visual (taller + inward lean feel via height)
    const outerR = 43;
    const segments = 40;
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const next = ((i + 1) / segments) * Math.PI * 2;
      const mid = (a + next) / 2;
      const len = outerR * (next - a) * 1.05;
      // Banked corners: taller on sides
      const bankH = 3.0 + Math.abs(Math.sin(mid * 2)) * 1.4;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(len, bankH, 1.3),
        i % 2 ? wallMat : wallMat2
      );
      mesh.position.set(Math.cos(mid) * outerR, bankH / 2, Math.sin(mid) * outerR);
      mesh.rotation.y = -mid;
      // Slight inward tilt for bank look
      mesh.rotation.z = Math.sin(mid) * 0.08;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);

      const body = new CANNON.Body({ mass: 0 });
      body.addShape(new CANNON.Box(new CANNON.Vec3(len / 2, bankH / 2, 0.65)));
      body.position.set(Math.cos(mid) * outerR, bankH / 2, Math.sin(mid) * outerR);
      body.quaternion.setFromEuler(0, -mid, 0);
      this.world.addBody(body);
    }

    // Inner island
    const innerR = 13.5;
    const islandMat = new THREE.MeshStandardMaterial({
      color: 0x5cb85c,
      roughness: 0.85,
      flatShading: true,
    });
    const island = new THREE.Mesh(new THREE.CylinderGeometry(innerR, innerR, 0.7, 28), islandMat);
    island.position.y = 0.35;
    island.receiveShadow = true;
    this.scene.add(island);

    // Hill mound in center
    const hill = new THREE.Mesh(
      new THREE.SphereGeometry(5, 12, 8),
      new THREE.MeshStandardMaterial({ color: 0x4aa050, flatShading: true })
    );
    hill.position.y = 0.2;
    hill.scale.y = 0.35;
    this.scene.add(hill);

    const palmMat = new THREE.MeshStandardMaterial({ color: 0x2d8a3e, flatShading: true });
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, flatShading: true });
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 2.8, 6), trunkMat);
      trunk.position.set(Math.cos(a) * 5.5, 1.4, Math.sin(a) * 5.5);
      trunk.castShadow = true;
      const leaves = new THREE.Mesh(new THREE.ConeGeometry(1.9, 1.7, 6), palmMat);
      leaves.position.set(Math.cos(a) * 5.5, 3.2, Math.sin(a) * 5.5);
      leaves.castShadow = true;
      this.scene.add(trunk, leaves);
    }

    const innerSeg = 28;
    for (let i = 0; i < innerSeg; i++) {
      const a = (i / innerSeg) * Math.PI * 2;
      const next = ((i + 1) / innerSeg) * Math.PI * 2;
      const mid = (a + next) / 2;
      // Gap for shortcut entrance near angle π (west)
      const gap = Math.abs(((mid + Math.PI) % (Math.PI * 2)) - Math.PI);
      if (gap < 0.35) continue;
      const len = innerR * (next - a) * 1.1;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(len, 2.5, 1.0), wallMat2);
      mesh.position.set(Math.cos(mid) * innerR, 1.25, Math.sin(mid) * innerR);
      mesh.rotation.y = -mid;
      mesh.castShadow = true;
      this.scene.add(mesh);

      const body = new CANNON.Body({ mass: 0 });
      body.addShape(new CANNON.Box(new CANNON.Vec3(len / 2, 1.25, 0.5)));
      body.position.set(Math.cos(mid) * innerR, 1.25, Math.sin(mid) * innerR);
      body.quaternion.setFromEuler(0, -mid, 0);
      this.world.addBody(body);
    }

    // Red/white curbs
    const curbMat = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true });
    const curbMat2 = new THREE.MeshStandardMaterial({ color: 0xff3344, flatShading: true });
    for (let i = 0; i < 56; i++) {
      const a = (i / 56) * Math.PI * 2;
      for (const r of [17.8, 38.5]) {
        const c = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.38, 0.48), i % 2 ? curbMat : curbMat2);
        c.position.set(Math.cos(a) * r, 0.2, Math.sin(a) * r);
        c.rotation.y = -a;
        this.scene.add(c);
      }
    }
  }

  _buildRamps() {
    const rampMat = new THREE.MeshStandardMaterial({
      color: 0xff9944,
      roughness: 0.65,
      flatShading: true,
    });
    const stripe = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.6,
      flatShading: true,
    });

    // Two jump ramps on opposite sides
    const rampDefs = [
      { angle: 0.15, r: 28 },
      { angle: Math.PI + 0.15, r: 28 },
      { angle: Math.PI / 2 + 0.4, r: 32 },
    ];
    for (const rd of rampDefs) {
      const group = new THREE.Group();
      const ramp = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.35, 6), rampMat);
      ramp.rotation.x = -0.28;
      ramp.position.y = 0.55;
      ramp.castShadow = true;
      group.add(ramp);
      const stripeMesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.36, 5.5), stripe);
      stripeMesh.rotation.x = -0.28;
      stripeMesh.position.set(0, 0.58, 0);
      group.add(stripeMesh);

      const fx = -Math.sin(rd.angle);
      const fz = Math.cos(rd.angle);
      group.position.set(Math.cos(rd.angle) * rd.r, 0, Math.sin(rd.angle) * rd.r);
      group.rotation.y = -rd.angle + Math.PI / 2;
      this.scene.add(group);

      // Physics: tilted box
      const body = new CANNON.Body({ mass: 0 });
      body.addShape(new CANNON.Box(new CANNON.Vec3(2.25, 0.2, 3)));
      body.position.set(group.position.x, 0.7, group.position.z);
      body.quaternion.setFromEuler(-0.28, -rd.angle + Math.PI / 2, 0);
      this.world.addBody(body);

      this.ramps.push({
        x: group.position.x,
        z: group.position.z,
        fx,
        fz,
        boost: 14,
      });
    }
  }

  _buildShortcut() {
    // Shortcut path through island gap — marked with chevrons
    const pathMat = new THREE.MeshStandardMaterial({
      color: 0x4a4a58,
      roughness: 0.9,
      flatShading: true,
    });
    const path = new THREE.Mesh(new THREE.BoxGeometry(8, 0.05, 14), pathMat);
    path.position.set(-8, 0.03, 0);
    path.rotation.y = 0.2;
    this.scene.add(path);

    const chevMat = new THREE.MeshStandardMaterial({ color: 0x44ffaa, flatShading: true });
    for (let i = 0; i < 5; i++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.9, 3), chevMat);
      c.rotation.x = Math.PI / 2;
      c.position.set(-6 - i * 1.5, 0.15, (i - 2) * 0.3);
      this.scene.add(c);
    }
  }

  _buildDecor() {
    // Clouds
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 1,
      flatShading: true,
      transparent: true,
      opacity: 0.9,
    });
    for (let i = 0; i < 10; i++) {
      const cloud = new THREE.Group();
      for (let j = 0; j < 4; j++) {
        const p = new THREE.Mesh(
          new THREE.BoxGeometry(3.5 + Math.random() * 3, 1.4, 2.2),
          cloudMat
        );
        p.position.set(j * 2.2 - 2.5, Math.random() * 0.6, (Math.random() - 0.5) * 2);
        cloud.add(p);
      }
      const a = (i / 10) * Math.PI * 2;
      cloud.position.set(Math.cos(a) * 55, 16 + Math.random() * 10, Math.sin(a) * 55);
      this.scene.add(cloud);
    }

    // Billboard scenery outside outer wall
    const colors = [0xff4466, 0x44aaff, 0xffee44, 0x66ff99, 0xff88cc];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.2;
      const bb = makeBillboard(5 + (i % 3), 3 + (i % 2), colors[i % colors.length]);
      bb.position.set(Math.cos(a) * 52, 4, Math.sin(a) * 52);
      bb.lookAt(0, 4, 0);
      this.scene.add(bb);
    }

    // Cartoon buildings in distance
    const bMat = [
      new THREE.MeshStandardMaterial({ color: 0xff8899, flatShading: true }),
      new THREE.MeshStandardMaterial({ color: 0x88aaff, flatShading: true }),
      new THREE.MeshStandardMaterial({ color: 0xffcc66, flatShading: true }),
    ];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const h = 6 + (i % 4) * 3;
      const b = new THREE.Mesh(new THREE.BoxGeometry(4, h, 4), bMat[i % 3]);
      b.position.set(Math.cos(a) * 65, h / 2, Math.sin(a) * 65);
      this.scene.add(b);
    }
  }

  _buildCheckpoints() {
    // 8 sectors for more reliable lap detection
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      this.lapCheckpoints.push({
        index: i,
        angle: a,
        x: Math.cos(a) * 28,
        z: Math.sin(a) * 28,
      });
      // Visual gate posts at start/finish (index 0)
      if (i === 0) {
        const postMat = new THREE.MeshStandardMaterial({
          color: 0xffe566,
          emissive: 0xffaa22,
          emissiveIntensity: 0.4,
          flatShading: true,
        });
        for (const side of [-1, 1]) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4, 0.4), postMat);
          post.position.set(Math.cos(a) * 28 + Math.cos(a + Math.PI / 2) * side * 8, 2, Math.sin(a) * 28 + Math.sin(a + Math.PI / 2) * side * 8);
          this.scene.add(post);
        }
        const banner = new THREE.Mesh(
          new THREE.BoxGeometry(16, 0.8, 0.2),
          new THREE.MeshStandardMaterial({ color: 0xff3344, flatShading: true })
        );
        banner.position.set(Math.cos(a) * 28, 4.2, Math.sin(a) * 28);
        banner.rotation.y = -a;
        this.scene.add(banner);
      }
    }
  }

  /** Apply ramp boost if car is on a ramp. */
  checkRamps(car) {
    if (!car.alive) return;
    const pos = car.position;
    for (const r of this.ramps) {
      const dx = pos.x - r.x;
      const dz = pos.z - r.z;
      if (dx * dx + dz * dz < 16) {
        const spd = car.body.velocity.length();
        if (spd > 8 && car.body.velocity.y < 5) {
          car.body.velocity.y += r.boost * 0.08;
          car.body.velocity.x += r.fx * 2;
          car.body.velocity.z += r.fz * 2;
        }
      }
    }
  }

  getPointOnTrack(angle, radius = 28) {
    return {
      x: Math.cos(angle) * radius,
      z: Math.sin(angle) * radius,
      angle,
    };
  }

  getSpawn(index, total = 3) {
    const angle = -Math.PI / 2;
    const r = 28;
    const fx = -Math.sin(angle);
    const fz = Math.cos(angle);
    const rx = fz;
    const rz = -fx;
    const lane = (index - (total - 1) / 2) * 3.2;
    const back = index * 4.5;
    return {
      px: Math.cos(angle) * r + fx * (-back) + rx * lane,
      pz: Math.sin(angle) * r + fz * (-back) + rz * lane,
      facing: Math.atan2(fx, fz),
    };
  }
}
