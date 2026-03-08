/**
 * sound.js \u2014 Ms. Pac-Man "Georgia Peach Edition"
 * Classic arcade sounds synthesised via Web Audio API.
 * No external audio files required.
 * Approximates the original Namco WSG chip sound palette.
 */

'use strict';

class ArcadeSound {
  #actx   = null;   // AudioContext
  #master = null;   // master GainNode
  #muted  = false;

  // continuous loop handles
  #sirenTick  = null;
  #sirenStep  = 0;
  #frightTick = null;
  #frightStep = 0;

  // waka alternation
  #wakaAlt = false;

  // ------------------------------------------------------------------ boot --
  #boot() {
    if (this.#actx) { this.#actx.resume(); return; }
    this.#actx   = new (window.AudioContext || window.webkitAudioContext)();
    this.#master = this.#actx.createGain();
    this.#master.gain.value = 0.32;
    this.#master.connect(this.#actx.destination);
  }

  // Play one oscillator envelope starting at optional absolute time `at`
  #osc(freq, dur, vol = 0.25, type = 'square', at = null) {
    if (this.#muted || !this.#actx) return;
    const t   = at ?? this.#actx.currentTime;
    const osc = this.#actx.createOscillator();
    const g   = this.#actx.createGain();
    osc.type  = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(this.#master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  // Play an array of notes [{f,d,v?,type?}] with tiny gaps between them
  #seq(notes, baseAt = null) {
    if (this.#muted || !this.#actx) return;
    let t = baseAt ?? (this.#actx.currentTime + 0.04);
    notes.forEach(({ f, d, v = 0.24, type = 'square' }) => {
      if (f > 0) this.#osc(f, d, v, type, t);
      t += d + 0.006;
    });
    return t;
  }

  // --------------------------------------------------------- one-shot sounds -

  /**
   * Classic Pac-Man / Ms. Pac-Man coin-insert intro jingle.
   * The ascending-then-descending melody heard before READY.
   */
  start() {
    this.#boot();
    if (this.#muted) return;
    this.#seq([
      { f: 494, d: 0.08 }, { f: 0, d: 0.03 },
      { f: 587, d: 0.08 }, { f: 0, d: 0.03 },
      { f: 698, d: 0.08 }, { f: 0, d: 0.03 },
      { f: 784, d: 0.15 }, { f: 0, d: 0.04 },
      { f: 698, d: 0.08 },
      { f: 784, d: 0.22 }, { f: 0, d: 0.06 },
      { f: 740, d: 0.08 }, { f: 0, d: 0.03 },
      { f: 659, d: 0.08 }, { f: 0, d: 0.03 },
      { f: 587, d: 0.08 }, { f: 0, d: 0.03 },
      { f: 523, d: 0.08 }, { f: 0, d: 0.03 },
      { f: 494, d: 0.08 }, { f: 0, d: 0.03 },
      { f: 440, d: 0.28 },
    ]);
  }

  /** Alternating two-tone waka for each dot eaten. */
  waka() {
    this.#boot();
    if (this.#muted) return;
    this.#osc(this.#wakaAlt ? 420 : 300, 0.055, 0.2, 'square');
    this.#wakaAlt = !this.#wakaAlt;
  }

  /** Descending frequency sweep when power pellet is eaten. */
  power() {
    this.#boot();
    if (this.#muted || !this.#actx) return;
    const now = this.#actx.currentTime;
    const osc = this.#actx.createOscillator();
    const g   = this.#actx.createGain();
    osc.type  = 'square';
    osc.frequency.setValueAtTime(900, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.42);
    g.gain.setValueAtTime(0.3, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
    osc.connect(g);
    g.connect(this.#master);
    osc.start(now);
    osc.stop(now + 0.44);
  }

  /** Ascending tones when ghost is eaten; pitch rises with multiplier. */
  ghost(mul = 1) {
    this.#boot();
    if (this.#muted) return;
    const base = Math.min(120 * mul, 960);
    const now  = this.#actx.currentTime;
    [
      [base,      0.09],
      [base * 1.5, 0.09],
      [base * 2,   0.09],
      [base * 3,   0.14],
    ].forEach(([f, d], i) => this.#osc(f, d, 0.24, 'square', now + i * 0.085));
  }

  /**
   * Classic descending chromatic death sound.
   * 16 steps from 960 Hz down to 80 Hz.
   */
  death() {
    this.#boot();
    if (this.#muted) return;
    const now   = this.#actx.currentTime;
    const freqs = [960,900,840,780,720,660,600,540,480,420,360,300,240,180,120,80];
    freqs.forEach((f, i) => this.#osc(f, 0.08, 0.3, 'square', now + i * 0.075));
  }

  /** Short ascending fanfare when all dots are cleared. */
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
      { f: 1047, d: 0.32 },
    ]);
  }

  /** Sound for collecting bonus fruit; special cascade for peach. */
  fruit(isPeach = false) {
    this.#boot();
    if (this.#muted) return;
    if (isPeach) {
      this.#seq([
        { f: 523,  d: 0.07 }, { f: 659,  d: 0.07 },
        { f: 784,  d: 0.07 }, { f: 1047, d: 0.07 },
        { f: 1319, d: 0.07 }, { f: 1568, d: 0.14 },
      ]);
    } else {
      this.#seq([
        { f: 659,  d: 0.09 },
        { f: 784,  d: 0.09 },
        { f: 1047, d: 0.14 },
      ]);
    }
  }

  /** Danger sting played when the level timer hits zero. */
  timeUp() {
    this.#boot();
    if (this.#muted) return;
    const now = this.#actx.currentTime;
    [[880,0.12],[698,0.12],[587,0.12],[440,0.24]]
      .forEach(([f, d], i) => this.#osc(f, d, 0.32, 'square', now + i * 0.13));
  }

  // ------------------------------------------------------ continuous loops --

  /**
   * Background siren that loops continuously.
   * Call sirenFast() when fewer than 30 dots remain.
   */
  sirenStart() {
    this.#boot();
    if (this.#sirenTick) return;
    const NOTES = [200,210,220,230,240,250,240,230,220,210];
    this.#sirenStep = 0;
    this.#sirenTick = setInterval(() => {
      if (this.#muted || !this.#actx) return;
      const f = NOTES[this.#sirenStep % NOTES.length];
      this.#osc(f, 0.09, 0.1, 'sawtooth');
      this.#sirenStep++;
    }, 85);
  }

  sirenStop() {
    if (this.#sirenTick) { clearInterval(this.#sirenTick); this.#sirenTick = null; }
  }

  sirenFast() {
    this.sirenStop();
    this.#boot();
    const NOTES = [260,275,290,305,320,305,290,275];
    this.#sirenStep = 0;
    this.#sirenTick = setInterval(() => {
      if (this.#muted || !this.#actx) return;
      const f = NOTES[this.#sirenStep % NOTES.length];
      this.#osc(f, 0.06, 0.1, 'sawtooth');
      this.#sirenStep++;
    }, 55);
  }

  /** Warbling tone during frightened mode. */
  frightStart() {
    this.sirenStop();
    this.#boot();
    if (this.#frightTick) return;
    const NOTES = [140,155,145,162,150,168,148,160];
    this.#frightStep = 0;
    this.#frightTick = setInterval(() => {
      if (this.#muted || !this.#actx) return;
      this.#osc(NOTES[this.#frightStep % NOTES.length], 0.06, 0.09, 'square');
      this.#frightStep++;
    }, 65);
  }

  frightStop() {
    if (this.#frightTick) { clearInterval(this.#frightTick); this.#frightTick = null; }
  }

  // ----------------------------------------------------------------- mute --
  toggleMute() {
    this.#muted = !this.#muted;
    if (this.#master) this.#master.gain.value = this.#muted ? 0 : 0.32;
    return this.#muted;
  }
}

export const snd = new ArcadeSound();
