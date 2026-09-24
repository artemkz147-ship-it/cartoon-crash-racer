import * as THREE from 'three';

// Shared low-poly geos for reuse
const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(0.38, 0.38, 0.32, 8);
const SPHERE_SM = new THREE.SphereGeometry(0.2, 6, 5);

export function makeCarMesh(colorHex, accentHex = 0xffffff) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({
    color: colorHex,
    roughness: 0.42,
    metalness: 0.18,
    flatShading: true,
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x1a1a28,
    roughness: 0.85,
    flatShading: true,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x99ddff,
    roughness: 0.15,
    metalness: 0.5,
    flatShading: true,
    transparent: true,
    opacity: 0.85,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: accentHex,
    roughness: 0.45,
    flatShading: true,
  });
  const glowMat = new THREE.MeshStandardMaterial({
    color: 0xffeeaa,
    emissive: 0xffcc44,
    emissiveIntensity: 0.9,
    flatShading: true,
  });
  const archMat = new THREE.MeshStandardMaterial({
    color: 0x111118,
    roughness: 0.9,
    flatShading: true,
  });

  // Main body
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.52, 3.3), bodyMat);
  body.position.y = 0.58;
  body.castShadow = true;
  group.add(body);

  // Hood scoop
  const scoop = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.9), darkMat);
  scoop.position.set(0, 0.92, 0.7);
  group.add(scoop);

  // Cabin
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.58, 1.35), bodyMat);
  cabin.position.set(0, 1.05, -0.2);
  cabin.castShadow = true;
  group.add(cabin);

  // Windshield + rear glass
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.4, 0.1), glassMat);
  windshield.position.set(0, 1.1, 0.5);
  windshield.rotation.x = -0.25;
  group.add(windshield);
  const rearGlass = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.35, 0.08), glassMat);
  rearGlass.position.set(0, 1.08, -0.85);
  group.add(rearGlass);

  // Spoiler with posts
  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.1, 0.4), accentMat);
  spoiler.position.set(0, 1.35, -1.4);
  group.add(spoiler);
  for (const sx of [-0.55, 0.55]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.35, 0.08), darkMat);
    post.position.set(sx, 1.15, -1.35);
    group.add(post);
  }

  // Bumpers
  const frontBump = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.28, 0.32), darkMat);
  frontBump.position.set(0, 0.38, 1.6);
  group.add(frontBump);
  const rearBump = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.28, 0.28), darkMat);
  rearBump.position.set(0, 0.36, -1.6);
  group.add(rearBump);

  // Headlights (glow)
  for (const lx of [-0.55, 0.55]) {
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 0.08), glowMat);
    light.position.set(lx, 0.55, 1.72);
    group.add(light);
  }
  // Taillights
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0xff2244,
    emissive: 0xff0022,
    emissiveIntensity: 0.7,
    flatShading: true,
  });
  for (const lx of [-0.55, 0.55]) {
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.06), tailMat);
    tl.position.set(lx, 0.55, -1.72);
    group.add(tl);
  }

  // Wheel arches
  const arches = [
    [-0.95, 0.45, 1.05],
    [0.95, 0.45, 1.05],
    [-0.95, 0.45, -1.05],
    [0.95, 0.45, -1.05],
  ];
  for (const [x, y, z] of arches) {
    const arch = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.7), archMat);
    arch.position.set(x, y, z);
    group.add(arch);
  }

  // Wheels
  const wheels = [];
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0xccccdd,
    roughness: 0.4,
    metalness: 0.6,
    flatShading: true,
  });
  const positions = [
    [-0.98, 0.38, 1.05],
    [0.98, 0.38, 1.05],
    [-0.98, 0.38, -1.05],
    [0.98, 0.38, -1.05],
  ];
  for (const [x, y, z] of positions) {
    const wheel = new THREE.Mesh(CYL, darkMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, y, z);
    wheel.castShadow = true;
    group.add(wheel);
    wheels.push(wheel);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.34, 6), rimMat);
    rim.rotation.z = Math.PI / 2;
    rim.position.set(x, y, z);
    group.add(rim);
  }

  // Fake soft shadow blob
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1.4, 16),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.04;
  group.add(shadow);

  // Armor shield (hidden by default)
  const shield = new THREE.Mesh(
    new THREE.SphereGeometry(2.1, 12, 10),
    new THREE.MeshBasicMaterial({
      color: 0x44aaff,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  shield.visible = false;
  group.add(shield);

  group.userData.wheels = wheels;
  group.userData.shadow = shadow;
  group.userData.shield = shield;
  group.userData.headlights = glowMat;
  return group;
}

export function makeCrateMesh() {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xc48a3a,
    roughness: 0.7,
    flatShading: true,
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.25, 1.25), mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const band = new THREE.Mesh(
    new THREE.BoxGeometry(1.28, 0.12, 1.28),
    new THREE.MeshStandardMaterial({ color: 0x5a3a12, flatShading: true })
  );
  band.position.y = 0.15;
  const label = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.5, 0.04),
    new THREE.MeshStandardMaterial({ color: 0xffe566, flatShading: true })
  );
  label.position.set(0, 0.2, 0.64);
  const g = new THREE.Group();
  g.add(mesh, band, label);
  return g;
}

export function makeBarrelMesh() {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xd4452a,
    roughness: 0.55,
    flatShading: true,
  });
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.52, 1.15, 10), mat);
  mesh.castShadow = true;
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(0.54, 0.54, 0.14, 10),
    new THREE.MeshStandardMaterial({ color: 0xffe566, flatShading: true })
  );
  band.position.y = 0.2;
  const skull = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.3, 0.05),
    new THREE.MeshStandardMaterial({ color: 0x111111, flatShading: true })
  );
  skull.position.set(0, 0.15, 0.5);
  const g = new THREE.Group();
  g.add(mesh, band, skull);
  return g;
}

export function makeBarrierMesh() {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xff8c1a,
    roughness: 0.6,
    flatShading: true,
  });
  const stripe = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.6,
    flatShading: true,
  });
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.95, 0.58), mat);
  body.castShadow = true;
  g.add(body);
  const s1 = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.97, 0.6), stripe);
  s1.position.x = -0.65;
  const s2 = s1.clone();
  s2.position.x = 0.65;
  g.add(s1, s2);
  return g;
}

export function makeWallBreakableMesh() {
  const mat = new THREE.MeshStandardMaterial({
    color: 0x8899aa,
    roughness: 0.75,
    flatShading: true,
  });
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.0, 0.6), mat);
  body.castShadow = true;
  g.add(body);
  const crack = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 1.6, 0.62),
    new THREE.MeshStandardMaterial({ color: 0x334455, flatShading: true })
  );
  g.add(crack);
  return g;
}

export function makePickupMesh(type) {
  const colors = {
    weapon: 0xff3355,
    weapon2: 0xff66aa,
    armor: 0x44aaff,
    boost: 0xffee44,
  };
  const color = colors[type] || 0xffffff;
  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.95,
    roughness: 0.22,
    flatShading: true,
  });
  let geo;
  if (type === 'weapon') geo = new THREE.ConeGeometry(0.7, 1.4, 6);
  else if (type === 'weapon2') geo = new THREE.DodecahedronGeometry(0.75, 0);
  else if (type === 'armor') geo = new THREE.IcosahedronGeometry(0.85, 0);
  else geo = new THREE.OctahedronGeometry(0.85, 0);

  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;

  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(1.2, 10, 10),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
    })
  );

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.1, 0.1, 6, 20),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 1.1,
    })
  );
  ring.rotation.x = Math.PI / 2;

  const ring2 = ring.clone();
  ring2.scale.setScalar(0.75);
  ring2.rotation.x = Math.PI / 3;

  const disk = new THREE.Mesh(
    new THREE.CircleGeometry(1.4, 16),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  disk.rotation.x = -Math.PI / 2;
  disk.position.y = -0.6;

  // Icon hint: letter-like block
  const iconMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  let icon;
  if (type === 'weapon' || type === 'weapon2') {
    icon = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.5, 4), iconMat);
  } else if (type === 'armor') {
    icon = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.4, 0.15), iconMat);
  } else {
    icon = new THREE.Mesh(new THREE.OctahedronGeometry(0.28), iconMat);
  }
  icon.position.y = 1.5;

  const g = new THREE.Group();
  g.add(glow, mesh, ring, ring2, disk, icon);
  g.userData.inner = mesh;
  g.userData.ring = ring;
  g.userData.ring2 = ring2;
  g.userData.glow = glow;
  g.userData.icon = icon;
  return g;
}

export function makeDebrisPiece(color, size = 0.35) {
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.8,
    flatShading: true,
  });
  const r = Math.random();
  let geo;
  if (r > 0.66) geo = new THREE.BoxGeometry(size, size * 0.7, size * 0.9);
  else if (r > 0.33) geo = new THREE.TetrahedronGeometry(size * 0.75);
  else geo = new THREE.ConeGeometry(size * 0.5, size, 5);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  return mesh;
}

export function makeRocketMesh() {
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.13, 0.75, 8),
    new THREE.MeshStandardMaterial({
      color: 0xff3344,
      emissive: 0xaa1122,
      emissiveIntensity: 0.5,
      flatShading: true,
    })
  );
  body.rotation.x = Math.PI / 2;
  const tip = new THREE.Mesh(
    new THREE.ConeGeometry(0.13, 0.28, 8),
    new THREE.MeshStandardMaterial({ color: 0xffee88, flatShading: true })
  );
  tip.rotation.x = Math.PI / 2;
  tip.position.z = 0.48;
  const finMat = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true });
  const g = new THREE.Group();
  g.add(body, tip);
  for (let i = 0; i < 3; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 0.18), finMat);
    const a = (i / 3) * Math.PI * 2;
    fin.position.set(Math.cos(a) * 0.12, Math.sin(a) * 0.12, -0.25);
    g.add(fin);
  }
  return g;
}

export function makeMineMesh() {
  const mat = new THREE.MeshStandardMaterial({
    color: 0x222233,
    emissive: 0xff2200,
    emissiveIntensity: 0.4,
    flatShading: true,
  });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), mat);
  const spikeMat = new THREE.MeshStandardMaterial({ color: 0xff4422, flatShading: true });
  const g = new THREE.Group();
  g.add(body);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const s = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.25, 4), spikeMat);
    s.position.set(Math.cos(a) * 0.35, 0.05, Math.sin(a) * 0.35);
    s.rotation.z = -Math.PI / 2;
    s.rotation.y = -a;
    g.add(s);
  }
  return g;
}

export function makeBillboard(w, h, color) {
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.6,
    flatShading: true,
    side: THREE.DoubleSide,
  });
  const board = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  const post = new THREE.Mesh(
    new THREE.BoxGeometry(0.25, h * 0.7, 0.25),
    new THREE.MeshStandardMaterial({ color: 0x555566, flatShading: true })
  );
  post.position.y = -h * 0.35;
  const g = new THREE.Group();
  g.add(board, post);
  return g;
}

export { BOX, SPHERE_SM };
