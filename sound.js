/**
 * sound.js -- Ms. Pac-Man "Georgia Peach Edition"
 *
 * All sounds synthesised with Web Audio API. No audio files required.
 * Approximates the Namco WSG (Waveform Sound Generator) chip palette.
 *
 * LOOP DESIGN -- zero click/glitch approach:
 *   One persistent OscillatorNode per continuous sound (siren, fright).
 *   Frequency is stepped via AudioParam.setValueAtTime() on the AudioContext
 *   clock -- no node creation/destruction mid-play, which is what causes pops.
 *   requestAnimationFrame drives the scheduler; it pre-fills a 300ms lookahead
 *   buffer so there are never gaps, even under heavy CPU load.
 */

class ArcadeSound {

  // Core context
  #ctx    = null;   // AudioContext
  #master = null;   // master GainNode  (volume + mute)
  #muted  = false;

  // Siren loop (sawtooth, continuous)
  #sirOsc    = null;
  #sirGain   = null;
  #sirRaf    = null;
  #sirFast   = false;
  #sirStep   = 0;
  #sirNext   = 0;

  // Fright loop (square, continuous)
  #frtOsc    = null;
  #frtGain   = null;
  #frtRaf    = null;
  #frtStep   = 0;
  #frtNext   = 0;

  // Waka alternation flag
  #wakaFlip  = false;

  // Frequency tables for loops
  static #SIR_SLOW = [200,212,224,236,248,258,248,236,224,212];
  static #SIR_FAST = [262,278,294,310,326,310,294,278];
  static #FRT_TBLE = [138,156,143,162,148,168,146,160];

  // ------------------------------------------- AudioContext boot
  #boot() {
    if (this.#ctx) {
      // Resume if browser suspended it (autoplay policy)
      if (this.#ctx.state === 'suspended') this.#ctx.resume();
      return;
    }
    this.#ctx    = new (window.AudioContext || window.webkitAudioContext)();
    this.#master = this.#ctx.createGain();
    this.#master.gain.value = 0.30;
    this.#master.connect(this.#ctx.destination);
  }

  // ------------------------------------------- Primitive: one-shot osc
  //  freq  -- Hz
  //  dur   -- seconds
  //  vol   -- peak gain (0..1)
  //  shape -- OscillatorType
  //  at    -- AudioContext time to start (defaults to now)
  #note(freq, dur, vol = 0.22, shape = 'square', at = null) {
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

  // Schedule an array of {f, d, v?, shape?} notes back-to-back
  #seq(notes, startAt = null) {
    if (this.#muted || !this.#ctx) return;
    let t = startAt ?? (this.#ctx.currentTime + 0.04);
    for (const { f, d, v = 0.22, shape = 'square' } of notes) {
      if (f > 0) this.#note(f, d, v, shape, t);
      t += d + 0.005;
    }
    return t;
  }

  // ============================================= ONE-SHOT SOUNDS

  /**
   * start()
   * Classic Ms. Pac-Man intro jingle -- ascending then descending scale.
   * Plays once when a new game begins (before READY!).
   */
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

  /**
   * waka()
   * Alternating two-tone chomp for each dot eaten.
   */
  waka() {
    this.#boot();
    if (this.#muted) return;
    this.#note(this.#wakaFlip ? 410 : 290, 0.058, 0.18, 'square');
    this.#wakaFlip = !this.#wakaFlip;
  }

  /**
   * power()
   * Descending frequency sweep (900 Hz -> 80 Hz) on power pellet.
   */
  power() {
    this.#boot();
    if (this.#muted || !this.#ctx) return;
    const now = this.#ctx.currentTime;
    const osc = this.#ctx.createOscillator();
    const env = this.#ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(900, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.44);
    env.gain.setValueAtTime(0.28, now);
    env.gain.exponentialRampToValueAtTime(0.0001, now + 0.44);
    osc.connect(env); env.connect(this.#master);
    osc.start(now); osc.stop(now + 0.46);
  }

  /**
   * ghost(mul)
   * Ascending 4-note chord when a ghost is eaten.
   * Pitch rises with the combo multiplier (200 / 400 / 800 / 1600).
   */
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
    ].forEach(([f, d], i) => this.#note(f, d, 0.22, 'square', now + i * 0.085));
  }

  /**
   * death()
   * 16-step chromatic descending crash (960 -> 80 Hz).
   */
  death() {
    this.#boot();
    if (this.#muted) return;
    const now   = this.#ctx.currentTime;
    const freqs = [960,900,840,780,720,660,600,540,480,420,360,300,240,180,120,80];
    freqs.forEach((f, i) => this.#note(f, 0.082, 0.28, 'square', now + i * 0.078));
  }

  /**
   * levelClear()
   * Short ascending fanfare when all dots are cleared.
   */
  levelClear() {
    this.#boot();
    if (this.#muted) return;
    this.#seq([
      { f: 523,  d: 0.10 },
      { f: 659,  d: 0.10 },
      { f: 784,  d: 0.10 },
      { f: 1047, d: 0.10 },
      { f: 784,  d: 0.06 },
      { f: 880,  d: 0.06 },
      { f: 1047, d: 0.34 },
    ]);
  }

  /**
   * fruit(isPeach)
   * Bonus fruit collected.  Peach gets an extra sparkle cascade.
   */
  fruit(isPeach = false) {
    this.#boot();
    if (this.#muted) return;
    if (isPeach) {
      this.#seq([
        { f: 523,  d: 0.07 }, { f: 659,  d: 0.07 },
        { f: 784,  d: 0.07 }, { f: 1047, d: 0.07 },
        { f: 1319, d: 0.07 }, { f: 1568, d: 0.15 },
      ]);
    } else {
      this.#seq([
        { f: 659,  d: 0.09 },
        { f: 784,  d: 0.09 },
        { f: 1047, d: 0.14 },
      ]);
    }
  }

  /**
   * timeUp()
   * 4-note danger sting when the level countdown timer hits zero.
   */
  timeUp() {
    this.#boot();
    if (this.#muted) return;
    const now = this.#ctx.currentTime;
    [[880,0.12],[698,0.12],[587,0.12],[440,0.26]]
      .forEach(([f, d], i) => this.#note(f, d, 0.30, 'square', now + i * 0.13));
  }

  // ============================================= CONTINUOUS LOOPS
  //
  // Pattern:  one OscillatorNode + one GainNode, started once.
  //           A rAF callback pre-schedules frequency + gain steps
  //           300 ms ahead on the AudioContext timeline.
  //           This avoids ALL node churn and produces zero glitches.

  // -------------------- SIREN (background, always running during play)

  #sirLoop = () => {
    if (!this.#ctx || !this.#sirOsc) return;
    const now   = this.#ctx.currentTime;
    const table = this.#sirFast ? ArcadeSound.#SIR_FAST : ArcadeSound.#SIR_SLOW;
    const step  = this.#sirFast ? 0.058 : 0.088;
    const vol   = this.#muted   ? 0     : 0.115;
    const duck  = this.#muted   ? 0     : 0.030;

    while (this.#sirNext < now + 0.30) {
      const f = table[this.#sirStep % table.length];
      this.#sirOsc.frequency.setValueAtTime(f, this.#sirNext);
      this.#sirGain.gain.setValueAtTime(vol,  this.#sirNext);
      this.#sirGain.gain.setValueAtTime(duck, this.#sirNext + step * 0.55);
      this.#sirNext += step;
      this.#sirStep++;
    }
    this.#sirRaf = requestAnimationFrame(this.#sirLoop);
  };

  sirenStart() {
    this.#boot();
    if (this.#sirOsc) return;          // already running
    this.#sirFast = false;
    this.#sirStep = 0;
    this.#sirNext = this.#ctx.currentTime + 0.02;

    this.#sirOsc  = this.#ctx.createOscillator();
    this.#sirGain = this.#ctx.createGain();
    this.#sirOsc.type = 'sawtooth';
    this.#sirOsc.frequency.value = 200;
    this.#sirGain.gain.value = 0;
    this.#sirOsc.connect(this.#sirGain);
    this.#sirGain.connect(this.#master);
    this.#sirOsc.start();
    this.#sirLoop();
  }

  sirenFast() {
    // Swap to fast table without restarting the node
    if (!this.#sirOsc) { this.sirenStart(); }
    this.#sirFast = true;
  }

  sirenStop() {
    if (this.#sirRaf) { cancelAnimationFrame(this.#sirRaf); this.#sirRaf = null; }
    if (this.#sirOsc) {
      try { this.#sirOsc.stop(); } catch (_) {}
      this.#sirOsc.disconnect();
      this.#sirGain.disconnect();
      this.#sirOsc = null;
      this.#sirGain = null;
    }
  }

  // -------------------- FRIGHT (warble during frightened mode)

  #frtLoop = () => {
    if (!this.#ctx || !this.#frtOsc) return;
    const now  = this.#ctx.currentTime;
    const step = 0.070;
    const vol  = this.#muted ? 0 : 0.105;
    const duck = this.#muted ? 0 : 0.028;

    while (this.#frtNext < now + 0.30) {
      const f = ArcadeSound.#FRT_TBLE[this.#frtStep % ArcadeSound.#FRT_TBLE.length];
      this.#frtOsc.frequency.setValueAtTime(f, this.#frtNext);
      this.#frtGain.gain.setValueAtTime(vol,  this.#frtNext);
      this.#frtGain.gain.setValueAtTime(duck, this.#frtNext + step * 0.58);
      this.#frtNext += step;
      this.#frtStep++;
    }
    this.#frtRaf = requestAnimationFrame(this.#frtLoop);
  };

  frightStart() {
    this.sirenStop();          // fright replaces siren
    this.#boot();
    if (this.#frtOsc) return;
    this.#frtStep = 0;
    this.#frtNext = this.#ctx.currentTime + 0.02;

    this.#frtOsc  = this.#ctx.createOscillator();
    this.#frtGain = this.#ctx.createGain();
    this.#frtOsc.type = 'square';
    this.#frtOsc.frequency.value = 138;
    this.#frtGain.gain.value = 0;
    this.#frtOsc.connect(this.#frtGain);
    this.#frtGain.connect(this.#master);
    this.#frtOsc.start();
    this.#frtLoop();
  }

  frightStop() {
    if (this.#frtRaf) { cancelAnimationFrame(this.#frtRaf); this.#frtRaf = null; }
    if (this.#frtOsc) {
      try { this.#frtOsc.stop(); } catch (_) {}
      this.#frtOsc.disconnect();
      this.#frtGain.disconnect();
      this.#frtOsc = null;
      this.#frtGain = null;
    }
  }

  // ============================================= MUTE TOGGLE
  toggleMute() {
    this.#muted = !this.#muted;
    // Ramp master gain smoothly (avoids click on sudden change)
    if (this.#master) {
      const t = this.#ctx ? this.#ctx.currentTime : 0;
      this.#master.gain.setTargetAtTime(
        this.#muted ? 0 : 0.30,
        t, 0.05
      );
    }
    return this.#muted;
  }
}

export const snd = new ArcadeSound();
