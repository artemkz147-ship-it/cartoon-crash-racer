import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
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
import { getCar } from './data/cars.js';
import { RIVALS } from './data/rivals.js';
import { calcMedal } from './data/career.js';

/**
 * options: {
 *   mode: 'career'|'race'|'derby',
 *   trackId, carId, laps, aiCount, difficulty,
 *   cupId, needPlace,
 *   onFinish(result), onQuit()
 * }
 */
export class Game {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.options = {
      mode: 'race',
      trackId: 'city',
      carId: 'kartoshka',
      laps: 3,
      aiCount: 4,
      difficulty: 0.7,
      cupId: null,
      needPlace: 3,
      ...options,
    };
    this.running = false;
    this.paused = false;
    this.raceTime = 0;
    this.finished = false;
    this.shakeTime = 0;
    this.baseFov = 55;
    this.fovPunch = 0;
    this.maxLaps = this.options.laps || 3;
    this.isDerby = this.options.mode === 'derby';

    this.audio = new GameAudio();

    const isMobile =
      'ontouchstart' in window || navigator.maxTouchPoints > 0 || window.innerWidth < 900;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !isMobile,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.35 : 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = !isMobile;
    if (!isMobile) this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this._isMobile = isMobile;
    this._fpsEMA = 60;
    this._fpsSample = 0;
    this.composer = null;

    this.scene = new THREE.Scene();
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
    this.track = new Track(this.scene, this.world, this.options.trackId);
    this.renderer.setClearColor(this.track.cfg.clear, 1);
    const fogNear = this.track.cfg.fogNear || 55;
    const fogFar = this.track.cfg.fogFar || 140;
    this.scene.fog = new THREE.Fog(this.track.cfg.fog, fogNear, fogFar);
    // Soft bloom on desktop only (mobile: emissive glow already in meshes)
    if (!isMobile) {
      try {
        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(new RenderPass(this.scene, this.camera));
        const bloom = new UnrealBloomPass(
          new THREE.Vector2(window.innerWidth, window.innerHeight),
          0.28, // strength
          0.55, // radius
          0.82  // threshold — only bright emissives bloom
        );
        this.composer.addPass(bloom);
        this.composer.addPass(new OutputPass());
        this._bloomPass = bloom;
      } catch (_) {
        this.composer = null;
      }
    }

    this.props = new DestructibleProps(this.scene, this.world, this.particles, this.track);
    this.props.onExplode = (x, y, z, r) => {
      this.props.blastDamageCars(this.cars, x, y, z, r);
      this.audio.explosion();
      this.triggerShake(0.38);
      this.fovPunch = Math.max(this.fovPunch, 5);
    };
    this.pickups = new Pickups(this.scene, this.track);
    this.projectiles = new Projectiles(this.scene, this.particles);
    if (!window.__gameInput) window.__gameInput = new Input();
    this.input = window.__gameInput;
    this.hud = new HUD(this.audio);

    this.cars = [];
    this.ai = [];
    this.player = null;
    this._buildRacers();

    this._setupCollisions();
    this._applyThemeLights();
    this._camPos = new THREE.Vector3();
    this._camLook = new THREE.Vector3();
    this._clock = new THREE.Clock();
    this._onResize = () => this._resize();
    window.addEventListener('resize', this._onResize);
    window.addEventListener('orientationchange', () => setTimeout(() => this._resize(), 120));

    const msg = this.isDerby
      ? 'Дерби! Последний выживший / очки за разгром'
      : `Гонка: ${this.maxLaps} круга(ов)!`;
    this.hud.showMessage(msg, 2.4);
    this.derbyEndTimer = 0;
  }

  _buildRacers() {
    const playerCar = getCar(this.options.carId);
    const aiCount = Math.min(7, Math.max(1, this.options.aiCount || 4));
    const total = aiCount + 1;
    const list = [
      {
        name: 'Игрок',
        color: playerCar.color,
        accent: playerCar.accent,
        isPlayer: true,
        carId: playerCar.id,
        style: playerCar.style,
        stats: playerCar.stats,
      },
    ];
    for (let i = 0; i < aiCount; i++) {
      const r = RIVALS[i % RIVALS.length];
      list.push({
        name: r.name,
        color: r.color,
        accent: r.accent,
        isPlayer: false,
        style: r.style,
        stats: {
          speed: 0.7 + this.options.difficulty * 0.25,
          handling: 0.7 + r.skill * 0.2,
          armor: 0.65 + (i % 3) * 0.08,
          weapon: 0.7 + this.options.difficulty * 0.2,
        },
        skill: r.skill,
        ramBias: r.ramBias,
      });
    }

    for (let i = 0; i < list.length; i++) {
      const cfg = list[i];
      const spawn = this.track.getSpawn(i, total);
      const car = new Car({
        scene: this.scene,
        world: this.world,
        color: cfg.color,
        accent: cfg.accent,
        name: cfg.name,
        isPlayer: cfg.isPlayer,
        spawn,
        particles: this.particles,
        carId: cfg.carId,
        style: cfg.style,
        stats: cfg.stats,
        weaponPower: cfg.stats?.weapon || 1,
      });
      car.onBoostStart = () => this.audio.boost();
      car.onDie = (c) => {
        this.audio.explosion();
        if (c.isPlayer) this.triggerShake(0.35);
        // Credit wreck to last hitter roughly: nearest alive rival
        if (this.isDerby) {
          c.derbyEliminated = true;
          c.respawnTimer = 9999;
        }
      };
      car.trackRef = this.track;
      this.cars.push(car);
      if (cfg.isPlayer) this.player = car;
    }

    for (let i = 0; i < list.length; i++) {
      if (list[i].isPlayer) continue;
      const ctrl = new AIController(
        this.cars[i],
        this.track,
        this.cars,
        this.pickups,
        this.options.difficulty
      );
      if (list[i].skill) ctrl.skill = list[i].skill;
      if (list[i].ramBias) ctrl.ramBias = list[i].ramBias;
      this.ai.push(ctrl);
    }
  }

  _setupLights(isMobile) {
    // Placeholder — refined after track loads in _applyThemeLights
    const hemi = new THREE.HemisphereLight(0xfff2dd, 0x3a6a48, 0.95);
    this.scene.add(hemi);
    this.hemi = hemi;
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
    this.fill = fill;
  }

  _applyThemeLights() {
    const theme = this.track?.cfg?.theme || 'city';
    const night = !!(this.track?.cfg?.night) || theme === 'factory' || theme === 'volcano' || theme === 'docks';
    const snow = theme === 'snow';
    const desert = theme === 'desert';
    if (this.hemi) {
      if (night && theme === 'volcano') {
        this.hemi.color.setHex(0xff8866);
        this.hemi.groundColor.setHex(0x3a1810);
        this.hemi.intensity = 0.7;
      } else if (night && theme === 'factory') {
        this.hemi.color.setHex(0xaabbcc);
        this.hemi.groundColor.setHex(0x334044);
        this.hemi.intensity = 0.65;
      } else if (night) {
        this.hemi.color.setHex(0x88aacc);
        this.hemi.groundColor.setHex(0x2a4050);
        this.hemi.intensity = 0.75;
      } else if (snow) {
        this.hemi.color.setHex(0xe8f0ff);
        this.hemi.groundColor.setHex(0xa0b8d0);
        this.hemi.intensity = 1.05;
      } else if (desert) {
        this.hemi.color.setHex(0xffe8bb);
        this.hemi.groundColor.setHex(0xc4a060);
        this.hemi.intensity = 1.1;
      }
    }
    if (this.sun) {
      this.sun.intensity = night ? 0.55 : desert ? 1.35 : 1.15;
      this.sun.color.setHex(theme === 'volcano' ? 0xff6644 : night ? 0xaabbdd : 0xfff5e6);
    }
    if (this.fill) {
      this.fill.intensity = night ? 0.55 : 0.4;
      this.fill.color.setHex(theme === 'volcano' ? 0xff4422 : 0x88aaff);
    }
    // Readable headlights on dark themes
    for (const car of this.cars || []) car.setNightLights?.(night);
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
          if (speed > 14) {
            if (carA.isPlayer && !carB.alive) carA.wrecks++;
            if (carB.isPlayer && !carA.alive) carB.wrecks++;
          }
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
          this.particles?.sparks(mid.x, mid.y + 0.5, mid.z, 14);
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
    document.getElementById('hud')?.classList.remove('hidden');
    document.getElementById('touch-controls')?.classList.add('in-race');
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

  dispose() {
    this.running = false;
    window.removeEventListener('resize', this._onResize);
    for (const c of this.cars) c.dispose();
    this.props.dispose();
    this.pickups.dispose();
    this.track.dispose();
    this.renderer.dispose();
  }

  _resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (this.composer) {
      this.composer.setSize(w, h);
      this.composer.setPixelRatio?.(Math.min(window.devicePixelRatio || 1, this._isMobile ? 1.35 : 2));
    }
  }

  _loop = () => {
    if (!this.running || this.paused) return;
    requestAnimationFrame(this._loop);
    const dt = Math.min(0.05, this._clock.getDelta());
    // FPS EMA for auto particle quality
    if (dt > 0) {
      const fps = 1 / dt;
      this._fpsEMA = this._fpsEMA * 0.92 + fps * 0.08;
      this._fpsSample += dt;
      if (this._fpsSample > 0.75) {
        this._fpsSample = 0;
        const q = this._fpsEMA < 40 ? 0.4 : this._fpsEMA < 50 ? 0.65 : 1;
        this.particles.setQuality?.(q);
        if (this._isMobile && this._fpsEMA < 38) {
          this.renderer.setPixelRatio(Math.min(this.renderer.getPixelRatio(), 1.1));
        }
      }
    }
    this._update(dt);
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  };

  _update(dt) {
    this.input.update?.(dt);

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
      if (boosting) this.fovPunch = Math.max(this.fovPunch, 3);
      p.setControls({ throttle, steer, boost: this.input.boost });
      if (this.input.fire) {
        const shot = p.tryFire();
        if (shot) {
          this.projectiles.spawn(shot, this.cars);
          this.audio.fire();
        }
      }
    } else if (!this.isDerby && p.respawnTimer <= 0) {
      this._respawnCar(p);
      this.hud.showMessage('Респаун!', 1.2);
    }

    if (this.input.respawn && p.alive && !this.isDerby) {
      const idx = this.track.nearestWaypointIndex(p.position.x, p.position.z);
      const pt = this.track.getWaypoint(idx);
      const n = this.track.getWaypoint(idx + 1);
      p.respawn({
        x: pt.x,
        z: pt.z,
        facing: Math.atan2(n.x - pt.x, n.z - pt.z),
      });
    }

    for (const ctrl of this.ai) {
      const car = ctrl.car;
      if (!car.alive) {
        if (!this.isDerby && car.respawnTimer <= 0) this._respawnCar(car);
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

    // Draft: slight speed bonus when tucked behind a rival
    this._applyDraft(dt);

    for (const car of this.cars) {
      const landWas = car._landPunch;
      car.update(dt);
      if (car.isPlayer && car._landPunch > 0.9 && landWas <= 0) {
        this.audio.land?.();
        this.triggerShake(0.12);
        this.fovPunch = Math.max(this.fovPunch, 2.5);
      }
      this.track.checkRamps(car);
      this.track.checkHazards(car, dt);
      if (car.isPlayer && car._onBoostPad) {
        if (!car._boostPadCool || car._boostPadCool <= 0) {
          this.fovPunch = Math.max(this.fovPunch, 4);
          this.audio.boost();
          car._boostPadCool = 1.2;
        }
      }
      if (car._boostPadCool > 0) car._boostPadCool -= dt;
      if (!this.isDerby) {
        const lapped = car.updateLap(this.track.lapCheckpoints);
        if (lapped && car.isPlayer) {
          this.audio.lap();
          this.hud.showMessage(`Круг ${Math.min(car.lap, this.maxLaps)}!`, 1.2);
        }
      }
    }

    this.props.setLodOrigin?.(this.player.position.x, this.player.position.z);
    this.props.update(dt);
    this.particles.update(dt);
    this.pickups.update(dt, this.cars, (car, type) => {
      if (car.isPlayer) {
        const names = { weapon: 'Ракета!', weapon2: 'Особое оружие!', armor: 'Броня!', boost: 'Ускорение!' };
        this.hud.showMessage(names[type] || 'Бонус!', 1);
        this.audio.pickup();
      }
    });
    this.projectiles.update(dt, this.cars, (hit, owner) => {
      if (owner.isPlayer) {
        this.hud.showMessage('Попадание!', 0.7);
        this.triggerShake(0.16);
        this.audio.explosion();
        if (!hit.alive) owner.wrecks++;
      }
      if (hit.isPlayer) {
        this.hud.showMessage('Тебя ранили!', 0.7);
        this.triggerShake(0.24);
        this.audio.crash(0.7);
      }
    });

    const spd01 = Math.min(1, Math.abs(p.speed) / 45);
    this.audio.engine(p.alive ? spd01 : 0, p._boosting);

    if (this.sun && this.renderer.shadowMap.enabled) {
      this.sun.position.set(p.position.x + 30, 55, p.position.z + 20);
      this.sun.target.position.set(p.position.x, 0, p.position.z);
      this.sun.target.updateMatrixWorld();
    }

    this._updateCamera(dt);
    const place = this.isDerby ? this._derbyPlace() : this._getPlace(this.player);
    this.hud.update(dt, this.player, place, this.raceTime, this.maxLaps, {
      destruction: this.props.destructionScore,
      derby: this.isDerby,
      aliveCount: this.cars.filter((c) => c.alive).length,
    });

    if (!this.finished) {
      if (this.isDerby) this._checkDerbyEnd();
      else if (this.player.lap > this.maxLaps) this._finishRace();
    }
  }

  _checkDerbyEnd() {
    const alive = this.cars.filter((c) => c.alive);
    // End if player dead, or only 1 left, or timeout 3 min
    if (!this.player.alive) {
      this.derbyEndTimer += 0.016;
      if (this.derbyEndTimer > 1.5) this._finishDerby();
    } else if (alive.length <= 1) {
      this._finishDerby();
    } else if (this.raceTime > 180) {
      this._finishDerby();
    }
  }

  _derbyPlace() {
    // Rank by: alive first, then wrecks + destruction attribution approx by wrecks
    const sorted = [...this.cars].sort((a, b) => {
      if (a.alive !== b.alive) return a.alive ? -1 : 1;
      return (b.wrecks || 0) - (a.wrecks || 0);
    });
    return sorted.indexOf(this.player) + 1;
  }

  _finishDerby() {
    this.finished = true;
    const place = this._derbyPlace();
    const destruction = this.props.destructionScore + this.player.wrecks * 20;
    this.audio.finish();
    const result = {
      mode: 'derby',
      place,
      time: this.raceTime,
      destruction,
      medal: place === 1 ? 'gold' : place === 2 ? 'silver' : place <= 3 ? 'bronze' : null,
      standings: this._derbyStandings(),
      name: this.player.name,
    };
    this.hud.showResults(result);
    this.options.onFinish?.(result);
  }

  _finishRace() {
    this.finished = true;
    const place = this._getPlace(this.player);
    const destruction = this.props.destructionScore;
    const medal = calcMedal(place, destruction, this.options.needPlace || 3);
    this.audio.finish();
    const result = {
      mode: this.options.mode,
      cupId: this.options.cupId,
      place,
      time: this.raceTime,
      destruction,
      medal,
      needPlace: this.options.needPlace,
      standings: this._standings(),
      name: this.player.name,
    };
    this.hud.showResults(result);
    this.options.onFinish?.(result);
  }

  _standings() {
    return [...this.cars]
      .sort((a, b) => b.progress - a.progress)
      .map((c, i) => ({
        place: i + 1,
        name: c.name,
        lap: Math.min(c.lap, this.maxLaps),
        extra: `круг ${Math.min(c.lap, this.maxLaps)}`,
      }));
  }

  _derbyStandings() {
    return [...this.cars]
      .sort((a, b) => {
        if (a.alive !== b.alive) return a.alive ? -1 : 1;
        return (b.wrecks || 0) - (a.wrecks || 0);
      })
      .map((c, i) => ({
        place: i + 1,
        name: c.name,
        lap: c.wrecks || 0,
        extra: c.alive ? 'жив' : `разбито: ${c.wrecks || 0}`,
      }));
  }

  _respawnCar(car) {
    const idx = this.track.nearestWaypointIndex(car.position.x, car.position.z);
    const pt = this.track.getWaypoint(idx);
    const n = this.track.getWaypoint(idx + 1);
    const facing = Math.atan2(n.x - pt.x, n.z - pt.z);
    car.respawn({ x: pt.x, z: pt.z, facing });
  }

  _getPlace(car) {
    const sorted = [...this.cars].sort((a, b) => b.progress - a.progress);
    return sorted.indexOf(car) + 1;
  }

  _applyDraft(dt) {
    for (const car of this.cars) {
      if (!car.alive) continue;
      const fwd = car.forward;
      let drafting = false;
      for (const other of this.cars) {
        if (other === car || !other.alive) continue;
        const dx = other.position.x - car.position.x;
        const dz = other.position.z - car.position.z;
        const ahead = dx * fwd.x + dz * fwd.z;
        const side = Math.abs(dx * fwd.z - dz * fwd.x);
        const d2 = dx * dx + dz * dz;
        // Tucked behind someone 4..14m ahead, within ~2.5m laterally
        if (ahead > 4 && ahead < 14 && side < 2.6 && d2 < 200) {
          drafting = true;
          break;
        }
      }
      if (drafting && car._throttle > 0.2) {
        const fwd2 = car.forward;
        car.body.velocity.x += fwd2.x * 6.5 * dt;
        car.body.velocity.z += fwd2.z * 6.5 * dt;
        car._draftTimer = 0.3;
        if (car.isPlayer && Math.random() < dt * 2) {
          this.particles?.boostTrail(
            car.position.x - fwd.x * 1.5,
            car.position.y + 0.3,
            car.position.z - fwd.z * 1.5,
            0xaaddff
          );
        }
      } else {
        car._draftTimer = Math.max(0, (car._draftTimer || 0) - dt);
      }
    }
  }

  _updateCamera(dt) {
    const car = this.player;
    const fwd = car.forward;
    // Chase cam: sit behind + slightly above, look a bit ahead of the nose.
    const back = 10.5;
    const height = 5.2;
    const lookAhead = 8.5;
    const target = new THREE.Vector3(
      car.position.x - fwd.x * back,
      car.position.y + height,
      car.position.z - fwd.z * back
    );
    if (!car.alive) target.set(car.spawnPos.x, 16, car.spawnPos.z - 12);
    // Tiny shake only — phone WebView hates big punches
    if (this.shakeTime > 0) {
      const s = this.shakeTime * 10;
      target.x += Math.sin(s * 33) * 0.14;
      target.y += Math.cos(s * 29) * 0.09;
    }
    // Smooth follow ~120ms feel
    const follow = 1 - Math.exp(-dt / 0.12);
    this._camPos.lerp(target, follow);
    this.camera.position.copy(this._camPos);
    const look = new THREE.Vector3(
      car.position.x + fwd.x * lookAhead,
      car.position.y + 1.1,
      car.position.z + fwd.z * lookAhead
    );
    const lookK = 1 - Math.exp(-dt / 0.1);
    this._camLook.lerp(look, lookK);
    this.camera.lookAt(this._camLook);
    const want = this.baseFov + this.fovPunch;
    this.camera.fov += (want - this.camera.fov) * Math.min(1, 8 * dt);
    this.camera.updateProjectionMatrix();
  }
}
