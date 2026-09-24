import * as THREE from 'three';

const EDGE = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));

export function makeCarMesh(colorHex, accentHex = 0xffffff) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({
    color: colorHex,
    roughness: 0.45,
    metalness: 0.15,
    flatShading: true,
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x222233,
    roughness: 0.8,
    flatShading: true,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x88ccff,
    roughness: 0.2,
    metalness: 0.4,
    flatShading: true,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: accentHex,
    roughness: 0.5,
    flatShading: true,
  });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.55, 3.2), bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.55, 1.4), bodyMat);
  cabin.position.set(0, 1.0, -0.15);
  cabin.castShadow = true;
  group.add(cabin);

  const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.35, 0.12), glassMat);
  windshield.position.set(0, 1.05, 0.55);
  group.add(windshield);

  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.35), accentMat);
  spoiler.position.set(0, 1.15, -1.35);
  group.add(spoiler);

  const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.25, 0.3), darkMat);
  bumper.position.set(0, 0.35, 1.55);
  group.add(bumper);

  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.35, 10);
  const positions = [
    [-0.95, 0.38, 1.0],
    [0.95, 0.38, 1.0],
    [-0.95, 0.38, -1.0],
    [0.95, 0.38, -1.0],
  ];
  for (const [x, y, z] of positions) {
    const wheel = new THREE.Mesh(wheelGeo, darkMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, y, z);
    wheel.castShadow = true;
    group.add(wheel);
    wheels.push(wheel);
  }

  const outline = new THREE.LineSegments(
    EDGE,
    new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.15 })
  );
  outline.scale.set(1.85, 0.6, 3.25);
  outline.position.y = 0.55;
  group.add(outline);

  group.userData.wheels = wheels;
  return group;
}

export function makeCrateMesh() {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xc48a3a,
    roughness: 0.7,
    flatShading: true,
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const lines = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1.2, 1.2, 1.2)),
    new THREE.LineBasicMaterial({ color: 0x5a3a12 })
  );
  const g = new THREE.Group();
  g.add(mesh);
  g.add(lines);
  return g;
}

export function makeBarrelMesh() {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xd4452a,
    roughness: 0.55,
    flatShading: true,
  });
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 1.1, 10), mat);
  mesh.castShadow = true;
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(0.52, 0.52, 0.12, 10),
    new THREE.MeshStandardMaterial({ color: 0xffe566, flatShading: true })
  );
  band.position.y = 0.15;
  const g = new THREE.Group();
  g.add(mesh);
  g.add(band);
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
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 0.55), mat);
  body.castShadow = true;
  g.add(body);
  const s1 = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.92, 0.56), stripe);
  s1.position.x = -0.6;
  const s2 = s1.clone();
  s2.position.x = 0.6;
  g.add(s1, s2);
  return g;
}

export function makePickupMesh(type) {
  const colors = {
    weapon: 0xff3355,
    armor: 0x44aaff,
    boost: 0xffee44,
  };
  const color = colors[type] || 0xffffff;
  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.85,
    roughness: 0.25,
    flatShading: true,
  });
  let geo;
  if (type === 'weapon') geo = new THREE.ConeGeometry(0.65, 1.35, 6);
  else if (type === 'armor') geo = new THREE.IcosahedronGeometry(0.8, 0);
  else geo = new THREE.OctahedronGeometry(0.8, 0);

  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.scale.setScalar(1.15);

  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(1.15, 12, 12),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    })
  );

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.05, 0.1, 8, 24),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 1.0,
    })
  );
  ring.rotation.x = Math.PI / 2;

  // Outer pulse disk for visibility at distance
  const disk = new THREE.Mesh(
    new THREE.CircleGeometry(1.3, 20),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  disk.rotation.x = -Math.PI / 2;
  disk.position.y = -0.55;

  const g = new THREE.Group();
  g.add(glow);
  g.add(mesh);
  g.add(ring);
  g.add(disk);
  g.userData.inner = mesh;
  g.userData.ring = ring;
  g.userData.glow = glow;
  return g;
}

export function makeDebrisPiece(color, size = 0.35) {
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.8,
    flatShading: true,
  });
  const geo = Math.random() > 0.5
    ? new THREE.BoxGeometry(size, size * 0.7, size * 0.9)
    : new THREE.TetrahedronGeometry(size * 0.7);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  return mesh;
}

export function makeRocketMesh() {
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.12, 0.7, 8),
    new THREE.MeshStandardMaterial({ color: 0xff3344, emissive: 0xaa1122, emissiveIntensity: 0.4, flatShading: true })
  );
  body.rotation.x = Math.PI / 2;
  const tip = new THREE.Mesh(
    new THREE.ConeGeometry(0.12, 0.25, 8),
    new THREE.MeshStandardMaterial({ color: 0xffee88, flatShading: true })
  );
  tip.rotation.x = Math.PI / 2;
  tip.position.z = 0.45;
  const g = new THREE.Group();
  g.add(body);
  g.add(tip);
  return g;
}
