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
import { Particles } from './Particles.js';
import { GameAudio } from './Audio.js';

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
    this.paused = false;
    this.raceTime = 0;
    this.finished = false;
    this.shakeTime = 0;
    this.baseFov = 58;
    this.fovPunch = 0;

    this.audio = new GameAudio();

    // Mid-phone friendly: soft shadows optional via blob shadows on cars
    const isMobile =
      'ontouchstart' in window || navigator.maxTouchPoints > 0 || window.innerWidth < 900;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !isMobile,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = !isMobile;
    if (!isMobile) this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x87b8ff, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x9ec8ff, 70, 150);

    this.camera = new THREE.PerspectiveCamera(
      this.baseFov,
      window.innerWidth / window.innerHeight,
      0.1,
      280
    );
    this.camera.position.set(0, 12, -20);

    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -26, 0) });
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.allowSleep = true;

    this._setupLights(isMobile);
    this.particles = new Particles(this.scene);
    this.track = new Track(this.scene, this.world);
    this.props = new DestructibleProps(this.scene, this.world, this.particles);
    this.pickups = new Pickups(this.scene);
    this.projectiles = new Projectiles(this.scene, this.particles);
    this.input = new Input();
    this.hud = new HUD(this.audio);

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
        particles: this.particles,
      });
      car.onBoostStart = () => this.audio.boost();
      car.onDie = () => {
        this.audio.explosion();
        if (car.isPlayer) this.triggerShake(0.35);
      };
      this.cars.push(car);
      if (cfg.isPlayer) this.player = car;
    }

    for (const car of this.cars) {
      if (!car.isPlayer) {
        this.ai.push(new AIController(car, this.track, this.cars, this.pickups));
      }
    }

    this._setupCollisions();
    this._camPos = new THREE.Vector3();
    this._camLook = new THREE.Vector3();
    this._clock = new THREE.Clock();
    this._onResize = () => this._resize();
    window.addEventListener('resize', this._onResize);
    window.addEventListener('orientationchange', () => setTimeout(() => this._resize(), 120));

    this.hud.showMessage('Гонка на 3 круга!', 2.2);
  }

  _setupLights(isMobile) {
    const hemi = new THREE.HemisphereLight(0xfff2dd, 0x3a6a48, 0.95);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff5e6, 1.2);
    sun.position.set(35, 55, 25);
    if (!isMobile) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      sun.shadow.camera.left = -55;
      sun.shadow.camera.right = 55;
      sun.shadow.camera.top = 55;
      sun.shadow.camera.bottom = -55;
      sun.shadow.camera.near = 1;
      sun.shadow.camera.far = 130;
      sun.shadow.bias = -0.0005;
    }
    this.scene.add(sun);
    this.sun = sun;

    const fill = new THREE.DirectionalLight(0x88aaff, 0.4);
    fill.position.set(-25, 22, -30);
    this.scene.add(fill);

    const rim = new THREE.DirectionalLight(0xffaa88, 0.25);
    rim.position.set(0, 10, -40);
    this.scene.add(rim);
  }

  _setupCollisions() {
    this.world.addEventListener('beginContact', (e) => {
      const a = e.bodyA;
      const b = e.bodyB;
      const carA = a.userData?.car;
      const carB = b.userData?.car;
      const propA = a.userData?.item;
      const propB = b.userData?.item;

      if (carA && carB) {
        const rel = a.velocity.vsub(b.velocity);
        const speed = rel.length();
        if (speed > 7) {
          const dmg = Math.min(36, (speed - 7) * 1.7);
          carA.takeDamage(dmg * 0.9, true);
          carB.takeDamage(dmg * 0.9, true);
          const mid = a.position.vadd(b.position).scale(0.5);
          const pushA = a.position.vsub(mid);
          pushA.y = 0;
          if (pushA.length() > 0.01) pushA.normalize();
          const impulse = speed * 0.38;
          a.velocity.x += pushA.x * impulse;
          a.velocity.z += pushA.z * impulse;
          a.velocity.y += 2.8;
          b.velocity.x -= pushA.x * impulse;
          b.velocity.z -= pushA.z * impulse;
          b.velocity.y += 2.8;
          if (this.particles) {
            this.particles.sparks(mid.x, mid.y + 0.5, mid.z, 14);
          }
          this.audio.crash(Math.min(1, speed / 30));
          if (carA.isPlayer || carB.isPlayer) this.triggerShake(0.18 + Math.min(0.2, speed * 0.008));
        }
      }

      const hitProp = (car, propItem) => {
        if (!car || !propItem) return;
        const speed = car.body.velocity.length();
        if (speed > 4.5) {
          this.props.damageProp(propItem, 12 + speed * 1.7, {
            x: car.body.velocity.x,
            y: car.body.velocity.y,
            z: car.body.velocity.z,
          });
          if (car.isPlayer) {
            this.triggerShake(0.14);
            this.audio.crash(0.4);
          }
          if (speed > 20) car.takeDamage(2.5, true);
        }
      };

      if (carA && propB) hitProp(carA, propB);
      if (carB && propA) hitProp(carB, propA);
    });
  }

  triggerShake(duration = 0.2) {
    this.shakeTime = Math.max(this.shakeTime, duration);
    const app = document.getElementById('app');
    if (app) {
      app.classList.remove('shake');
      void app.offsetWidth;
      app.classList.add('shake');
      setTimeout(() => app.classList.remove('shake'), 300);
    }
  }

  start() {
    this.audio.ensure();
    this.running = true;
    this.paused = false;
    this.raceTime = 0;
    this.finished = false;
    this.hud.hideResults();
    this._clock.start();
    this._loop();
  }

  pause() {
    if (!this.running || this.paused || this.finished) return;
    this.paused = true;
    window.__showPauseOverlay?.(true);
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    window.__showPauseOverlay?.(false);
    this._clock.getDelta();
    this._loop();
  }

  togglePause() {
    if (this.paused) this.resume();
    else this.pause();
  }

  _resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  _loop = () => {
    if (!this.running || this.paused) return;
    requestAnimationFrame(this._loop);
    const dt = Math.min(0.05, this._clock.getDelta());
    this._update(dt);
    this.renderer.render(this.scene, this.camera);
  };

  _update(dt) {
    if (this.input.consumePause()) {
      this.togglePause();
      return;
    }

    if (!this.finished) this.raceTime += dt;
    if (this.shakeTime > 0) this.shakeTime -= dt;
    if (this.fovPunch > 0) this.fovPunch = Math.max(0, this.fovPunch - dt * 18);

    const p = this.player;
    if (p.alive) {
      const throttle = this.input.throttleAxis;
      const steer = this.input.steerAxis;
      const boosting = this.input.boost && p.boost > 0 && throttle > 0.1;
      if (boosting) this.fovPunch = Math.max(this.fovPunch, 8);
      p.setControls({ throttle, steer, boost: this.input.boost });
      if (this.input.fire) {
        const shot = p.tryFire();
        if (shot) {
          this.projectiles.spawn(shot, this.cars);
          this.audio.fire();
        }
      }
    } else if (p.respawnTimer <= 0) {
      this._respawnCar(p);
      this.hud.showMessage('Респаун!', 1.2);
    }

    if (this.input.respawn && p.alive) {
      const ang = Math.atan2(p.position.z, p.position.x);
      const pt = this.track.getPointOnTrack(ang, 28);
      p.respawn({ x: pt.x, z: pt.z, facing: ang + Math.PI / 2 });
    }

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

    this.world.step(1 / 60, dt, 3);

    for (const car of this.cars) {
      car.update(dt);
      this.track.checkRamps(car);
      const lapped = car.updateLap(this.track.lapCheckpoints);
      if (lapped && car.isPlayer) {
        this.audio.lap();
        this.hud.showMessage(`Круг ${Math.min(car.lap, MAX_LAPS)}!`, 1.2);
      }
    }

    this.props.update(dt);
    this.particles.update(dt);
    this.pickups.update(dt, this.cars, (car, type) => {
      if (car.isPlayer) {
        const names = {
          weapon: 'Ракета!',
          weapon2: 'Особое оружие!',
          armor: 'Броня!',
          boost: 'Ускорение!',
        };
        this.hud.showMessage(names[type] || 'Бонус!', 1);
        this.audio.pickup();
      }
    });
    this.projectiles.update(dt, this.cars, (hit, owner) => {
      if (owner.isPlayer) {
        this.hud.showMessage('Попадание!', 0.7);
        this.triggerShake(0.16);
        this.audio.explosion();
      }
      if (hit.isPlayer) {
        this.hud.showMessage('Тебя ранили!', 0.7);
        this.triggerShake(0.24);
        this.audio.crash(0.7);
      }
    });

    // Engine audio
    const spd01 = Math.min(1, Math.abs(p.speed) / 45);
    this.audio.engine(p.alive ? spd01 : 0, p._boosting);

    // Sun follow player lightly for shadow quality
    if (this.sun && this.renderer.shadowMap.enabled) {
      this.sun.position.set(p.position.x + 30, 55, p.position.z + 20);
      this.sun.target.position.set(p.position.x, 0, p.position.z);
      this.sun.target.updateMatrixWorld();
    }

    this._updateCamera(dt);
    this.hud.update(dt, this.player, this._getPlace(this.player), this.raceTime, MAX_LAPS);

    if (!this.finished && this.player.lap > MAX_LAPS) {
      this.finished = true;
      const place = this._getPlace(this.player);
      this.audio.finish();
      this.hud.showResults({
        place,
        time: this.raceTime,
        name: this.player.name,
        standings: this._standings(),
      });
    }
  }

  _standings() {
    return [...this.cars]
      .sort((a, b) => b.progress - a.progress)
      .map((c, i) => ({ place: i + 1, name: c.name, lap: Math.min(c.lap, MAX_LAPS) }));
  }

  _respawnCar(car) {
    const ang = Math.atan2(car.position.z, car.position.x);
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
      car.position.x - fwd.x * 9.5,
      car.position.y + 5.8,
      car.position.z - fwd.z * 9.5
    );
    if (!car.alive) {
      target.set(car.spawnPos.x, 18, car.spawnPos.z - 10);
    }
    if (this.shakeTime > 0) {
      const s = this.shakeTime * 10;
      target.x += Math.sin(s * 37) * 0.2;
      target.y += Math.cos(s * 29) * 0.14;
    }
    this._camPos.lerp(target, 1 - Math.pow(0.001, dt));
    this.camera.position.copy(this._camPos);

    const look = new THREE.Vector3(
      car.position.x + fwd.x * 7,
      car.position.y + 1.3,
      car.position.z + fwd.z * 7
    );
    this._camLook.lerp(look, 1 - Math.pow(0.0005, dt));
    this.camera.lookAt(this._camLook);

    // FOV punch on boost
    const want = this.baseFov + this.fovPunch;
    this.camera.fov += (want - this.camera.fov) * Math.min(1, 10 * dt);
    this.camera.updateProjectionMatrix();
  }
}
