import * as THREE from 'three';

const CYL = new THREE.CylinderGeometry(0.38, 0.38, 0.32, 8);

/**
 * Cartoon car with style variants: buggy|coupe|tank|rocket|monster|sport|truck|king
 */
export function makeCarMesh(colorHex, accentHex = 0xffffff, style = 'buggy') {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({
    color: colorHex,
    roughness: 0.42,
    metalness: 0.18,
    flatShading: true,
  });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1a1a28, roughness: 0.85, flatShading: true });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x99ddff,
    roughness: 0.15,
    metalness: 0.5,
    flatShading: true,
    transparent: true,
    opacity: 0.85,
  });
  const accentMat = new THREE.MeshStandardMaterial({ color: accentHex, roughness: 0.45, flatShading: true });
  const glowMat = new THREE.MeshStandardMaterial({
    color: 0xffeeaa,
    emissive: 0xffcc44,
    emissiveIntensity: 0.9,
    flatShading: true,
  });
  const archMat = new THREE.MeshStandardMaterial({ color: 0x111118, roughness: 0.9, flatShading: true });

  let bodyW = 1.85, bodyH = 0.52, bodyL = 3.3;
  let cabinY = 1.05, cabinZ = -0.2;
  let wheelScale = 1;
  let hasScoop = true;
  let hasSpoiler = true;
  let fat = 1;

  if (style === 'tank') {
    bodyW = 2.2; bodyH = 0.7; bodyL = 3.4; cabinY = 1.2; hasScoop = false; fat = 1.15;
  } else if (style === 'rocket') {
    bodyW = 1.55; bodyH = 0.42; bodyL = 3.6; hasSpoiler = true; cabinZ = -0.4;
  } else if (style === 'monster') {
    bodyW = 2.0; bodyH = 0.55; bodyL = 3.2; wheelScale = 1.45; cabinY = 1.25;
  } else if (style === 'sport') {
    bodyW = 1.9; bodyH = 0.4; bodyL = 3.5; cabinY = 0.95; hasSpoiler = true;
  } else if (style === 'truck') {
    bodyW = 2.1; bodyH = 0.65; bodyL = 3.6; cabinY = 1.3; cabinZ = 0.3; hasScoop = false;
  } else if (style === 'king') {
    bodyW = 2.0; bodyH = 0.55; bodyL = 3.5; hasSpoiler = true; fat = 1.1;
  } else if (style === 'coupe') {
    bodyW = 1.8; bodyH = 0.48; bodyL = 3.2; cabinY = 1.0;
  }

  const body = new THREE.Mesh(new THREE.BoxGeometry(bodyW, bodyH, bodyL), bodyMat);
  body.position.y = 0.58 * fat;
  body.castShadow = true;
  group.add(body);
  group.userData.bodyMat = bodyMat;
  group.userData.bodyMesh = body;

  if (hasScoop) {
    const scoop = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.9), darkMat);
    scoop.position.set(0, 0.92, 0.7);
    group.add(scoop);
  }

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.78, 0.58, 1.35), bodyMat);
  cabin.position.set(0, cabinY, cabinZ);
  cabin.castShadow = true;
  group.add(cabin);

  const windshield = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.68, 0.4, 0.1), glassMat);
  windshield.position.set(0, cabinY + 0.05, cabinZ + 0.7);
  windshield.rotation.x = -0.25;
  group.add(windshield);

  if (hasSpoiler) {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.9, 0.1, 0.4), accentMat);
    spoiler.position.set(0, 1.35, -bodyL * 0.42);
    group.add(spoiler);
  }

  if (style === 'tank') {
    const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.4, 8), darkMat);
    turret.position.set(0, 1.45, 0);
    group.add(turret);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.4, 6), darkMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 1.5, 0.9);
    group.add(barrel);
  }
  if (style === 'king') {
    const crown = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.5, 5), accentMat);
    crown.position.set(0, 1.7, -0.2);
    group.add(crown);
  }
  if (style === 'truck') {
    const bed = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.95, 0.35, 1.4), darkMat);
    bed.position.set(0, 0.85, -1.1);
    group.add(bed);
  }

  const frontBump = new THREE.Mesh(new THREE.BoxGeometry(bodyW + 0.1, 0.28, 0.32), darkMat);
  frontBump.position.set(0, 0.38, bodyL * 0.48);
  group.add(frontBump);
  group.userData.bumper = frontBump;

  for (const lx of [-bodyW * 0.3, bodyW * 0.3]) {
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 0.08), glowMat);
    light.position.set(lx, 0.55, bodyL * 0.52);
    group.add(light);
  }
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0xff2244, emissive: 0xff0022, emissiveIntensity: 0.7, flatShading: true,
  });
  for (const lx of [-bodyW * 0.3, bodyW * 0.3]) {
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.06), tailMat);
    tl.position.set(lx, 0.55, -bodyL * 0.52);
    group.add(tl);
  }

  const wheels = [];
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xccccdd, roughness: 0.4, metalness: 0.6, flatShading: true });
  const wy = 0.38 * wheelScale;
  const positions = [
    [-bodyW * 0.52, wy, bodyL * 0.32],
    [bodyW * 0.52, wy, bodyL * 0.32],
    [-bodyW * 0.52, wy, -bodyL * 0.32],
    [bodyW * 0.52, wy, -bodyL * 0.32],
  ];
  for (const [x, y, z] of positions) {
    const wheel = new THREE.Mesh(
      wheelScale > 1.2
        ? new THREE.CylinderGeometry(0.5, 0.5, 0.4, 8)
        : CYL,
      darkMat
    );
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, y, z);
    wheel.castShadow = true;
    group.add(wheel);
    wheels.push(wheel);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * wheelScale, 0.18 * wheelScale, 0.34, 6), rimMat);
    rim.rotation.z = Math.PI / 2;
    rim.position.set(x, y, z);
    group.add(rim);
  }

  // Damage overlays (hidden)
  const dentMat = new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.9, flatShading: true });
  const dents = [];
  for (const [x, y, z] of [[0.6, 0.7, 0.5], [-0.55, 0.65, -0.3], [0.3, 0.75, -0.8]]) {
    const d = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.2, 0.4), dentMat);
    d.position.set(x, y, z);
    d.visible = false;
    group.add(d);
    dents.push(d);
  }
  const smokePuff = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 6, 5),
    new THREE.MeshStandardMaterial({ color: 0x555555, transparent: true, opacity: 0.5, flatShading: true })
  );
  smokePuff.position.set(0, 1.4, -1.2);
  smokePuff.visible = false;
  group.add(smokePuff);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1.4 * fat, 16),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.04;
  group.add(shadow);

  const shield = new THREE.Mesh(
    new THREE.SphereGeometry(2.1, 12, 10),
    new THREE.MeshBasicMaterial({
      color: 0x44aaff, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide,
    })
  );
  shield.visible = false;
  group.add(shield);

  group.userData.wheels = wheels;
  group.userData.shadow = shadow;
  group.userData.shield = shield;
  group.userData.dents = dents;
  group.userData.smokePuff = smokePuff;
  group.userData.style = style;
  return group;
}

export function makeCrateMesh() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xc48a3a, roughness: 0.7, flatShading: true });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.25, 1.25), mat);
  mesh.castShadow = true;
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

export function makeBarrelMesh(explosive = true) {
  const mat = new THREE.MeshStandardMaterial({
    color: explosive ? 0xd4452a : 0x4488cc,
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
  g.userData.explosive = explosive;
  return g;
}

export function makeBarrierMesh() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xff8c1a, roughness: 0.6, flatShading: true });
  const stripe = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, flatShading: true });
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
  const mat = new THREE.MeshStandardMaterial({ color: 0x8899aa, roughness: 0.75, flatShading: true });
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
  const colors = { weapon: 0xff3355, weapon2: 0xff66aa, armor: 0x44aaff, boost: 0xffee44 };
  const color = colors[type] || 0xffffff;
  const mat = new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: 0.95, roughness: 0.22, flatShading: true,
  });
  let geo;
  if (type === 'weapon') geo = new THREE.ConeGeometry(0.7, 1.4, 6);
  else if (type === 'weapon2') geo = new THREE.DodecahedronGeometry(0.75, 0);
  else if (type === 'armor') geo = new THREE.IcosahedronGeometry(0.85, 0);
  else geo = new THREE.OctahedronGeometry(0.85, 0);
  const mesh = new THREE.Mesh(geo, mat);
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(1.2, 10, 10),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, depthWrite: false })
  );
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.1, 0.1, 6, 20),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.1 })
  );
  ring.rotation.x = Math.PI / 2;
  const g = new THREE.Group();
  g.add(glow, mesh, ring);
  g.userData.inner = mesh;
  g.userData.ring = ring;
  g.userData.glow = glow;
  return g;
}

export function makeDebrisPiece(color, size = 0.35) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.8, flatShading: true });
  const r = Math.random();
  let geo;
  if (r > 0.66) geo = new THREE.BoxGeometry(size, size * 0.7, size * 0.9);
  else if (r > 0.33) geo = new THREE.TetrahedronGeometry(size * 0.75);
  else geo = new THREE.ConeGeometry(size * 0.5, size, 5);
  return new THREE.Mesh(geo, mat);
}

export function makeRocketMesh() {
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.13, 0.75, 8),
    new THREE.MeshStandardMaterial({ color: 0xff3344, emissive: 0xaa1122, emissiveIntensity: 0.5, flatShading: true })
  );
  body.rotation.x = Math.PI / 2;
  const tip = new THREE.Mesh(
    new THREE.ConeGeometry(0.13, 0.28, 8),
    new THREE.MeshStandardMaterial({ color: 0xffee88, flatShading: true })
  );
  tip.rotation.x = Math.PI / 2;
  tip.position.z = 0.48;
  const g = new THREE.Group();
  g.add(body, tip);
  return g;
}

export function makeMineMesh() {
  const mat = new THREE.MeshStandardMaterial({
    color: 0x222233, emissive: 0xff2200, emissiveIntensity: 0.4, flatShading: true,
  });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), mat);
  const g = new THREE.Group();
  g.add(body);
  return g;
}

export function makeBillboard(w, h, color) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, flatShading: true, side: THREE.DoubleSide });
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
