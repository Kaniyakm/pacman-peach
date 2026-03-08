/**
 * sound.js  --  Ms. Pac-Man "Georgia Peach Edition"
 */

class ArcadeSound {
  #ctx    = null;
  #master = null;
  #muted  = false;

  // Waka alternation
  #wakaFlip = false;

  // Loop state
  #sirenIv   = null;  // setInterval handle for siren
  #sirenStep = 0;
  #sirenFast = false;

  #frightIv   = null; // setInterval handle for fright
  #frightStep = 0;

  // Note tables
  static #SIR_SLOW  = [200,212,225,237,250,237,225,212];
  static #SIR_FAST  = [265,282,298,315,330,315,298,282];
  static #FRIGHT    = [138,156,142,164,148,170,145,160];

  // ----------------------------------------------------------------- boot ---
  #boot() {
    if (this.#ctx) {
      if (this.#ctx.state === 'suspended') this.#ctx.resume();
      return;
    }
    this.#ctx    = new (window.AudioContext || window.webkitAudioContext)();
    this.#master = this.#ctx.createGain();
    this.#master.gain.value = 0.28;
    this.#master.connect(this.#ctx.destination);
  }

  // -------------------------------------------------------- one-shot note ---
  // Creates a disposable OscillatorNode + GainNode that self-destructs.
  #note(freq, dur, vol = 0.20, shape = 'square', at = null) {
    if (this.#muted || !this.#ctx) return;
    const t   = at ?? this.#ctx.currentTime;
    const osc = this.#ctx.createOscillator();
    const env = this.#ctx.createGain();
    osc.type  = shape;
    osc.frequency.setValueAtTime(freq, t);
    env.gain.setValueAtTime(vol, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(env);
    env.connect(this.#master);
    osc.start(t);
    osc.stop(t + dur + 0.015);
  }

  // Schedule an array of {f, d, v?, shape?} notes sequentially.
  #seq(notes, startAt = null) {
    if (this.#muted || !this.#ctx) return;
    let t = startAt ?? (this.#ctx.currentTime + 0.04);
    for (const { f, d, v = 0.20, shape = 'square' } of notes) {
      if (f > 0) this.#note(f, d, v, shape, t);
      t += d + 0.005;
    }
  }

  // ======================================================= ONE-SHOT SOUNDS

  /** Intro jingle played once at game start. */
  start() {
    this.#boot();
    if (this.#muted) return;
    this.#seq([
      { f: 494, d: 0.08 }, { f: 0,   d: 0.03 },
      { f: 587, d: 0.08 }, { f: 0,   d: 0.03 },
      { f: 698, d: 0.08 }, { f: 0,   d: 0.03 },
      { f: 784, d: 0.15 }, { f: 0,   d: 0.04 },
      { f: 698, d: 0.08 },
      { f: 784, d: 0.22 }, { f: 0,   d: 0.06 },
      { f: 740, d: 0.08 }, { f: 0,   d: 0.03 },
      { f: 659, d: 0.08 }, { f: 0,   d: 0.03 },
      { f: 587, d: 0.08 }, { f: 0,   d: 0.03 },
      { f: 523, d: 0.08 }, { f: 0,   d: 0.03 },
      { f: 494, d: 0.08 }, { f: 0,   d: 0.03 },
      { f: 440, d: 0.30 },
    ]);
  }

  /** Two-tone chomp, alternating pitch per dot eaten. */
  waka() {
    this.#boot();
    if (this.#muted) return;
    this.#note(this.#wakaFlip ? 410 : 290, 0.058, 0.17, 'square');
    this.#wakaFlip = !this.#wakaFlip;
  }

  /** Descending sweep on power pellet. */
  power() {
    this.#boot();
    if (this.#muted || !this.#ctx) return;
    const now = this.#ctx.currentTime;
    const osc = this.#ctx.createOscillator();
    const env = this.#ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(900, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.44);
    env.gain.setValueAtTime(0.26, now);
    env.gain.exponentialRampToValueAtTime(0.0001, now + 0.44);
    osc.connect(env); env.connect(this.#master);
    osc.start(now); osc.stop(now + 0.46);
  }

  /** Ascending chord when a ghost is eaten; pitch scales with combo. */
  ghost(mul = 1) {
    this.#boot();
    if (this.#muted) return;
    const base = Math.min(110 * mul, 880);
    const now  = this.#ctx.currentTime;
    [
      [base,       0.09],
      [base * 1.5, 0.09],
      [base * 2,   0.09],
      [base * 3,   0.14],
    ].forEach(([f, d], i) => this.#note(f, d, 0.20, 'square', now + i * 0.085));
  }

  /** 16-step descending crash on Pac-Man death. */
  death() {
    this.#boot();
    if (this.#muted) return;
    const now = this.#ctx.currentTime;
    [960,900,840,780,720,660,600,540,480,420,360,300,240,180,120,80]
      .forEach((f, i) => this.#note(f, 0.082, 0.26, 'square', now + i * 0.078));
  }

  /** Ascending fanfare when all dots are cleared. */
  levelClear() {
    this.#boot();
    if (this.#muted) return;
    this.#seq([
      { f: 523,  d: 0.10 }, { f: 659,  d: 0.10 },
      { f: 784,  d: 0.10 }, { f: 1047, d: 0.10 },
      { f: 784,  d: 0.06 }, { f: 880,  d: 0.06 },
      { f: 1047, d: 0.34 },
    ]);
  }

  /** Fruit collected -- peach gets an extra sparkle. */
  fruit(isPeach = false) {
    this.#boot();
    if (this.#muted) return;
    if (isPeach) {
      this.#seq([
        { f: 523, d: 0.07 }, { f: 659, d: 0.07 }, { f: 784,  d: 0.07 },
        { f:1047, d: 0.07 }, { f:1319, d: 0.07 }, { f:1568,  d: 0.15 },
      ]);
    } else {
      this.#seq([{ f: 659, d: 0.09 }, { f: 784, d: 0.09 }, { f: 1047, d: 0.14 }]);
    }
  }

  /** Danger sting when the level timer expires. */
  timeUp() {
    this.#boot();
    if (this.#muted) return;
    const now = this.#ctx.currentTime;
    [[880, 0.12],[698, 0.12],[587, 0.12],[440, 0.26]]
      .forEach(([f, d], i) => this.#note(f, d, 0.28, 'square', now + i * 0.13));
  }

  // ====================================================== CONTINUOUS LOOPS
  //
  // Each loop tick fires an independent short note via setInterval.
  // The interval period = note duration, so notes butt up with no overlap.
  //
  // On stop(), clearInterval() is called immediately.
  // The current in-flight note (at most ~80ms long) finishes naturally --
  // this is inaudible as a "tail" compared to the previous 300ms lookahead.

  // ----------------------- SIREN

  #fireSiren() {
    if (this.#muted || !this.#ctx) return;
    const table = this.#sirenFast ? ArcadeSound.#SIR_FAST : ArcadeSound.#SIR_SLOW;
    const f     = table[this.#sirenStep % table.length];
    const dur   = this.#sirenFast ? 0.060 : 0.085;
    this.#note(f, dur, 0.10, 'sawtooth');
    this.#sirenStep++;
  }

  sirenStart() {
    this.#boot();
    if (this.#sirenIv !== null) return;   // already running
    this.#sirenFast = false;
    this.#sirenStep = 0;
    this.#fireSiren();                    // immediate first note
    this.#sirenIv = setInterval(() => this.#fireSiren(), 88);
  }

  sirenFast() {
    if (this.#sirenIv === null) { this.sirenStart(); }
    this.#sirenFast = true;              // next tick picks up fast table
  }

  sirenStop() {
    if (this.#sirenIv !== null) {
      clearInterval(this.#sirenIv);
      this.#sirenIv = null;
    }
  }

  // ----------------------- FRIGHT (warble during frightened mode)

  #fireFright() {
    if (this.#muted || !this.#ctx) return;
    const f = ArcadeSound.#FRIGHT[this.#frightStep % ArcadeSound.#FRIGHT.length];
    this.#note(f, 0.068, 0.09, 'square');
    this.#frightStep++;
  }

  frightStart() {
    this.sirenStop();             // fright replaces siren
    this.#boot();
    if (this.#frightIv !== null) return;  // already running
    this.#frightStep = 0;
    this.#fireFright();           // immediate first note
    this.#frightIv = setInterval(() => this.#fireFright(), 72);
  }

  frightStop() {
    if (this.#frightIv !== null) {
      clearInterval(this.#frightIv);
      this.#frightIv = null;
    }
  }

  // --------------------------------------------------------------- MUTE ---
  toggleMute() {
    this.#muted = !this.#muted;
    if (this.#master) {
      const t = this.#ctx ? this.#ctx.currentTime : 0;
      this.#master.gain.cancelScheduledValues(t);
      this.#master.gain.setValueAtTime(this.#muted ? 0 : 0.28, t);
    }
    return this.#muted;
  }
}

export const snd = new ArcadeSound();
