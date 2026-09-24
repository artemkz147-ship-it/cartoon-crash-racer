/**
 * Procedural Web Audio (no external files). Mute-aware.
 */
export class GameAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this._engineNodes = null;
    this._engineGain = null;
    this._master = null;
    this._started = false;
  }

  ensure() {
    if (this._started) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this._master = this.ctx.createGain();
      this._master.gain.value = this.muted ? 0 : 0.35;
      this._master.connect(this.ctx.destination);
      this._started = true;
      this._setupEngine();
    } catch (_) {
      /* ignore */
    }
  }

  setMuted(m) {
    this.muted = m;
    if (this._master) this._master.gain.value = m ? 0 : 0.35;
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  _setupEngine() {
    if (!this.ctx || !this._master) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 55;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this._master);
    osc.start();
    this._engineNodes = { osc, filter };
    this._engineGain = gain;
  }

  /** Update engine hum from speed 0..1 and boosting. */
  engine(speed01, boosting) {
    if (!this._engineNodes || !this._engineGain) return;
    const f = 50 + speed01 * 140 + (boosting ? 40 : 0);
    const g = speed01 > 0.02 ? 0.04 + speed01 * 0.08 : 0;
    const t = this.ctx.currentTime;
    this._engineNodes.osc.frequency.setTargetAtTime(f, t, 0.05);
    this._engineNodes.filter.frequency.setTargetAtTime(300 + speed01 * 800, t, 0.08);
    this._engineGain.gain.setTargetAtTime(g, t, 0.08);
  }

  _beep(freq, dur, type = 'square', vol = 0.12) {
    if (!this.ctx || !this._master || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(this._master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  pickup() {
    this._beep(660, 0.08, 'sine', 0.15);
    setTimeout(() => this._beep(990, 0.12, 'sine', 0.12), 70);
  }

  crash(intensity = 0.5) {
    if (!this.ctx || !this._master || this.muted) return;
    const t = this.ctx.currentTime;
    const bufLen = Math.floor(this.ctx.sampleRate * 0.15);
    const buf = this.ctx.createBuffer(1, bufLen, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufLen, 1.5);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = 0.2 * Math.min(1, intensity);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 400 + intensity * 600;
    src.connect(f);
    f.connect(g);
    g.connect(this._master);
    src.start(t);
  }

  fire() {
    this._beep(180, 0.06, 'sawtooth', 0.1);
    this._beep(90, 0.12, 'square', 0.08);
  }

  explosion() {
    this.crash(1);
    this._beep(80, 0.2, 'sawtooth', 0.14);
  }

  boost() {
    this._beep(220, 0.05, 'sawtooth', 0.06);
    this._beep(440, 0.08, 'sine', 0.05);
  }

  lap() {
    this._beep(523, 0.1, 'sine', 0.12);
    setTimeout(() => this._beep(659, 0.1, 'sine', 0.12), 100);
    setTimeout(() => this._beep(784, 0.18, 'sine', 0.14), 200);
  }

  finish() {
    [523, 659, 784, 1046].forEach((f, i) => {
      setTimeout(() => this._beep(f, 0.2, 'sine', 0.14), i * 140);
    });
  }
}
