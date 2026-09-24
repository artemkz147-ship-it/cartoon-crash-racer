/**
 * Keyboard + multitouch mobile controls.
 * Touch pads/buttons set axes; keyboard remains optional fallback.
 */
export class Input {
  constructor() {
    this.keys = new Set();
    this.mouseDown = false;

    // Analog / digital touch state
    this.touchSteer = 0; // -1 .. 1
    this.touchThrottle = 0; // -1 .. 1 (brake negative)
    this.touchBoost = false;
    this.touchFire = false;
    this.touchRespawn = false;
    this.pausePressed = false;

    this.isTouch = this._detectTouch();
    this._activePointers = new Map(); // pointerId -> control id

    this._onKeyDown = (e) => {
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
      if (e.code === 'Escape' || e.code === 'KeyP') {
        this.pausePressed = true;
      }
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

    // Prevent browser gestures on the whole page while playing
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
    if (hint) {
      hint.classList.toggle('hidden-on-touch', this.isTouch);
    }
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
        this._activePointers.set(e.pointerId, el.dataset.control);
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
        onUp(e);
      };
      el.addEventListener('pointerdown', down);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('pointerleave', (e) => {
        if (this._activePointers.has(e.pointerId)) up(e);
      });
    };

    const steerLeft = document.getElementById('btn-steer-left');
    const steerRight = document.getElementById('btn-steer-right');
    const gas = document.getElementById('btn-gas');
    const brake = document.getElementById('btn-brake');
    const boost = document.getElementById('btn-boost');
    const fire = document.getElementById('btn-fire');
    const respawn = document.getElementById('btn-respawn');

    bindHold(
      steerLeft,
      () => {
        this.touchSteer = -1;
      },
      () => {
        if (this.touchSteer < 0) this.touchSteer = 0;
      }
    );
    bindHold(
      steerRight,
      () => {
        this.touchSteer = 1;
      },
      () => {
        if (this.touchSteer > 0) this.touchSteer = 0;
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

    // Virtual joystick (optional overlay on left)
    const joy = document.getElementById('joystick');
    const joyKnob = document.getElementById('joystick-knob');
    if (joy && joyKnob) {
      const radius = 54;
      let joyPointer = null;
      const setKnob = (dx, dy) => {
        const len = Math.hypot(dx, dy) || 1;
        const cl = Math.min(len, radius);
        const nx = (dx / len) * cl;
        const ny = (dy / len) * cl;
        joyKnob.style.transform = `translate(${nx}px, ${ny}px)`;
        this.touchSteer = THREE_clamp(nx / radius, -1, 1);
      };
      const resetKnob = () => {
        joyKnob.style.transform = 'translate(0, 0)';
        // only clear steer if pads not held
        if (!steerLeft?.classList.contains('active') && !steerRight?.classList.contains('active')) {
          this.touchSteer = 0;
        }
      };
      joy.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        joyPointer = e.pointerId;
        joy.classList.add('active');
        try {
          joy.setPointerCapture(e.pointerId);
        } catch (_) {}
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

  /** Consume one-shot pause edge. */
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

  /** Analog steer for smoother touch feel (-1..1). */
  get steerAxis() {
    const sens = window.__steerSensitivity || 1;
    let v = 0;
    if (Math.abs(this.touchSteer) > 0.05) v = this.touchSteer;
    else if (this.left && !this.right) v = -1;
    else if (this.right && !this.left) v = 1;
    return Math.max(-1, Math.min(1, v * sens));
  }

  /** Analog throttle (-1..1). */
  get throttleAxis() {
    if (Math.abs(this.touchThrottle) > 0.05) return this.touchThrottle;
    if (this.forward && !this.back) return 1;
    if (this.back && !this.forward) return -0.7;
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

function THREE_clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}
