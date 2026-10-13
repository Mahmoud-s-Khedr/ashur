/**
 * Locally synthesized sound effects (no audio files, no network).
 * Browsers require one user gesture before audio can play, so call `sfx.enable()`
 * from a click handler (the display shows an "Enable sound" button for this).
 */
type Wave = OscillatorType;

class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  enabled = false;
  /** Operator setting: when true nothing plays even if this device enabled sound. */
  muted = false;
  volume = 0.7;

  enable() {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as any).webkitAudioContext;
      if (!Ctor) return false;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      const compressor = this.ctx.createDynamicsCompressor();
      this.master.connect(compressor);
      compressor.connect(this.ctx.destination);
      const length = this.ctx.sampleRate;
      this.noiseBuffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    }
    void this.ctx.resume();
    this.enabled = true;
    return true;
  }

  disable() {
    this.enabled = false;
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  private tone(
    freq: number,
    at: number,
    dur: number,
    type: Wave = 'sine',
    gain = 0.25,
    slideTo?: number,
    attack = 0.008,
  ) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + at;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private noise(at: number, dur: number, gain = 0.2, from = 400, to = 4000, q = 1) {
    if (!this.ctx || !this.master || !this.noiseBuffer) return;
    const t = this.ctx.currentTime + at;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = q;
    filter.frequency.setValueAtTime(from, t);
    filter.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  play(name: SfxName, arg = 0) {
    if (!this.enabled || this.muted || !this.ctx) return;
    switch (name) {
      case 'tick':
        this.tone(1400, 0, 0.04, 'square', 0.06);
        break;
      case 'urgent':
        this.tone(980, 0, 0.09, 'square', 0.12);
        break;
      case 'beep':
        this.tone(520, 0, 0.22, 'sine', 0.35);
        this.tone(1040, 0, 0.12, 'sine', 0.1);
        break;
      case 'go':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0, 0.7, 'triangle', 0.22 - i * 0.02));
        this.noise(0, 0.5, 0.18, 300, 6000);
        break;
      case 'pop':
        this.tone(480 + arg * 60, 0, 0.14, 'sine', 0.3, 900 + arg * 60);
        break;
      case 'ready':
        this.tone(660, 0, 0.12, 'triangle', 0.25);
        this.tone(990, 0.09, 0.2, 'triangle', 0.25);
        break;
      case 'whoosh':
        this.noise(0, 0.5, 0.22, 200, 5000, 0.8);
        break;
      case 'swoosh':
        this.noise(0, 0.35, 0.16, 5000, 300, 0.8);
        break;
      case 'correct':
        [523, 659, 784].forEach((f, i) => this.tone(f, i * 0.07, 0.35, 'triangle', 0.26));
        this.tone(1047, 0.21, 0.5, 'sine', 0.18);
        break;
      case 'wrong':
        this.tone(220, 0, 0.35, 'sawtooth', 0.16, 90);
        this.tone(165, 0.05, 0.35, 'square', 0.1, 70);
        break;
      case 'reelTick':
        this.tone(900, 0, 0.03, 'triangle', 0.12);
        break;
      case 'reelStop':
        this.tone(140, 0, 0.35, 'sine', 0.4, 60);
        [784, 988, 1175].forEach((f, i) => this.tone(f, 0.05 + i * 0.06, 0.5, 'triangle', 0.2));
        break;
      case 'drum':
        for (let i = 0; i < 14; i++)
          this.noise(i * (0.09 - i * 0.003), 0.08, 0.13 + i * 0.01, 120, 300, 2);
        break;
      case 'ladderUp':
        [440, 554, 659].forEach((f, i) => this.tone(f, i * 0.08, 0.25, 'triangle', 0.24));
        break;
      case 'ladderDown':
        this.tone(520, 0, 0.5, 'sawtooth', 0.14, 120);
        this.tone(390, 0.12, 0.5, 'triangle', 0.14, 90);
        break;
      case 'streak':
        [659, 784, 988, 1319].forEach((f, i) => this.tone(f, i * 0.06, 0.3, 'square', 0.1));
        break;
      case 'win':
        [523, 659, 784].forEach((f) => this.tone(f, 0, 0.9, 'triangle', 0.2));
        [784, 988, 1175].forEach((f) => this.tone(f, 0.25, 1.1, 'triangle', 0.2));
        break;
      case 'fanfare':
        this.fanfare();
        break;
      case 'alarm':
        for (let i = 0; i < 3; i++) this.tone(740, i * 0.22, 0.16, 'square', 0.12);
        break;
      case 'timeUp':
        this.tone(330, 0, 0.9, 'sawtooth', 0.2, 165);
        this.noise(0, 0.6, 0.12, 800, 200);
        break;
    }
  }

  private fanfare() {
    const notes: [number, number, number][] = [
      [523, 0, 0.18],
      [523, 0.2, 0.18],
      [523, 0.4, 0.18],
      [659, 0.6, 0.45],
      [587, 1.1, 0.2],
      [659, 1.35, 0.2],
      [784, 1.6, 0.9],
      [1047, 2.6, 1.6],
    ];
    for (const [f, at, dur] of notes) {
      this.tone(f, at, dur, 'sawtooth', 0.12);
      this.tone(f / 2, at, dur, 'triangle', 0.18);
      this.tone(f * 1.5, at, dur, 'square', 0.04);
    }
    [262, 330, 392, 523].forEach((f) => this.tone(f, 2.6, 2.2, 'triangle', 0.14));
    this.noise(2.6, 1.2, 0.15, 400, 7000);
  }
}

export type SfxName =
  | 'tick'
  | 'urgent'
  | 'beep'
  | 'go'
  | 'pop'
  | 'ready'
  | 'whoosh'
  | 'swoosh'
  | 'correct'
  | 'wrong'
  | 'reelTick'
  | 'reelStop'
  | 'drum'
  | 'ladderUp'
  | 'ladderDown'
  | 'streak'
  | 'win'
  | 'fanfare'
  | 'alarm'
  | 'timeUp';

export const sfx = new Sfx();
