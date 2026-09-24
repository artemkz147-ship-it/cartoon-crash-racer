/**
 * Procedural Web Audio v1.3 — engine/SFX + looped music bed (no asset bloat).
 */
export class GameAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this._engineNodes = null;
    this._engineGain = null;
    this._master = null;
    this._musicGain = null;
    this._musicTimer = null;
    this._musicStep = 0;
    this._started = false;
    this.musicEnabled = true;
  }

  ensure() {
    if (this._started) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this._master = this.ctx.createGain();
      this._master.gain.value = this.muted ? 0 : 0.38;
      this._master.connect(this.ctx.destination);
      this._musicGain = this.ctx.createGain();
      this._musicGain.gain.value = this.muted || !this.musicEnabled ? 0 : 0.11;
      this._musicGain.connect(this._master);
      this._started = true;
      this._setupEngine();
      this._startMusic();
    } catch (_) {
      /* ignore */
    }
  }

  setMuted(m) {
    this.muted = m;
    if (this._master) this._master.gain.value = m ? 0 : 0.38;
    if (this._musicGain) {
      this._musicGain.gain.value = m || !this.musicEnabled ? 0 : 0.11;
    }
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  setMusicEnabled(on) {
    this.musicEnabled = on;
    if (this._musicGain) {
      this._musicGain.gain.value = this.muted || !on ? 0 : 0.11;
    }
  }

  _setupEngine() {
    if (!this.ctx || !this._master) return;
    const oscA = this.ctx.createOscillator();
    oscA.type = 'sawtooth';
    oscA.frequency.value = 52;
    const oscB = this.ctx.createOscillator();
    oscB.type = 'square';
    oscB.frequency.value = 78;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 380;
    filter.Q.value = 0.7;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    const mixB = this.ctx.createGain();
    mixB.gain.value = 0.35;
    oscA.connect(filter);
    oscB.connect(mixB);
    mixB.connect(filter);
    filter.connect(gain);
    gain.connect(this._master);
    oscA.start();
    oscB.start();
    this._engineNodes = { oscA, oscB, filter };
    this._engineGain = gain;
  }

  /** Tiny chiptune-ish race bed: bass + arpeggio + kick pulse. */
  _startMusic() {
    if (!this.ctx || !this._musicGain) return;
    // C minor pentatonic-ish race motif (Hz)
    const bass = [130.81, 146.83, 155.56, 174.61, 196.0, 174.61, 155.56, 146.83];
    const lead = [523.25, 587.33, 622.25, 698.46, 783.99, 698.46, 622.25, 587.33];
    const stepMs = 180;
    const tick = () => {
      if (!this.ctx || this.muted || !this.musicEnabled) {
        this._musicTimer = setTimeout(tick, stepMs);
        return;
      }
      const i = this._musicStep % 8;
      const t = this.ctx.currentTime;
      // Bass
      this._tone(bass[i], 0.16, 'triangle', 0.07, this._musicGain, t);
      // Offbeat lead every other
      if (i % 2 === 0) {
        this._tone(lead[i] * 0.5, 0.1, 'square', 0.025, this._musicGain, t + 0.02);
      }
      // Kick-ish every 4
      if (i % 4 === 0) {
        this._tone(70, 0.08, 'sine', 0.06, this._musicGain, t);
        this._noiseClick(0.04, 0.04, this._musicGain, t);
      }
      // Hi-hat tick
      if (i % 2 === 1) this._noiseClick(0.03, 0.025, this._musicGain, t);
      this._musicStep++;
      this._musicTimer = setTimeout(tick, stepMs);
    };
    tick();
  }

  _tone(freq, dur, type, vol, dest, when) {
    if (!this.ctx || !dest) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 2200;
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(vol, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    osc.connect(f);
    f.connect(g);
    g.connect(dest);
    osc.start(when);
    osc.stop(when + dur + 0.02);
  }

  _noiseClick(dur, vol, dest, when) {
    if (!this.ctx || !dest) return;
    const bufLen = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, bufLen, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufLen);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 4000;
    src.connect(hp);
    hp.connect(g);
    g.connect(dest);
    src.start(when);
  }

  engine(speed01, boosting) {
    if (!this._engineNodes || !this._engineGain) return;
    const f = 48 + speed01 * 155 + (boosting ? 48 : 0);
    const g = speed01 > 0.02 ? 0.035 + speed01 * 0.09 + (boosting ? 0.03 : 0) : 0;
    const t = this.ctx.currentTime;
    this._engineNodes.oscA.frequency.setTargetAtTime(f, t, 0.05);
    this._engineNodes.oscB.frequency.setTargetAtTime(f * 1.5, t, 0.05);
    this._engineNodes.filter.frequency.setTargetAtTime(280 + speed01 * 900 + (boosting ? 200 : 0), t, 0.08);
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

  _noiseBurst(dur, vol, freqLo, freqHi) {
    if (!this.ctx || !this._master || this.muted) return;
    const t = this.ctx.currentTime;
    const bufLen = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, bufLen, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufLen, 1.4);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = (freqLo + freqHi) * 0.5;
    f.Q.value = 0.6;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = freqHi;
    src.connect(f);
    f.connect(lp);
    lp.connect(g);
    g.connect(this._master);
    src.start(t);
  }

  pickup() {
    this._beep(523, 0.06, 'sine', 0.12);
    setTimeout(() => this._beep(659, 0.07, 'sine', 0.13), 55);
    setTimeout(() => this._beep(784, 0.1, 'sine', 0.14), 110);
    setTimeout(() => this._beep(1046, 0.12, 'triangle', 0.1), 170);
  }

  crash(intensity = 0.5) {
    if (!this.ctx || !this._master || this.muted) return;
    const i = Math.min(1, intensity);
    this._noiseBurst(0.12 + i * 0.1, 0.18 * i, 80, 400 + i * 800);
    this._noiseBurst(0.08, 0.1 * i, 600, 2400);
    this._beep(90 + i * 40, 0.1, 'sawtooth', 0.06 * i);
  }

  fire() {
    this._beep(160, 0.05, 'sawtooth', 0.11);
    this._beep(70, 0.14, 'square', 0.09);
    this._noiseBurst(0.06, 0.08, 200, 1200);
  }

  explosion() {
    this._noiseBurst(0.28, 0.28, 40, 500);
    this._noiseBurst(0.18, 0.14, 200, 1800);
    this._beep(55, 0.25, 'sawtooth', 0.16);
    this._beep(110, 0.12, 'square', 0.08);
  }

  boost() {
    this._beep(180, 0.04, 'sawtooth', 0.07);
    this._beep(360, 0.07, 'sine', 0.06);
    this._beep(540, 0.1, 'triangle', 0.04);
  }

  lap() {
    this._beep(523, 0.09, 'sine', 0.12);
    setTimeout(() => this._beep(659, 0.09, 'sine', 0.12), 90);
    setTimeout(() => this._beep(784, 0.16, 'sine', 0.14), 180);
  }

  finish() {
    [523, 659, 784, 1046].forEach((f, i) => {
      setTimeout(() => this._beep(f, 0.22, 'sine', 0.14), i * 130);
    });
  }

  land() {
    this._noiseBurst(0.08, 0.1, 60, 400);
    this._beep(120, 0.06, 'triangle', 0.05);
  }
}
