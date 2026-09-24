import * as THREE from 'three';
import * as CANNON from 'cannon-es';

/** Oval arena with inner island and outer walls. */
export class Track {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.lapCheckpoints = [];
    this._buildGround();
    this._buildArena();
    this._buildDecor();
    this._buildCheckpoints();
  }

  _buildGround() {
    const size = 120;
    const groundGeo = new THREE.PlaneGeometry(size, size, 1, 1);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x3a9a4a,
      roughness: 0.95,
      flatShading: true,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const groundBody = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Plane(),
    });
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(groundBody);

    // Asphalt track ring (visual)
    const trackMat = new THREE.MeshStandardMaterial({
      color: 0x3a3a48,
      roughness: 0.9,
      flatShading: true,
    });
    const track = new THREE.Mesh(new THREE.RingGeometry(18, 38, 64), trackMat);
    track.rotation.x = -Math.PI / 2;
    track.position.y = 0.02;
    track.receiveShadow = true;
    this.scene.add(track);

    // Lane stripes
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0xffe566, flatShading: true });
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const r = 28;
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 2.2), stripeMat);
      s.position.set(Math.cos(a) * r, 0.04, Math.sin(a) * r);
      s.rotation.y = -a;
      this.scene.add(s);
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

    // Outer circular wall (approx with boxes)
    const outerR = 42;
    const segments = 36;
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const next = ((i + 1) / segments) * Math.PI * 2;
      const mid = (a + next) / 2;
      const len = outerR * (next - a) * 1.05;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(len, 3.2, 1.2), i % 2 ? wallMat : wallMat2);
      mesh.position.set(Math.cos(mid) * outerR, 1.6, Math.sin(mid) * outerR);
      mesh.rotation.y = -mid;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);

      const body = new CANNON.Body({ mass: 0 });
      body.addShape(new CANNON.Box(new CANNON.Vec3(len / 2, 1.6, 0.6)));
      body.position.set(Math.cos(mid) * outerR, 1.6, Math.sin(mid) * outerR);
      body.quaternion.setFromEuler(0, -mid, 0);
      this.world.addBody(body);
    }

    // Inner island wall
    const innerR = 14;
    const innerSeg = 24;
    const islandMat = new THREE.MeshStandardMaterial({
      color: 0x5cb85c,
      roughness: 0.85,
      flatShading: true,
    });
    const island = new THREE.Mesh(new THREE.CylinderGeometry(innerR, innerR, 0.6, 24), islandMat);
    island.position.y = 0.3;
    island.receiveShadow = true;
    this.scene.add(island);

    const palmMat = new THREE.MeshStandardMaterial({ color: 0x2d8a3e, flatShading: true });
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, flatShading: true });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 2.5, 6), trunkMat);
      trunk.position.set(Math.cos(a) * 6, 1.25, Math.sin(a) * 6);
      trunk.castShadow = true;
      const leaves = new THREE.Mesh(new THREE.ConeGeometry(1.8, 1.6, 6), palmMat);
      leaves.position.set(Math.cos(a) * 6, 3.0, Math.sin(a) * 6);
      leaves.castShadow = true;
      this.scene.add(trunk, leaves);
    }

    for (let i = 0; i < innerSeg; i++) {
      const a = (i / innerSeg) * Math.PI * 2;
      const next = ((i + 1) / innerSeg) * Math.PI * 2;
      const mid = (a + next) / 2;
      const len = innerR * (next - a) * 1.1;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(len, 2.4, 1.0), wallMat2);
      mesh.position.set(Math.cos(mid) * innerR, 1.2, Math.sin(mid) * innerR);
      mesh.rotation.y = -mid;
      mesh.castShadow = true;
      this.scene.add(mesh);

      const body = new CANNON.Body({ mass: 0 });
      body.addShape(new CANNON.Box(new CANNON.Vec3(len / 2, 1.2, 0.5)));
      body.position.set(Math.cos(mid) * innerR, 1.2, Math.sin(mid) * innerR);
      body.quaternion.setFromEuler(0, -mid, 0);
      this.world.addBody(body);
    }

    // Soft curb blocks along track edges (visual + light collision)
    const curbMat = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true });
    const curbMat2 = new THREE.MeshStandardMaterial({ color: 0xff3344, flatShading: true });
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      for (const r of [18.5, 37.5]) {
        const c = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.35, 0.5), i % 2 ? curbMat : curbMat2);
        c.position.set(Math.cos(a) * r, 0.18, Math.sin(a) * r);
        c.rotation.y = -a;
        this.scene.add(c);
      }
    }
  }

  _buildDecor() {
    // Sky-ish fog already in Game; add some clouds as flat boxes
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 1,
      flatShading: true,
      transparent: true,
      opacity: 0.85,
    });
    for (let i = 0; i < 8; i++) {
      const cloud = new THREE.Group();
      for (let j = 0; j < 3; j++) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(4 + Math.random() * 3, 1.5, 2.5), cloudMat);
        p.position.set(j * 2.5 - 2.5, Math.random() * 0.5, (Math.random() - 0.5) * 2);
        cloud.add(p);
      }
      const a = Math.random() * Math.PI * 2;
      cloud.position.set(Math.cos(a) * 50, 18 + Math.random() * 8, Math.sin(a) * 50);
      this.scene.add(cloud);
    }
  }

  _buildCheckpoints() {
    // 4 sectors around the oval for lap detection
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 - Math.PI / 2;
      this.lapCheckpoints.push({
        index: i,
        angle: a,
        x: Math.cos(a) * 28,
        z: Math.sin(a) * 28,
      });
    }
  }

  /** Preferred racing radius and angle helpers for AI / spawn. */
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
    // tangent forward (counter-clockwise on XZ)
    const fx = -Math.sin(angle);
    const fz = Math.cos(angle);
    // lateral (right relative to forward)
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
