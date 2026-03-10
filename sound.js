/**
 * sound.js — BABS' PAC-MAN Georgia Peach Edition
 * ═══════════════════════════════════════════════════════════════════════════
 * Uses authentic Ms. Pac-Man arcade WAV files.
 * All files live in  assets/sounds/ms_*.wav
 * Falls back to Web Audio synthesis if any file fails to load.
 *
 * FILE MAP:
 *   ms_start.wav              — opening jingle (4.2s, plays once)
 *   ms_eat_dot.wav            — waka chomp (0.12s, called per dot)
 *   ms_eat_ghost.wav          — ghost eaten (0.48s)
 *   ms_fruit_bounce.wav       — fruit collected (0.08s)
 *   ms_fright.wav             — fright music LOOP (33.8s long loop)
 *   ms_eyes.wav               — eaten ghost eyes LOOP (1.83s loop)
 *   ms_eyes_firstloop.wav     — first iteration before looping eyes
 *   ms_siren0.wav             — siren loop, full dots
 *   ms_siren0_firstloop.wav   — first pass of siren0
 *   ms_siren1.wav             — siren loop, ~75% dots eaten
 *   ms_siren1_firstloop.wav
 *   ms_siren2.wav             — siren loop, ~50% dots eaten
 *   ms_siren2_firstloop.wav
 *   ms_siren3.wav             — siren loop, ~25% dots eaten
 *   ms_siren3_firstloop.wav
 *   ms_siren4.wav             — siren loop, <10% dots eaten (fastest)
 *
 * SIREN PROGRESSION:
 *   dotsLeft > 75%  → siren0   (slowest)
 *   dotsLeft > 50%  → siren1
 *   dotsLeft > 25%  → siren2
 *   dotsLeft > 10%  → siren3
 *   dotsLeft <= 10% → siren4   (fastest)
 *
 *   Each siren tier uses: firstloop.wav played once, then .wav looped forever.
 *   On tier change: stop current, start new tier from firstloop.
 *
 * LOOP ENGINE:
 *   BufferSource nodes with .loop=true for fright, eyes, siren.
 *   Stop = source.stop() + disconnect. Instant silence, no oscillator overhead.
 *
 * Exposed as  window.SOUND  — no ES module needed.
 * game.js calls: SOUND.sirenUpdate(dotsLeft, totalDots) each frame when playing.
 */

window.SOUND = (() => {
  'use strict';

  let ctx    = null;
  let master = null;
  let muted  = false;

  // ── Loaded AudioBuffers ─────────────────────────────────────────────────
  const B = {};   // key → AudioBuffer, populated by loadAll()

  const FILES = {
    start:            'assets/sounds/ms_start.wav',
    eat_dot:          'assets/sounds/ms_eat_dot.wav',
    eat_ghost:        'assets/sounds/ms_eat_ghost.wav',
    fruit:            'assets/sounds/ms_fruit_bounce.wav',
    fright:           'assets/sounds/ms_fright.wav',
    eyes:             'assets/sounds/ms_eyes.wav',
    eyes_first:       'assets/sounds/ms_eyes_firstloop.wav',
    siren0:           'assets/sounds/ms_siren0.wav',
    siren0_first:     'assets/sounds/ms_siren0_firstloop.wav',
    siren1:           'assets/sounds/ms_siren1.wav',
    siren1_first:     'assets/sounds/ms_siren1_firstloop.wav',
    siren2:           'assets/sounds/ms_siren2.wav',
    siren2_first:     'assets/sounds/ms_siren2_firstloop.wav',
    siren3:           'assets/sounds/ms_siren3.wav',
    siren3_first:     'assets/sounds/ms_siren3_firstloop.wav',
    siren4:           'assets/sounds/ms_siren4.wav',
    death:            'assets/sounds/ms_death.wav',
    eat_fruit:        'assets/sounds/eat_fruit.wav',
    intermission:     'assets/sounds/ms_intermission1.wav',
    intermission_bump:'assets/sounds/ms_intermission1_bump.wav',
  };

  // ── Active loop nodes ───────────────────────────────────────────────────
  let sirenNode  = null;   // current siren BufferSource
  let sirenGain  = null;   // GainNode for siren
  let sirenTier  = -1;     // 0-4, which siren is playing
  let sirenPhase = 0;      // 0=firstloop, 1=main loop

  let frightNode = null;
  let frightGain = null;

  let eyesNode   = null;
  let eyesGain   = null;
  let eyesActive = false;

  let wakaFlip   = false;

  // ── Boot ────────────────────────────────────────────────────────────────
  function boot() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    ctx    = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
    loadAll();
  }

  function loadAll() {
    for (const [key, url] of Object.entries(FILES)) {
      fetch(url)
        .then(r => { if (!r.ok) throw 0; return r.arrayBuffer(); })
        .then(ab => ctx.decodeAudioData(ab))
        .then(decoded => { B[key] = decoded; })
        .catch(() => { /* WAV missing — synth fallback kicks in */ });
    }
  }

  // ── Low-level helpers ───────────────────────────────────────────────────
  // Play a one-shot buffer, returns the source node
  function playBuf(key, vol = 1.0, loop = false, onended = null) {
    if (muted || !ctx || !B[key]) return null;
    const src = ctx.createBufferSource();
    const g   = ctx.createGain();
    src.buffer       = B[key];
    src.loop         = loop;
    g.gain.value     = vol;
    src.connect(g);
    g.connect(master);
    if (onended) src.onended = onended;
    src.start();
    return { src, g };
  }

  function stopNode(node) {
    if (!node) return;
    try { node.src.stop(); } catch (_) {}
    try { node.src.disconnect(); node.g.disconnect(); } catch (_) {}
  }

  // Synth fallback primitives
  function note(freq, dur, vol = 0.18, shape = 'square', at = null) {
    if (muted || !ctx) return;
    const t = at ?? ctx.currentTime;
    const o = ctx.createOscillator(), e = ctx.createGain();
    o.type = shape; o.frequency.setValueAtTime(freq, t);
    e.gain.setValueAtTime(vol, t);
    e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(e); e.connect(master);
    o.start(t); o.stop(t + dur + 0.015);
  }
  function seq(notes, at = null) {
    if (muted || !ctx) return;
    let t = at ?? (ctx.currentTime + 0.04);
    for (const { f, d, v = 0.18, s = 'square' } of notes) {
      if (f > 0) note(f, d, v, s, t); t += d + 0.005;
    }
  }

  // ══════════════════════════════ ONE-SHOT SOUNDS ═════════════════════════

  function start() {
    boot();
    if (!playBuf('start', 0.95)) {
      seq([
        {f:494,d:0.09},{f:0,d:0.03},{f:370,d:0.07},{f:0,d:0.02},
        {f:311,d:0.07},{f:0,d:0.02},{f:330,d:0.07},{f:0,d:0.02},
        {f:494,d:0.09},{f:0,d:0.03},{f:370,d:0.15},{f:0,d:0.05},
        {f:494,d:0.09},{f:0,d:0.03},{f:370,d:0.07},{f:0,d:0.02},
        {f:494,d:0.20},{f:0,d:0.06},
        {f:587,d:0.08},{f:698,d:0.08},{f:784,d:0.08},{f:988,d:0.22},
      ]);
    }
  }

  function waka() {
    boot();
    if (muted) return;
    if (B.eat_dot) {
      const src = ctx.createBufferSource(), g = ctx.createGain();
      src.buffer = B.eat_dot;
      // Alternate pitch like real arcade waka-waka
      src.playbackRate.value = wakaFlip ? 1.0 : 1.20;
      g.gain.value = 0.85;
      src.connect(g); g.connect(master); src.start();
    } else {
      note(wakaFlip ? 440 : 330, 0.058, 0.16, 'square');
    }
    wakaFlip = !wakaFlip;
  }

  function eatGhost(mul = 1) {
    boot();
    if (!playBuf('eat_ghost', 0.90)) {
      if (!ctx) return;
      const base = Math.min(110 * mul, 880), now = ctx.currentTime;
      [[base,0.09],[base*1.5,0.09],[base*2,0.09],[base*3,0.14]]
        .forEach(([f,d],i) => note(f, d, 0.20, 'square', now + i * 0.085));
    }
  }

  function fruit(isPeach = false) {
    boot();
    // eat_fruit.wav is the real arcade fruit-eaten sound
    if (!playBuf('eat_fruit', 0.90)) {
      // Fallback: also try older 'fruit' key, then synth
      if (!playBuf('fruit', 0.90)) {
        if (isPeach) {
          seq([{f:523,d:0.07},{f:659,d:0.07},{f:784,d:0.07},
               {f:1047,d:0.07},{f:1319,d:0.07},{f:1568,d:0.15}]);
        } else {
          seq([{f:659,d:0.09},{f:784,d:0.09},{f:1047,d:0.14}]);
        }
      }
    }
    // Peach shimmer layer on top regardless
    if (isPeach && ctx && !muted) {
      seq([{f:1319,d:0.07},{f:1568,d:0.07},{f:2093,d:0.14}],
          ctx.currentTime + 0.10);
    }
  }

  function death() {
    boot();
    if (!playBuf('death', 0.95)) {
      // Synth fallback: descending chromatic crash
      if (ctx && !muted) {
        const now = ctx.currentTime;
        [960,900,840,780,720,660,600,540,480,420,360,300,240,185,140,80]
          .forEach((f, i) => note(f, 0.082, 0.24, 'sawtooth', now + i * 0.078));
      }
    }
  }

  function levelClear() {
    boot();
    if (muted) return;
    seq([{f:523,d:0.10},{f:659,d:0.10},{f:784,d:0.10},{f:1047,d:0.10},
         {f:784,d:0.06},{f:880,d:0.06},{f:1047,d:0.34}]);
  }

  // Power pellet — synth sweep (no dedicated WAV in this set)
  function power() {
    boot();
    if (!ctx || muted) return;
    const now = ctx.currentTime;
    const o = ctx.createOscillator(), e = ctx.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(150, now);
    o.frequency.exponentialRampToValueAtTime(850, now + 0.30);
    e.gain.setValueAtTime(0.22, now);
    e.gain.exponentialRampToValueAtTime(0.0001, now + 0.30);
    o.connect(e); e.connect(master);
    o.start(now); o.stop(now + 0.32);
  }

  // ══════════════════════════════ SIREN SYSTEM ════════════════════════════
  //
  // Five tiers (0=slowest … 4=fastest). Each tier has a firstloop + main loop.
  // Called by game.js every frame via sirenUpdate(dotsLeft, totalDots).
  //
  // Tier thresholds (fraction of dots remaining):
  //   tier 0: > 0.75
  //   tier 1: > 0.50
  //   tier 2: > 0.25
  //   tier 3: > 0.10
  //   tier 4: ≤ 0.10

  function sirenTierFor(dotsLeft, totalDots) {
    const frac = totalDots > 0 ? dotsLeft / totalDots : 1;
    if (frac > 0.75) return 0;
    if (frac > 0.50) return 1;
    if (frac > 0.25) return 2;
    if (frac > 0.10) return 3;
    return 4;
  }

  function _startSirenTier(tier) {
    _stopSiren();
    sirenTier  = tier;
    sirenPhase = 0;

    // Create a gain node we can fade with
    sirenGain = ctx.createGain();
    sirenGain.gain.value = muted ? 0 : 1.0;
    sirenGain.connect(master);

    const firstKey = tier === 4 ? null : `siren${tier}_first`;
    const loopKey  = `siren${tier}`;

    if (firstKey && B[firstKey]) {
      // Play firstloop once, then chain into the main loop
      const src = ctx.createBufferSource();
      src.buffer = B[firstKey];
      src.loop   = false;
      src.connect(sirenGain);
      src.onended = () => {
        if (sirenTier !== tier) return; // tier changed while playing
        _chainSirenLoop(tier);
      };
      src.start();
      sirenNode = { src, g: sirenGain };
    } else if (B[loopKey]) {
      _chainSirenLoop(tier);
    } else {
      // Synth fallback — persistent oscillator
      _startSynthSiren();
    }
  }

  function _chainSirenLoop(tier) {
    if (sirenTier !== tier) return;
    const loopKey = `siren${tier}`;
    if (!B[loopKey]) return;
    sirenPhase = 1;

    // Ensure gain node exists
    if (!sirenGain || !sirenGain.gain) {
      sirenGain = ctx.createGain();
      sirenGain.gain.value = muted ? 0 : 1.0;
      sirenGain.connect(master);
    }

    const src = ctx.createBufferSource();
    src.buffer = B[loopKey];
    src.loop   = true;
    src.connect(sirenGain);
    src.start();
    sirenNode = { src, g: sirenGain };
  }

  function _stopSiren() {
    stopNode(sirenNode);
    sirenNode  = null;
    sirenTier  = -1;
    sirenPhase = 0;
    if (sirenGain) { try { sirenGain.disconnect(); } catch(_){} sirenGain = null; }
    _stopSynthSiren();
  }

  // ── Synth siren fallback (oscillator, used if WAVs missing) ────────────
  let _synthSirOsc = null, _synthSirGain = null, _synthSirRaf = null;
  let _synthStep = 0, _synthNext = 0, _synthFast = false;
  const _SIR_SLOW = [200,210,221,233,246,233,221,210];
  const _SIR_FAST = [268,286,302,320,336,320,302,286];

  function _startSynthSiren() {
    if (_synthSirOsc) return;
    _synthSirOsc  = ctx.createOscillator();
    _synthSirGain = ctx.createGain();
    _synthSirOsc.type = 'sawtooth'; _synthSirOsc.frequency.value = 200;
    _synthSirGain.gain.value = 0;
    _synthSirOsc.connect(_synthSirGain); _synthSirGain.connect(master);
    _synthSirOsc.start();
    _synthStep = 0; _synthNext = ctx.currentTime;
    const loop = () => {
      if (!_synthSirOsc) return;
      const now = ctx.currentTime;
      const tbl = _synthFast ? _SIR_FAST : _SIR_SLOW;
      const step = _synthFast ? 0.052 : 0.088;
      const vol  = muted ? 0 : 0.07;
      while (_synthNext < now + 0.12) {
        _synthSirOsc.frequency.setValueAtTime(tbl[_synthStep % tbl.length], _synthNext);
        _synthSirGain.gain.setValueAtTime(vol, _synthNext);
        _synthSirGain.gain.setValueAtTime(0, _synthNext + step * 0.4);
        _synthNext += step; _synthStep++;
      }
      _synthSirRaf = requestAnimationFrame(loop);
    };
    loop();
  }
  function _stopSynthSiren() {
    if (_synthSirRaf) { cancelAnimationFrame(_synthSirRaf); _synthSirRaf = null; }
    if (_synthSirGain && ctx) {
      _synthSirGain.gain.cancelScheduledValues(ctx.currentTime);
      _synthSirGain.gain.setValueAtTime(0, ctx.currentTime);
    }
    if (_synthSirOsc) { try { _synthSirOsc.stop(); } catch(_){} _synthSirOsc = null; }
    _synthSirGain = null;
  }

  // ── Public siren API ────────────────────────────────────────────────────
  function sirenStart(dotsLeft, totalDots) {
    boot();
    if (muted) return;
    const tier = sirenTierFor(dotsLeft ?? 999, totalDots ?? 1000);
    if (sirenTier === tier && sirenNode) return; // already playing correct tier
    _startSirenTier(tier);
  }

  // Called every game frame while playing — handles tier transitions automatically
  function sirenUpdate(dotsLeft, totalDots) {
    if (muted || !ctx) return;
    const tier = sirenTierFor(dotsLeft, totalDots);
    if (sirenTier !== tier) {
      _startSirenTier(tier);
    }
  }

  function sirenStop() {
    _stopSiren();
    _stopSynthSiren();
  }

  // Legacy: sirenFast() maps to tier 4
  function sirenFast() {
    boot();
    if (sirenTier !== 4) _startSirenTier(4);
  }

  // ══════════════════════════════ FRIGHT LOOP ═════════════════════════════

  function frightStart() {
    boot();
    sirenStop(); // silence siren instantly

    if (frightNode) return; // already running

    if (B.fright) {
      frightGain = ctx.createGain();
      frightGain.gain.value = muted ? 0 : 1.0;
      frightGain.connect(master);

      const src = ctx.createBufferSource();
      src.buffer = B.fright;
      src.loop   = true;
      src.connect(frightGain);
      src.start();
      frightNode = { src, g: frightGain };
    } else {
      // Synth fallback
      _startSynthFright();
    }
  }

  function frightStop() {
    stopNode(frightNode); frightNode = null;
    if (frightGain) { try { frightGain.disconnect(); } catch(_){} frightGain = null; }
    _stopSynthFright();
  }

  // Synth fright fallback
  let _frtOsc = null, _frtGain = null, _frtRaf = null, _frtStep = 0, _frtNext = 0;
  const _FRT_TBL = [138,156,142,165,149,170,144,160];
  function _startSynthFright() {
    if (_frtOsc) return;
    _frtOsc = ctx.createOscillator(); _frtGain = ctx.createGain();
    _frtOsc.type = 'square'; _frtOsc.frequency.value = 138; _frtGain.gain.value = 0;
    _frtOsc.connect(_frtGain); _frtGain.connect(master); _frtOsc.start();
    _frtStep = 0; _frtNext = ctx.currentTime;
    const loop = () => {
      if (!_frtOsc) return;
      const now = ctx.currentTime, step = 0.068, vol = muted ? 0 : 0.085;
      while (_frtNext < now + 0.12) {
        _frtOsc.frequency.setValueAtTime(_FRT_TBL[_frtStep % _FRT_TBL.length], _frtNext);
        _frtGain.gain.setValueAtTime(vol, _frtNext);
        _frtGain.gain.setValueAtTime(0, _frtNext + step * 0.5);
        _frtNext += step; _frtStep++;
      }
      _frtRaf = requestAnimationFrame(loop);
    };
    loop();
  }
  function _stopSynthFright() {
    if (_frtRaf) { cancelAnimationFrame(_frtRaf); _frtRaf = null; }
    if (_frtGain && ctx) {
      _frtGain.gain.cancelScheduledValues(ctx.currentTime);
      _frtGain.gain.setValueAtTime(0, ctx.currentTime);
    }
    if (_frtOsc) { try { _frtOsc.stop(); } catch(_){} _frtOsc = null; }
    _frtGain = null;
  }

  // ══════════════════════════════ EYES LOOP ═══════════════════════════════
  // Plays while a ghost is in "eaten eyes" mode returning to house.

  function eyesStart() {
    boot();
    if (eyesActive || muted) return;
    eyesActive = true;

    const firstKey = B.eyes_first ? 'eyes_first' : 'eyes';
    const loopKey  = 'eyes';

    if (B[firstKey]) {
      eyesGain = ctx.createGain();
      eyesGain.gain.value = muted ? 0 : 0.80;
      eyesGain.connect(master);

      const src = ctx.createBufferSource();
      src.buffer = B[firstKey];
      src.loop   = false;
      src.connect(eyesGain);
      src.onended = () => {
        if (!eyesActive) return;
        if (B[loopKey]) {
          const s2 = ctx.createBufferSource();
          s2.buffer = B[loopKey]; s2.loop = true;
          s2.connect(eyesGain); s2.start();
          eyesNode = { src: s2, g: eyesGain };
        }
      };
      src.start();
      eyesNode = { src, g: eyesGain };
    } else {
      // Synth fallback: rapid descending blip
      eyesActive = true;
    }
  }

  function eyesStop() {
    eyesActive = false;
    stopNode(eyesNode); eyesNode = null;
    if (eyesGain) { try { eyesGain.disconnect(); } catch(_){} eyesGain = null; }
  }

  // ══════════════════════════════ MUTE ════════════════════════════════════

  function toggleMute() {
    muted = !muted;
    if (master && ctx) {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setValueAtTime(muted ? 0 : 0.9, ctx.currentTime);
    }
    return muted;
  }

  // ══════════════════════════════ INTERMISSION ════════════════════════════
  // Plays the between-level cutscene music.
  // Pass onended callback so game.js knows when it finishes.

  let intermissionNode = null;

  function intermissionStart(onended) {
    boot();
    if (muted) { if (onended) onended(); return; }
    stopNode(intermissionNode); intermissionNode = null;

    if (B.intermission) {
      const g = ctx.createGain();
      g.gain.value = 0.90;
      g.connect(master);
      const src = ctx.createBufferSource();
      src.buffer = B.intermission;
      src.loop   = false;
      src.connect(g);
      src.onended = () => {
        intermissionNode = null;
        if (onended) onended();
      };
      src.start();
      intermissionNode = { src, g };
    } else {
      // Synth fallback: quick fanfare
      seq([{f:523,d:0.10},{f:659,d:0.10},{f:784,d:0.10},{f:1047,d:0.25}]);
      if (onended) setTimeout(onended, 600);
    }
  }

  function intermissionStop() {
    stopNode(intermissionNode); intermissionNode = null;
  }

  function intermissionBump() {
    boot();
    playBuf('intermission_bump', 0.85);
  }

  // ── Unified play() dispatcher
 ───────────────────────────────────────────
  function play(name, arg) {
    switch (name) {
      case 'start':      return start();
      case 'waka':       return waka();
      case 'power':      return power();
      case 'ghost':
      case 'eat-ghost':  return eatGhost(arg);
      case 'fruit':      return fruit(arg);
      case 'death':      return death();
      case 'levelClear':       return levelClear();
      case 'intermission':      return intermissionStart();
      case 'intermissionBump':  return intermissionBump();
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────
  return {
    // One-shots
    play, start, waka, power,
    ghost: eatGhost, eatGhost,
    fruit, death, levelClear,
    intermissionStart, intermissionStop, intermissionBump,
    // Siren
    sirenStart, sirenUpdate, sirenFast, sirenStop,
    // Fright
    frightStart, frightStop,
    // Eyes
    eyesStart, eyesStop,
    // Mute
    toggleMute,
    get isMuted() { return muted; },
  };
})();
