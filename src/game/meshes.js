import * as THREE from 'three';

const CYL = new THREE.CylinderGeometry(0.38, 0.38, 0.36, 10);
const CYL_BIG = new THREE.CylinderGeometry(0.55, 0.55, 0.42, 10);

/**
 * Readable low-poly cartoon cars (chase-cam silhouettes).
 * Styles: buggy|coupe|tank|rocket|monster|sport|truck|king
 * Wheels spin via userData.wheels[]. Still flat-shaded cartoon, not glued boxes soup.
 */
export function makeCarMesh(colorHex, accentHex = 0xffffff, style = 'buggy') {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({
    color: colorHex, roughness: 0.4, metalness: 0.2, flatShading: true,
  });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1a1a28, roughness: 0.85, flatShading: true });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x99ddff, roughness: 0.12, metalness: 0.55, flatShading: true, transparent: true, opacity: 0.82,
  });
  const accentMat = new THREE.MeshStandardMaterial({ color: accentHex, roughness: 0.45, flatShading: true });
  const glowMat = new THREE.MeshStandardMaterial({
    color: 0xffeeaa, emissive: 0xffcc44, emissiveIntensity: 0.95, flatShading: true,
  });

  let bodyW = 1.75, bodyH = 0.5, bodyL = 3.15;
  let cabinW = 1.35, cabinH = 0.55, cabinL = 1.25, cabinY = 1.05, cabinZ = -0.15;
  let noseL = 0.85, wheelScale = 1, rideY = 0.55, fat = 1;
  let hasScoop = true, hasSpoiler = false, hasRollbar = false;

  if (style === 'buggy') {
    bodyW = 1.7; bodyH = 0.45; bodyL = 2.9; cabinH = 0.5; cabinZ = -0.1;
    hasScoop = false; hasRollbar = true; wheelScale = 1.08;
  } else if (style === 'coupe') {
    bodyW = 1.8; bodyH = 0.48; bodyL = 3.2; cabinY = 1.0; cabinL = 1.4; hasSpoiler = false;
  } else if (style === 'tank') {
    bodyW = 2.15; bodyH = 0.72; bodyL = 3.3; cabinY = 1.15; cabinH = 0.45; hasScoop = false; fat = 1.12;
  } else if (style === 'rocket') {
    bodyW = 1.45; bodyH = 0.38; bodyL = 3.7; cabinZ = -0.45; cabinW = 1.1; noseL = 1.2; hasSpoiler = true;
  } else if (style === 'monster') {
    bodyW = 1.95; bodyH = 0.5; bodyL = 3.0; wheelScale = 1.55; cabinY = 1.35; rideY = 0.85; hasRollbar = true;
  } else if (style === 'sport') {
    bodyW = 1.95; bodyH = 0.36; bodyL = 3.55; cabinY = 0.88; cabinH = 0.42; cabinL = 1.5; hasSpoiler = true;
  } else if (style === 'truck') {
    bodyW = 2.05; bodyH = 0.62; bodyL = 3.5; cabinY = 1.35; cabinZ = 0.55; cabinL = 1.1; hasScoop = false;
  } else if (style === 'king') {
    bodyW = 2.0; bodyH = 0.52; bodyL = 3.45; hasSpoiler = true; fat = 1.08; cabinY = 1.1;
  }

  // Main hull
  const body = new THREE.Mesh(new THREE.BoxGeometry(bodyW, bodyH, bodyL), bodyMat);
  body.position.y = rideY * fat;
  body.castShadow = true;
  group.add(body);
  group.userData.bodyMat = bodyMat;
  group.userData.bodyMesh = body;

  // Tapered nose (silhouette cue from chase cam)
  const nose = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.72, bodyH * 0.75, noseL), bodyMat);
  nose.position.set(0, rideY * fat + bodyH * 0.05, bodyL * 0.42);
  nose.castShadow = true;
  group.add(nose);

  // Side skirts / rocker panels
  for (const sx of [-1, 1]) {
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, bodyL * 0.85), darkMat);
    skirt.position.set(sx * (bodyW * 0.52), rideY * 0.55, 0);
    group.add(skirt);
  }

  if (hasScoop) {
    const scoop = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.85), darkMat);
    scoop.position.set(0, rideY + bodyH * 0.7, 0.55);
    group.add(scoop);
  }

  // Cabin / canopy
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(cabinW, cabinH, cabinL), bodyMat);
  cabin.position.set(0, cabinY, cabinZ);
  cabin.castShadow = true;
  group.add(cabin);

  const windshield = new THREE.Mesh(new THREE.BoxGeometry(cabinW * 0.9, cabinH * 0.75, 0.08), glassMat);
  windshield.position.set(0, cabinY + 0.02, cabinZ + cabinL * 0.48);
  windshield.rotation.x = -0.28;
  group.add(windshield);

  // Rear window
  const rearGlass = new THREE.Mesh(new THREE.BoxGeometry(cabinW * 0.85, cabinH * 0.55, 0.06), glassMat);
  rearGlass.position.set(0, cabinY + 0.02, cabinZ - cabinL * 0.48);
  rearGlass.rotation.x = 0.2;
  group.add(rearGlass);

  if (hasRollbar) {
    const bar = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.07, 6, 10, Math.PI), darkMat);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, cabinY + 0.15, cabinZ - 0.1);
    group.add(bar);
  }

  if (hasSpoiler) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.95, 0.08, 0.38), accentMat);
    wing.position.set(0, cabinY + 0.45, -bodyL * 0.42);
    group.add(wing);
    for (const sx of [-1, 1]) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.35, 0.08), darkMat);
      strut.position.set(sx * bodyW * 0.35, cabinY + 0.28, -bodyL * 0.42);
      group.add(strut);
    }
  }

  if (style === 'tank') {
    const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.38, 8), darkMat);
    turret.position.set(0, 1.5, -0.1);
    group.add(turret);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 1.5, 6), darkMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 1.55, 0.95);
    group.add(barrel);
  }
  if (style === 'king') {
    const crown = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.48, 5), accentMat);
    crown.position.set(0, cabinY + 0.55, cabinZ);
    group.add(crown);
  }
  if (style === 'truck') {
    const bed = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.92, 0.38, 1.5), darkMat);
    bed.position.set(0, rideY + 0.25, -1.15);
    group.add(bed);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.95, 0.5, 0.08), accentMat);
    rail.position.set(0, rideY + 0.55, -1.85);
    group.add(rail);
  }
  if (style === 'rocket') {
    const intake = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 0.5, 8), darkMat);
    intake.rotation.x = Math.PI / 2;
    intake.position.set(0, rideY, -bodyL * 0.48);
    group.add(intake);
  }
  if (style === 'monster') {
    const cage = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.7, 0.7, 1.0), new THREE.MeshStandardMaterial({
      color: colorHex, roughness: 0.5, flatShading: true, wireframe: false, transparent: true, opacity: 0.35,
    }));
    cage.position.set(0, cabinY + 0.1, cabinZ);
    group.add(cage);
  }

  const frontBump = new THREE.Mesh(new THREE.BoxGeometry(bodyW + 0.15, 0.3, 0.35), darkMat);
  frontBump.position.set(0, rideY * 0.65, bodyL * 0.5);
  group.add(frontBump);
  group.userData.bumper = frontBump;

  const rearBump = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.95, 0.28, 0.28), darkMat);
  rearBump.position.set(0, rideY * 0.65, -bodyL * 0.5);
  group.add(rearBump);

  const headlights = [];
  for (const lx of [-bodyW * 0.32, bodyW * 0.32]) {
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.22, 0.12), glowMat);
    light.position.set(lx, rideY + 0.05, bodyL * 0.54);
    group.add(light);
    headlights.push(light);
    // Soft glow halo for night readability
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 6, 5),
      new THREE.MeshBasicMaterial({ color: 0xffeeaa, transparent: true, opacity: 0.35, depthWrite: false })
    );
    halo.position.set(lx, rideY + 0.05, bodyL * 0.58);
    group.add(halo);
    headlights.push(halo);
  }
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0xff2244, emissive: 0xff0022, emissiveIntensity: 0.75, flatShading: true,
  });
  for (const lx of [-bodyW * 0.32, bodyW * 0.32]) {
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.16, 0.08), tailMat);
    tl.position.set(lx, rideY + 0.05, -bodyL * 0.54);
    group.add(tl);
  }

  // Accent stripe down the hood — readable color pop
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.04, bodyL * 0.7), accentMat);
  stripe.position.set(0, rideY + bodyH * 0.55, 0.15);
  group.add(stripe);

  const wheels = [];
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xc8c8dd, roughness: 0.35, metalness: 0.65, flatShading: true });
  const wy = 0.38 * wheelScale + (style === 'monster' ? 0.15 : 0);
  const positions = [
    [-bodyW * 0.55, wy, bodyL * 0.34],
    [bodyW * 0.55, wy, bodyL * 0.34],
    [-bodyW * 0.55, wy, -bodyL * 0.34],
    [bodyW * 0.55, wy, -bodyL * 0.34],
  ];
  for (const [x, y, z] of positions) {
    // Wheel arch bulge
    const arch = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.7), darkMat);
    arch.position.set(x * 0.92, y + 0.15, z);
    group.add(arch);

    const wheel = new THREE.Mesh(wheelScale > 1.3 ? CYL_BIG : CYL, darkMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, y, z);
    wheel.castShadow = true;
    group.add(wheel);
    wheels.push(wheel);
    const rim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16 * wheelScale, 0.16 * wheelScale, 0.38, 7),
      rimMat
    );
    rim.rotation.z = Math.PI / 2;
    rim.position.set(x, y, z);
    group.add(rim);
  }

  // Clearer damage stages
  const dentMat = new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.95, flatShading: true });
  const dents = [];
  const dentSpecs = [
    [0.7, rideY + 0.25, 0.6, 0.45, 0.25, 0.5],
    [-0.65, rideY + 0.2, -0.4, 0.4, 0.22, 0.45],
    [0.2, cabinY - 0.1, -0.9, 0.5, 0.3, 0.35],
    [-0.5, rideY + 0.15, 1.0, 0.35, 0.2, 0.4],
  ];
  for (const [x, y, z, sx, sy, sz] of dentSpecs) {
    const d = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), dentMat);
    d.position.set(x, y, z);
    d.visible = false;
    group.add(d);
    dents.push(d);
  }
  const smokePuff = new THREE.Mesh(
    new THREE.SphereGeometry(0.4, 6, 5),
    new THREE.MeshStandardMaterial({ color: 0x555555, transparent: true, opacity: 0.55, flatShading: true })
  );
  smokePuff.position.set(0, cabinY + 0.4, -bodyL * 0.35);
  smokePuff.visible = false;
  group.add(smokePuff);

  // Twin exhaust pipes
  const exhausts = [];
  const pipeMat = new THREE.MeshStandardMaterial({ color: 0x333344, metalness: 0.7, roughness: 0.35, flatShading: true });
  for (const lx of [-0.35, 0.35]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.45, 6), pipeMat);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(lx, rideY * 0.55, -bodyL * 0.52);
    group.add(pipe);
    exhausts.push(pipe);
  }

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1.5 * fat * (wheelScale > 1.2 ? 1.15 : 1), 16),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.38, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.03;
  group.add(shadow);

  const shield = new THREE.Mesh(
    new THREE.SphereGeometry(2.15, 12, 10),
    new THREE.MeshBasicMaterial({
      color: 0x44aaff, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide,
    })
  );
  shield.visible = false;
  group.add(shield);

  group.userData.wheels = wheels;
  group.userData.shadow = shadow;
  group.userData.shield = shield;
  group.userData.dents = dents;
  group.userData.smokePuff = smokePuff;
  group.userData.headlights = headlights;
  group.userData.exhausts = exhausts;
  group.userData.glowMat = glowMat;
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
