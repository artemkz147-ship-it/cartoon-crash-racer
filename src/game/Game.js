import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Input } from './Input.js';
import { Track } from './Track.js';
import { Car } from './Car.js';
import { DestructibleProps } from './Props.js';
import { Pickups } from './Pickups.js';
import { Projectiles } from './Projectiles.js';
import { AIController } from './AI.js';
import { HUD } from './HUD.js';

const MAX_LAPS = 3;

const RACERS = [
  { name: 'Игрок', color: 0xff4d4d, accent: 0xffe566, isPlayer: true },
  { name: 'Синий', color: 0x3d8bff, accent: 0xffffff, isPlayer: false },
  { name: 'Зелёный', color: 0x3dcc6e, accent: 0xffee88, isPlayer: false },
];

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.running = false;
    this.raceTime = 0;
    this.finished = false;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x87b8ff, 1);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x87b8ff, 60, 140);

    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 250);
    this.camera.position.set(0, 12, -20);

    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -25, 0),
    });
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.allowSleep = true;

    this._setupLights();
    this.track = new Track(this.scene, this.world);
    this.props = new DestructibleProps(this.scene, this.world);
    this.pickups = new Pickups(this.scene);
    this.projectiles = new Projectiles(this.scene);
    this.input = new Input();
    this.hud = new HUD();

    this.cars = [];
    this.ai = [];
    this.player = null;

    for (let i = 0; i < RACERS.length; i++) {
      const cfg = RACERS[i];
      const spawn = this.track.getSpawn(i, RACERS.length);
      const car = new Car({
        scene: this.scene,
        world: this.world,
        color: cfg.color,
        accent: cfg.accent,
        name: cfg.name,
        isPlayer: cfg.isPlayer,
        spawn,
      });
      this.cars.push(car);
      if (cfg.isPlayer) this.player = car;
    }

    for (const car of this.cars) {
      if (!car.isPlayer) {
        this.ai.push(new AIController(car, this.track, this.cars));
      }
    }

    this._setupCollisions();
    this._camPos = new THREE.Vector3();
    this._camLook = new THREE.Vector3();
    this._clock = new THREE.Clock();
    this._onResize = () => this._resize();
    window.addEventListener('resize', this._onResize);

    this.hud.showMessage('Гонка на 3 круга!', 2.5);
  }

  _setupLights() {
    const hemi = new THREE.HemisphereLight(0xfff0d0, 0x3a6a40, 0.85);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xffffff, 1.15);
    sun.position.set(30, 50, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -50;
    sun.shadow.camera.right = 50;
    sun.shadow.camera.top = 50;
    sun.shadow.camera.bottom = -50;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 120;
    this.scene.add(sun);

    const fill = new THREE.DirectionalLight(0x88aaff, 0.35);
    fill.position.set(-20, 20, -30);
    this.scene.add(fill);
  }

  _setupCollisions() {
    this.world.addEventListener('beginContact', (e) => {
      const a = e.bodyA;
      const b = e.bodyB;
      const carA = a.userData?.car;
      const carB = b.userData?.car;
      const propA = a.userData?.item;
      const propB = b.userData?.item;

      // Car vs car ram
      if (carA && carB) {
        const rel = a.velocity.vsub(b.velocity);
        const speed = rel.length();
        if (speed > 8) {
          const dmg = Math.min(28, (speed - 8) * 1.4);
          carA.takeDamage(dmg * 0.85, true);
          carB.takeDamage(dmg * 0.85, true);
          // bounce impulse
          const mid = a.position.vadd(b.position).scale(0.5);
          const pushA = a.position.vsub(mid);
          pushA.y = 0;
          if (pushA.length() > 0.01) pushA.normalize();
          a.velocity.x += pushA.x * speed * 0.25;
          a.velocity.z += pushA.z * speed * 0.25;
          a.velocity.y += 2;
          b.velocity.x -= pushA.x * speed * 0.25;
          b.velocity.z -= pushA.z * speed * 0.25;
          b.velocity.y += 2;
        }
      }

      // Car vs prop
      const hitProp = (car, propBody, propItem) => {
        if (!car || !propItem) return;
        const speed = car.body.velocity.length();
        if (speed > 5) {
          this.props.damageProp(propItem, 10 + speed * 1.5, {
            x: car.body.velocity.x,
            y: car.body.velocity.y,
            z: car.body.velocity.z,
          });
          // slight self bump damage at very high speed
          if (speed > 22) car.takeDamage(3, true);
        }
      };

      if (carA && propB) hitProp(carA, b, propB);
      if (carB && propA) hitProp(carB, a, propA);
    });
  }

  start() {
    this.running = true;
    this.raceTime = 0;
    this.finished = false;
    this._clock.start();
    this._loop();
  }

  _resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  _loop = () => {
    if (!this.running) return;
    requestAnimationFrame(this._loop);
    const dt = Math.min(0.05, this._clock.getDelta());
    this._update(dt);
    this.renderer.render(this.scene, this.camera);
  };

  _update(dt) {
    if (!this.finished) this.raceTime += dt;

    // Player controls
    const p = this.player;
    if (p.alive) {
      let throttle = 0;
      if (this.input.forward) throttle += 1;
      if (this.input.back) throttle -= 0.7;
      let steer = 0;
      if (this.input.left) steer -= 1;
      if (this.input.right) steer += 1;
      p.setControls({ throttle, steer, boost: this.input.boost });
      if (this.input.fire) {
        const shot = p.tryFire();
        if (shot) this.projectiles.spawn(shot, this.cars);
      }
    } else if (p.respawnTimer <= 0) {
      this._respawnCar(p);
      this.hud.showMessage('Респаун!', 1.2);
    }

    if (this.input.respawn && p.alive) {
      // manual soft reset if stuck
      const ang = Math.atan2(p.position.z, p.position.x);
      const pt = this.track.getPointOnTrack(ang, 28);
      p.respawn({ x: pt.x, z: pt.z, facing: ang + Math.PI / 2 });
    }

    // AI
    for (const ctrl of this.ai) {
      const car = ctrl.car;
      if (!car.alive) {
        if (car.respawnTimer <= 0) this._respawnCar(car);
        continue;
      }
      const cmd = ctrl.update(dt);
      car.setControls(cmd);
      if (cmd.fire) {
        const shot = car.tryFire();
        if (shot) this.projectiles.spawn(shot, this.cars);
      }
    }

    // Physics
    this.world.step(1 / 60, dt, 3);

    for (const car of this.cars) {
      car.update(dt);
      car.updateLap(this.track.lapCheckpoints);
    }

    this.props.update(dt);
    this.pickups.update(dt, this.cars, (car, type) => {
      if (car.isPlayer) {
        const names = { weapon: 'Оружие!', armor: 'Броня!', boost: 'Ускорение!' };
        this.hud.showMessage(names[type] || 'Бонус!', 1);
      }
    });
    this.projectiles.update(dt, this.cars, (hit, owner) => {
      if (owner.isPlayer) this.hud.showMessage('Попадание!', 0.8);
      if (hit.isPlayer) this.hud.showMessage('Тебя ранили!', 0.8);
    });

    this._updateCamera(dt);
    this.hud.update(dt, this.player, this._getPlace(this.player), this.raceTime, MAX_LAPS);

    // Win check
    if (!this.finished && this.player.lap > MAX_LAPS) {
      this.finished = true;
      const place = this._getPlace(this.player);
      const places = ['1-е место!', '2-е место!', '3-е место!'];
      this.hud.showMessage(`Финиш! ${places[place - 1] || ''}`, 6);
    }
  }

  _respawnCar(car) {
    const ang = Math.atan2(car.position.z, car.position.x);
    // if buried, use spawn
    const r = Math.hypot(car.position.x, car.position.z);
    const useAng = r > 10 && r < 45 ? ang : -Math.PI / 2;
    const pt = this.track.getPointOnTrack(useAng, 28);
    const fx = -Math.sin(useAng);
    const fz = Math.cos(useAng);
    car.respawn({ x: pt.x, z: pt.z, facing: Math.atan2(fx, fz) });
  }

  _getPlace(car) {
    const sorted = [...this.cars].sort((a, b) => b.progress - a.progress);
    return sorted.indexOf(car) + 1;
  }

  _updateCamera(dt) {
    const car = this.player;
    const fwd = car.forward;
    const target = new THREE.Vector3(
      car.position.x - fwd.x * 9 + 0,
      car.position.y + 5.5,
      car.position.z - fwd.z * 9
    );
    // if dead, overhead
    if (!car.alive) {
      target.set(car.spawnPos.x, 18, car.spawnPos.z - 10);
    }
    this._camPos.lerp(target, 1 - Math.pow(0.001, dt));
    this.camera.position.copy(this._camPos);

    const look = new THREE.Vector3(
      car.position.x + fwd.x * 6,
      car.position.y + 1.2,
      car.position.z + fwd.z * 6
    );
    this._camLook.lerp(look, 1 - Math.pow(0.0005, dt));
    this.camera.lookAt(this._camLook);
  }
}
