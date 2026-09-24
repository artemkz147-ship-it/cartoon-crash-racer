/**
 * Keyboard + multitouch mobile controls (CTR / FlatOut arcade feel).
 *
 * Layout (landscape phone):
 *  - LEFT: large virtual stick = STEER ONLY (X axis). Deadzone ~0.12.
 *  - RIGHT: big GAS (hold), BRAKE, BOOST, FIRE (+ respawn).
 *
 * Steering sign (verified for chase cam behind car):
 *  - Stick / pad RIGHT  → touchSteer > 0 → Car turns RIGHT on screen.
 *  - Stick / pad LEFT   → touchSteer < 0 → Car turns LEFT on screen.
 * Car.js maps +steer → negative yaw rate (Y-up right-hand), which is a
 * clockwise turn when facing +Z = right turn from the chase camera.
 * Do NOT flip here without flipping Car.js too (would double-invert).
 *
 * Lag: no input queues. Stick writes touchSteer immediately; Car.js uses
 * a short exponential approach (~50–80 ms), not a sluggish lerp chain.
 */
export class Input {
  constructor() {
    this.keys = new Set();
    this.mouseDown = false;

    this.touchSteer = 0; // -1 .. 1 (immediate)
    this.touchThrottle = 0; // -1 .. 1
    this.touchBoost = false;
    this.touchFire = false;
    this.touchRespawn = false;
    this.pausePressed = false;

    /** Smoothed steer fed to the car — light exp approach only. */
    this._steerSmooth = 0;

    this.isTouch = this._detectTouch();
    this._activePointers = new Map();
    this._padLeft = false;
    this._padRight = false;

    this._onKeyDown = (e) => {
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
      if (e.code === 'Escape' || e.code === 'KeyP') this.pausePressed = true;
    };
    this._onKeyUp = (e) => this.keys.delete(e.code);
    this._onMouseDown = (e) => {
      if (e.button === 0) this.mouseDown = true;
    };
    this._onMouseUp = (e) => {
      if (e.button === 0) this.mouseDown = false;
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);

    document.addEventListener(
      'touchmove',
      (e) => {
        if (e.target.closest('#touch-controls, #game-canvas, #hud, #pause-btn')) {
          e.preventDefault();
        }
      },
      { passive: false }
    );

    this._bindTouchUI();
    this._applyTouchVisibility();
    this._loadSensitivity();
  }

  _loadSensitivity() {
    try {
      const raw = localStorage.getItem('ccr_progress_v1');
      if (raw) {
        const p = JSON.parse(raw);
        const s = p?.settings?.sensitivity;
        if (typeof s === 'number') window.__steerSensitivity = s;
      }
    } catch (_) {}
    if (window.__steerSensitivity == null) window.__steerSensitivity = 1;
  }

  _detectTouch() {
    return (
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      window.matchMedia('(pointer: coarse)').matches
    );
  }

  _applyTouchVisibility() {
    const touchRoot = document.getElementById('touch-controls');
    const hint = document.getElementById('controls-hint');
    if (touchRoot) {
      touchRoot.classList.toggle('visible', this.isTouch);
      touchRoot.setAttribute('aria-hidden', this.isTouch ? 'false' : 'true');
    }
    if (hint) hint.classList.toggle('hidden-on-touch', this.isTouch);
    document.body.classList.toggle('touch-mode', this.isTouch);
  }

  _bindTouchUI() {
    const root = document.getElementById('touch-controls');
    if (!root) return;

    const bindHold = (el, onDown, onUp) => {
      if (!el) return;
      const down = (e) => {
        e.preventDefault();
        e.stopPropagation();
        el.classList.add('active');
        this._activePointers.set(e.pointerId, el.dataset.control || el.id);
        try {
          el.setPointerCapture(e.pointerId);
        } catch (_) {}
        onDown(e);
      };
      const up = (e) => {
        e.preventDefault();
        e.stopPropagation();
        el.classList.remove('active');
        this._activePointers.delete(e.pointerId);
        try {
          el.releasePointerCapture?.(e.pointerId);
        } catch (_) {}
        onUp(e);
      };
      el.addEventListener('pointerdown', down);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('lostpointercapture', up);
    };

    const steerLeft = document.getElementById('btn-steer-left');
    const steerRight = document.getElementById('btn-steer-right');
    const gas = document.getElementById('btn-gas');
    const brake = document.getElementById('btn-brake');
    const boost = document.getElementById('btn-boost');
    const fire = document.getElementById('btn-fire');
    const respawn = document.getElementById('btn-respawn');

    // Optional digital pads (hidden in CSS on phones favoring stick-only).
    // Sign: left pad → negative steer → turn left on chase cam.
    bindHold(
      steerLeft,
      () => {
        this._padLeft = true;
        this.touchSteer = -1;
      },
      () => {
        this._padLeft = false;
        if (!this._padRight && !this._joyActive) this.touchSteer = 0;
        else if (this._padRight) this.touchSteer = 1;
      }
    );
    bindHold(
      steerRight,
      () => {
        this._padRight = true;
        this.touchSteer = 1;
      },
      () => {
        this._padRight = false;
        if (!this._padLeft && !this._joyActive) this.touchSteer = 0;
        else if (this._padLeft) this.touchSteer = -1;
      }
    );

    bindHold(
      gas,
      () => {
        this.touchThrottle = 1;
      },
      () => {
        if (this.touchThrottle > 0) this.touchThrottle = 0;
      }
    );
    bindHold(
      brake,
      () => {
        this.touchThrottle = -1;
      },
      () => {
        if (this.touchThrottle < 0) this.touchThrottle = 0;
      }
    );
    bindHold(
      boost,
      () => {
        this.touchBoost = true;
      },
      () => {
        this.touchBoost = false;
      }
    );
    bindHold(
      fire,
      () => {
        this.touchFire = true;
      },
      () => {
        this.touchFire = false;
      }
    );
    bindHold(
      respawn,
      () => {
        this.touchRespawn = true;
      },
      () => {
        this.touchRespawn = false;
      }
    );

    // —— Virtual stick: STEER X ONLY (ignore Y so gas isn't confused) ——
    const joy = document.getElementById('joystick');
    const joyKnob = document.getElementById('joystick-knob');
    this._joyActive = false;
    if (joy && joyKnob) {
      const DEADZONE = 0.12;
      let joyPointer = null;
      let radius = 64;

      const measure = () => {
        const r = joy.getBoundingClientRect();
        radius = Math.max(40, Math.min(r.width, r.height) * 0.5 - 4);
      };

      const setKnob = (dx, dy) => {
        // Clamp to circle for visuals, but ONLY X drives steer.
        const len = Math.hypot(dx, dy) || 1;
        const cl = Math.min(len, radius);
        const nx = (dx / len) * cl;
        const ny = (dy / len) * cl * 0.35; // flatten Y visually (steer-only)
        joyKnob.style.transform = `translate(${nx}px, ${ny}px)`;

        let raw = nx / radius; // -1..1, screen-right = positive
        if (Math.abs(raw) < DEADZONE) raw = 0;
        else {
          // Remap deadzone out so the usable range still reaches ±1
          const sign = Math.sign(raw);
          raw = sign * ((Math.abs(raw) - DEADZONE) / (1 - DEADZONE));
        }
        // Stick right (+) → turn right. See file header.
        this.touchSteer = clamp(raw, -1, 1);
      };

      const resetKnob = () => {
        joyKnob.style.transform = 'translate(0, 0)';
        this._joyActive = false;
        if (!this._padLeft && !this._padRight) this.touchSteer = 0;
        else if (this._padLeft) this.touchSteer = -1;
        else if (this._padRight) this.touchSteer = 1;
      };

      joy.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        joyPointer = e.pointerId;
        this._joyActive = true;
        joy.classList.add('active');
        try {
          joy.setPointerCapture(e.pointerId);
        } catch (_) {}
        measure();
        const rect = joy.getBoundingClientRect();
        setKnob(e.clientX - (rect.left + rect.width / 2), e.clientY - (rect.top + rect.height / 2));
      });
      joy.addEventListener('pointermove', (e) => {
        if (joyPointer !== e.pointerId) return;
        e.preventDefault();
        const rect = joy.getBoundingClientRect();
        setKnob(e.clientX - (rect.left + rect.width / 2), e.clientY - (rect.top + rect.height / 2));
      });
      const joyUp = (e) => {
        if (joyPointer !== e.pointerId) return;
        joyPointer = null;
        joy.classList.remove('active');
        resetKnob();
      };
      joy.addEventListener('pointerup', joyUp);
      joy.addEventListener('pointercancel', joyUp);
      joy.addEventListener('lostpointercapture', joyUp);
    }

    const pauseBtn = document.getElementById('pause-btn');
    if (pauseBtn) {
      pauseBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.pausePressed = true;
        pauseBtn.classList.add('active');
      });
      pauseBtn.addEventListener('pointerup', () => pauseBtn.classList.remove('active'));
    }
  }

  /**
   * Call once per frame. Applies light exponential approach (~60 ms feel)
   * so steering is immediate but not 1-frame twitchy.
   */
  update(dt = 1 / 60) {
    const target = this._rawSteer();
    // tau ≈ 0.06 s → ~63% in 60 ms
    const alpha = 1 - Math.exp(-dt / 0.055);
    this._steerSmooth += (target - this._steerSmooth) * alpha;
    if (Math.abs(this._steerSmooth) < 0.01 && Math.abs(target) < 0.01) this._steerSmooth = 0;
  }

  _rawSteer() {
    const sens = window.__steerSensitivity || 1;
    let v = 0;
    if (Math.abs(this.touchSteer) > 0.02) v = this.touchSteer;
    else if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) v = -1;
    else if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) v = 1;
    return clamp(v * sens, -1, 1);
  }

  consumePause() {
    if (this.pausePressed) {
      this.pausePressed = false;
      return true;
    }
    return false;
  }

  get forward() {
    return this.keys.has('KeyW') || this.keys.has('ArrowUp') || this.touchThrottle > 0.2;
  }

  get back() {
    return this.keys.has('KeyS') || this.keys.has('ArrowDown') || this.touchThrottle < -0.2;
  }

  get left() {
    return this.keys.has('KeyA') || this.keys.has('ArrowLeft') || this.touchSteer < -0.2;
  }

  get right() {
    return this.keys.has('KeyD') || this.keys.has('ArrowRight') || this.touchSteer > 0.2;
  }

  /** Analog steer for the car (-1..1). Prefer smoothed value. */
  get steerAxis() {
    return this._steerSmooth;
  }

  get throttleAxis() {
    if (Math.abs(this.touchThrottle) > 0.05) return this.touchThrottle;
    if (this.forward && !this.back) return 1;
    if (this.back && !this.forward) return -0.75;
    return 0;
  }

  get boost() {
    return (
      this.touchBoost ||
      this.keys.has('Space') ||
      this.keys.has('ShiftLeft') ||
      this.keys.has('ShiftRight')
    );
  }

  get fire() {
    return this.touchFire || this.mouseDown || this.keys.has('KeyF');
  }

  get respawn() {
    return this.touchRespawn || this.keys.has('KeyR');
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
  }
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}
