const STORAGE_KEY = 'chevalier-sfx-muted';

/** Play length for sons/meteor_pegase.* (clip stops at 5s). */
const METEOR_PEGASE_PLAY_SEC = 5;
const AIOR_PLASMA_PLAY_SEC = 4;
const AIOR_PLASMA_URL = '/assets/audio/attacks/lightning-plasma.mp3';
const HYOGA_DIAMOND_DUST_PLAY_SEC = 5;
const HYOGA_DIAMOND_DUST_URL = '/assets/audio/attacks/hyoga_diamond_dust.mp3';
/** Tonnerre de l'aube — Saint Seiya - Scorpio Milo -Antares.mp3 (offset TBD; default 0s). */
const HYOGA_DAWN_THUNDER_PLAY_SEC = 2.9;
const HYOGA_DAWN_THUNDER_START_SEC = 0;
const HYOGA_DAWN_THUNDER_URLS = [
  '/assets/audio/attacks/Saint Seiya - Scorpio Milo -Antares.mp3',
  `/assets/audio/attacks/${encodeURIComponent('Saint Seiya - Scorpio Milo -Antares.mp3')}`,
];
const SHIRYU_COLERE_DRAGON_PLAY_SEC = 3;
const SHIRYU_COLERE_DRAGON_URL = '/assets/audio/attacks/Colere_Dragon.mp3';
const DOCRATES_METEORES_HERCULE_PLAY_SEC = 14.1;
/** ~durationMs − fadeOutMs margin so clip fades with the FX tail (fade ~0.55s in _playMiloScarletNeedleFileAsync). */
const MILO_SCARLET_NEEDLE_PLAY_SEC = 3.35;
const MILO_SCARLET_NEEDLE_START_SEC = 9;
const MILO_ANTARES_PLAY_SEC = 2.8;
const MILO_ANTARES_START_SEC = 12.5;
const MILO_ANTARES_URLS = [
  '/assets/audio/attacks/Saint Seiya - Scorpio Milo -Antares.mp3',
  `/assets/audio/attacks/${encodeURIComponent('Saint Seiya - Scorpio Milo -Antares.mp3')}`,
  '/assets/audio/attacks/Antarès.mp3',
  `/assets/audio/attacks/${encodeURIComponent('Antarès.mp3')}`,
  '/assets/audio/attacks/Antares.mp3',
  '/assets/audio/attacks/milo_antares.wav',
];
const MILO_SCARLET_NEEDLE_URLS = [
  '/assets/audio/attacks/Milo x Kanon Scarleth Needle.mp3',
  `/assets/audio/attacks/${encodeURIComponent('Milo x Kanon Scarleth Needle.mp3')}`,
  '/assets/audio/attacks/Milo_x_Kanon_Scarleth_Needle.mp3',
  '/sons/Milo x Kanon Scarleth Needle.mp3',
  `/sons/${encodeURIComponent('Milo x Kanon Scarleth Needle.mp3')}`,
  '/assets/audio/attacks/Aiguille Écarlate.mp3',
  `/assets/audio/attacks/${encodeURIComponent('Aiguille Écarlate.mp3')}`,
  '/assets/audio/attacks/Aiguille_Ecarlate.mp3',
  '/assets/audio/attacks/milo_scarlet_needle.wav',
  '/assets/audio/attacks/milo_scarlet_needle.mp3',
];
const DOCRATES_METEORES_HERCULE_URLS = [
  '/assets/audio/attacks/Météore dHercule.mp3',
  '/assets/audio/attacks/Meteore_dHercule.mp3',
  '/assets/audio/attacks/Meteore_d_Hercule.mp3',
  '/assets/audio/attacks/meteore_dhercule.mp3',
  '/sons/Météore dHercule.mp3',
  '/sons/Meteore_dHercule.mp3',
];
const METEOR_PEGASE_BASES = [
  'meteor_pegase',
  'meteore_pegase',
  'meteor_pegasus',
  'meteore_pegasus',
  'meteors_pegase',
  'seiya_meteores',
];
const METEOR_PEGASE_DIRS = ['sons', 'Sons', 'assets/sons', 'assets/audio/attacks', 'sounds'];
const METEOR_PEGASE_EXTS = ['.mp4', '.mp3', '.wav', '.ogg', '.m4a', '.webm'];

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.unlocked = false;
    this.enabled = true;
    this.volume = 0.4;
    this._meteorPegaseUrl = null;
    this._meteorPegaseUrlPromise = null;
    this._meteorPegaseAudio = null;
    this._meteorPegaseStopTimer = null;
    this._meteorPegaseTimeHandler = null;
    this._aiorPlasmaAudio = null;
    this._aiorPlasmaStopTimer = null;
    this._aiorPlasmaTimeHandler = null;
    this._aiorPlasmaFadeTimer = null;
    this._aiorPlasmaSuppressHitUntil = 0;
    this._hyogaDiamondDustAudio = null;
    this._hyogaDiamondDustStopTimer = null;
    this._hyogaDiamondDustTimeHandler = null;
    this._hyogaDiamondDustFadeTimer = null;
    this._hyogaDiamondDustSuppressHitUntil = 0;
    this._hyogaDawnThunderAudio = null;
    this._hyogaDawnThunderUrl = null;
    this._hyogaDawnThunderUrlPromise = null;
    this._hyogaDawnThunderStopTimer = null;
    this._hyogaDawnThunderTimeHandler = null;
    this._hyogaDawnThunderFadeTimer = null;
    this._hyogaDawnThunderSuppressHitUntil = 0;
    this._shiryuColereDragonAudio = null;
    this._shiryuColereDragonStopTimer = null;
    this._shiryuColereDragonTimeHandler = null;
    this._shiryuColereDragonFadeTimer = null;
    this._shiryuColereDragonSuppressHitUntil = 0;
    this._docratesMeteoresHerculeAudio = null;
    this._docratesMeteoresHerculeUrl = null;
    this._docratesMeteoresHerculeUrlPromise = null;
    this._docratesMeteoresHerculeStopTimer = null;
    this._docratesMeteoresHerculeTimeHandler = null;
    this._docratesMeteoresHerculeFadeTimer = null;
    this._docratesMeteoresHerculeSuppressHitUntil = 0;
    this._miloScarletNeedleAudio = null;
    this._miloScarletNeedleUrl = null;
    this._miloScarletNeedleUrlPromise = null;
    this._miloScarletNeedleStopTimer = null;
    this._miloScarletNeedleTimeHandler = null;
    this._miloScarletNeedleFadeTimer = null;
    this._miloScarletNeedleSuppressHitUntil = 0;
    this._miloAntaresUrl = null;
    this._miloAntaresUrlPromise = null;
    this._miloAntaresSuppressHitUntil = 0;
    this._htmlAudioRetryQueue = [];
    this._htmlAudioRetryArmed = false;
    this._punchDriveCurve = null;
    this._loadPreference();
  }

  _audioDebug(event, payload = {}) {
    console.info(`[audio-debug] ${event}`, payload);
  }

  _armHtmlAudioRetryDrain() {
    if (this._htmlAudioRetryArmed) return;
    this._htmlAudioRetryArmed = true;
    const drain = () => {
      const queue = [...this._htmlAudioRetryQueue];
      this._htmlAudioRetryQueue = [];
      this._htmlAudioRetryArmed = false;
      this.unlock();
      for (const retry of queue) {
        try {
          retry();
        } catch (error) {
          this._audioDebug('retry-failed', { message: error?.message ?? String(error) });
        }
      }
    };
    const onInteract = () => {
      window.removeEventListener('pointerdown', onInteract, true);
      window.removeEventListener('keydown', onInteract, true);
      drain();
    };
    window.addEventListener('pointerdown', onInteract, { capture: true, once: true });
    window.addEventListener('keydown', onInteract, { capture: true, once: true });
  }

  _queueHtmlAudioRetry(label, retry) {
    this._audioDebug('queued-retry-after-user-gesture', { label });
    this._htmlAudioRetryQueue.push(retry);
    this._armHtmlAudioRetryDrain();
  }

  _loadPreference() {
    try {
      if (localStorage.getItem(STORAGE_KEY) === '1') this.enabled = false;
    } catch {
      /* ignore */
    }
  }

  _savePreference() {
    try {
      localStorage.setItem(STORAGE_KEY, this.enabled ? '0' : '1');
    } catch {
      /* ignore */
    }
  }

  unlock() {
    if (this.unlocked) {
      if (this.ctx?.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this._syncMasterGain();
    this.master.connect(this.ctx.destination);
    this.unlocked = true;
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  _syncMasterGain() {
    if (!this.master) return;
    const t = this.ctx.currentTime;
    const target = this.enabled ? this.volume : 0;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(target, t);
  }

  setMuted(muted) {
    this.enabled = !muted;
    this._savePreference();
    this._syncMasterGain();
    if (muted) {
      this._stopMeteorPegasePlayback();
      this.stopAiorPlasmaFile();
      this.stopHyogaDiamondDustFile();
      this.stopHyogaDawnThunderFile();
      this.stopDocratesMeteoresHerculeFile();
      this.stopMiloScarletNeedleFile();
      this.stopMiloAntaresFile();
    } else {
      if (this._meteorPegaseAudio) this._meteorPegaseAudio.volume = this.volume;
      if (this._aiorPlasmaAudio) this._aiorPlasmaAudio.volume = this.volume;
      if (this._hyogaDiamondDustAudio) this._hyogaDiamondDustAudio.volume = this.volume;
      if (this._hyogaDawnThunderAudio) this._hyogaDawnThunderAudio.volume = this.volume;
      if (this._docratesMeteoresHerculeAudio) this._docratesMeteoresHerculeAudio.volume = this.volume;
      if (this._miloScarletNeedleAudio) this._miloScarletNeedleAudio.volume = this.volume;
    }
    return muted;
  }

  toggleMute() {
    return this.setMuted(this.enabled);
  }

  isMuted() {
    return !this.enabled;
  }

  /** @param {number} freq @param {number} dur @param {'sine'|'square'|'triangle'|'sawtooth'} type */
  _beep(freq, dur, type = 'sine', opts = {}) {
    if (!this.unlocked || !this.enabled || !this.ctx || !this.master) return;
    const {
      gain = 0.35,
      freqEnd = freq,
      attack = 0.008,
      decay = 0.06,
      detune = 0,
    } = opts;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd !== freq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), t0 + dur);
    }
    if (detune) osc.detune.setValueAtTime(detune, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain * this.volume, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + decay);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + decay + 0.02);
  }

  _noiseBurst(dur, opts = {}) {
    if (!this.unlocked || !this.enabled || !this.ctx || !this.master) return;
    const { gain = 0.2, filterFreq = 800 } = opts;
    const bufferSize = Math.floor(this.ctx.sampleRate * dur);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    const t0 = this.ctx.currentTime;
    g.gain.setValueAtTime(gain * this.volume, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  _getPunchDriveCurve() {
    if (this._punchDriveCurve) return this._punchDriveCurve;
    const samples = 256;
    const curve = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
      const x = (i / (samples - 1)) * 2 - 1;
      curve[i] = Math.tanh(3.2 * x);
    }
    this._punchDriveCurve = curve;
    return curve;
  }

  playDraw() {
    this._beep(520, 0.07, 'sine', { gain: 0.28, freqEnd: 780 });
    setTimeout(() => this._beep(680, 0.05, 'sine', { gain: 0.22 }), 55);
  }

  /** @param {{ variant?: 'melee'|'ranged'|'punch'|'beam' }} [opts] */
  playAttack(opts = {}) {
    const v = typeof opts === 'string' ? opts : opts.variant;
    if (v === 'ranged' || v === 'beam') this.playBeamRay();
    else this.playPunch();
  }

  /** Corp à corps — layered thump + snap + short drive (~0.12-0.18s). */
  playPunch() {
    if (!this.unlocked || !this.enabled || !this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime;
    const pitchJitter = 1 + (Math.random() - 0.5) * 0.12;
    const loudness = 0.9 + Math.random() * 0.2;
    const bodyDur = 0.115 + Math.random() * 0.03;

    // Snap/click at contact.
    this._noiseBurst(0.022, { gain: 0.15 * loudness, filterFreq: 1900 * pitchJitter });
    this._beep(980 * pitchJitter, 0.022, 'square', {
      gain: 0.08 * loudness,
      freqEnd: 320 * pitchJitter,
      attack: 0.001,
      decay: 0.01,
    });

    // Main body thump.
    this._beep(140 * pitchJitter, bodyDur, 'triangle', {
      gain: 0.32 * loudness,
      freqEnd: 52 * pitchJitter,
      attack: 0.001,
      decay: 0.04,
    });

    // Short gritty layer via waveshaper (kept lightweight, no external assets).
    const osc = this.ctx.createOscillator();
    const drive = this.ctx.createWaveShaper();
    const lowpass = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(205 * pitchJitter, t0);
    osc.frequency.exponentialRampToValueAtTime(85 * pitchJitter, t0 + 0.12);
    drive.curve = this._getPunchDriveCurve();
    drive.oversample = '2x';
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(760, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.1 * this.volume * loudness, t0 + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.13);
    osc.connect(drive);
    drive.connect(lowpass);
    lowpass.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + 0.14);

    // Tiny tail to avoid dry cutoff.
    setTimeout(
      () =>
        this._beep(78 * pitchJitter, 0.034, 'sine', {
          gain: 0.1 * loudness,
          freqEnd: 55 * pitchJitter,
          attack: 0.001,
          decay: 0.02,
        }),
      24,
    );
  }

  /** Ranged / special — sweeping energy blast (~0.4s). */
  playBeamRay() {
    this._noiseBurst(0.035, { gain: 0.1, filterFreq: 2200 });
    this._beep(240, 0.24, 'sawtooth', { gain: 0.24, freqEnd: 1280, attack: 0.004, decay: 0.07 });
    setTimeout(
      () => this._beep(520, 0.16, 'triangle', { gain: 0.16, freqEnd: 920, attack: 0.008, decay: 0.05 }),
      35,
    );
  }

  /** Single blue meteor impact (~0.12s). */
  playMeteorImpact() {
    this._noiseBurst(0.04, { gain: 0.14, filterFreq: 1400 });
    this._beep(680, 0.04, 'sine', { gain: 0.18, freqEnd: 220, attack: 0.002, decay: 0.03 });
    setTimeout(() => this._beep(180, 0.03, 'triangle', { gain: 0.1, freqEnd: 90, attack: 0.001 }), 18);
  }

  /** Aior fireball burst impact (~0.28s). */
  playFireballExplosion() {
    this._noiseBurst(0.18, { gain: 0.2, filterFreq: 980 });
    this._beep(320, 0.09, 'sawtooth', { gain: 0.18, freqEnd: 72, attack: 0.002, decay: 0.05 });
    setTimeout(
      () => this._beep(860, 0.07, 'triangle', { gain: 0.13, freqEnd: 260, attack: 0.002, decay: 0.045 }),
      22,
    );
    setTimeout(
      () => this._beep(120, 0.11, 'square', { gain: 0.12, freqEnd: 54, attack: 0.001, decay: 0.06 }),
      64,
    );
  }

  _meteorPegaseCandidateUrls() {
    const urls = [];
    for (const dir of METEOR_PEGASE_DIRS) {
      for (const base of METEOR_PEGASE_BASES) {
        for (const ext of METEOR_PEGASE_EXTS) {
          urls.push(`/${dir}/${base}${ext}`);
        }
      }
    }
    return urls;
  }

  async _probeMeteorPegaseUrl(url) {
    try {
      const head = await fetch(url, { method: 'HEAD', cache: 'no-store' });
      if (head.ok) return true;
    } catch {
      /* HEAD may fail on file:// or strict hosts */
    }
    try {
      const get = await fetch(url, {
        method: 'GET',
        headers: { Range: 'bytes=0-0' },
        cache: 'no-store',
      });
      if (get.ok || get.status === 206) return true;
    } catch {
      /* ignore */
    }
    return new Promise((resolve) => {
      const el = new Audio();
      const done = (ok) => {
        el.removeEventListener('canplaythrough', onOk);
        el.removeEventListener('loadeddata', onOk);
        el.removeEventListener('error', onErr);
        resolve(ok);
      };
      const onOk = () => done(true);
      const onErr = () => done(false);
      el.addEventListener('canplaythrough', onOk, { once: true });
      el.addEventListener('loadeddata', onOk, { once: true });
      el.addEventListener('error', onErr, { once: true });
      el.preload = 'auto';
      el.src = url;
      setTimeout(() => done(false), 1200);
    });
  }

  /** Resolves first existing meteor_pegase.* (.mp4, .mp3, .wav, …) under sons/, assets/sons/, sounds/. */
  async resolveMeteorPegaseUrl() {
    if (this._meteorPegaseUrl) return this._meteorPegaseUrl;
    if (this._meteorPegaseUrlPromise) return this._meteorPegaseUrlPromise;
    this._meteorPegaseUrlPromise = (async () => {
      for (const url of this._meteorPegaseCandidateUrls()) {
        if (await this._probeMeteorPegaseUrl(url)) {
          this._meteorPegaseUrl = url;
          console.info('[audio] meteor_pegase resolved:', url);
          return url;
        }
      }
      console.warn('[audio] meteor_pegase: no file found (expected sons/meteor_pegase.mp4)');
      return null;
    })();
    const resolved = await this._meteorPegaseUrlPromise;
    this._meteorPegaseUrlPromise = null;
    return resolved;
  }

  _stopMeteorPegasePlayback() {
    if (this._meteorPegaseStopTimer) {
      clearTimeout(this._meteorPegaseStopTimer);
      this._meteorPegaseStopTimer = null;
    }
    const el = this._meteorPegaseAudio;
    if (!el) return;
    if (this._meteorPegaseTimeHandler) {
      el.removeEventListener('timeupdate', this._meteorPegaseTimeHandler);
      this._meteorPegaseTimeHandler = null;
    }
    el.pause();
    el.currentTime = 0;
  }

  /** Plays sons/meteor_pegase.* from t=0; stops at playSec (default 5s). */
  playMeteorPegaseFile(playSec = METEOR_PEGASE_PLAY_SEC) {
    if (!this.enabled) return;
    void this._playMeteorPegaseFileAsync(playSec);
  }

  async _playMeteorPegaseFileAsync(playSec = METEOR_PEGASE_PLAY_SEC) {
    const url = await this.resolveMeteorPegaseUrl();
    if (!url || !this.enabled) return false;

    this._stopMeteorPegasePlayback();

    let el = this._meteorPegaseAudio;
    const abs = new URL(url, window.location.href).href;
    if (!el || el.src !== abs) {
      el = new Audio(url);
      el.preload = 'auto';
      this._meteorPegaseAudio = el;
    }

    el.volume = this.volume;
    el.currentTime = 0;

    const playForSec = Math.min(METEOR_PEGASE_PLAY_SEC, Math.max(0.1, playSec));

    const stopClip = () => {
      if (this._meteorPegaseAudio !== el) return;
      el.pause();
      el.currentTime = 0;
      if (this._meteorPegaseTimeHandler) {
        el.removeEventListener('timeupdate', this._meteorPegaseTimeHandler);
        this._meteorPegaseTimeHandler = null;
      }
      if (this._meteorPegaseStopTimer) {
        clearTimeout(this._meteorPegaseStopTimer);
        this._meteorPegaseStopTimer = null;
      }
      el.removeEventListener('ended', stopClip);
    };

    this._meteorPegaseTimeHandler = () => {
      if (el.currentTime >= playForSec) stopClip();
    };
    el.addEventListener('timeupdate', this._meteorPegaseTimeHandler);
    el.addEventListener('ended', stopClip, { once: true });

    try {
      await el.play();
    } catch {
      stopClip();
      return false;
    }

    this._meteorPegaseStopTimer = setTimeout(stopClip, playForSec * 1000);
    return true;
  }

  _schedulePegasusMeteorImpacts(count, opts = {}) {
    if (!this.enabled) return;
    const meteorStartSec = opts.meteorStartSec ?? 3;
    const staggerSec = opts.staggerSec ?? 0.0603;
    const fallSec = opts.fallSec ?? 0.14;
    const baseMs = meteorStartSec * 1000;
    const landFrac = 0.88;
    for (let i = 0; i < count; i++) {
      const landMs = baseMs + i * staggerSec * 1000 + fallSec * 1000 * landFrac;
      setTimeout(() => this.playMeteorImpact(), landMs + Math.random() * 22);
    }
  }

  /**
   * Météores de Pégase — meteor_pegase file from t=0; impact SFX aligned with ball landings.
   * Pass audioPlaySec: 0 (or skipMainAudio: true) for variants without a signature clip.
   * @param {number} count
   * @param {{ meteorStartSec?: number, staggerSec?: number, fallSec?: number, audioPlaySec?: number, skipMainAudio?: boolean, fxDurationSec?: number }} [opts]
   */
  playPegasusMeteors(count = 30, opts = {}) {
    const skipMain = opts.skipMainAudio === true || opts.audioPlaySec === 0;
    if (!skipMain) {
      void this._playMeteorPegaseFileAsync(opts.audioPlaySec ?? METEOR_PEGASE_PLAY_SEC);
    }
    if (this.enabled) this._schedulePegasusMeteorImpacts(count, opts);
  }

  _stopAiorPlasmaPlayback({ hard = true } = {}) {
    if (this._aiorPlasmaStopTimer) {
      clearTimeout(this._aiorPlasmaStopTimer);
      this._aiorPlasmaStopTimer = null;
    }
    if (this._aiorPlasmaFadeTimer) {
      clearTimeout(this._aiorPlasmaFadeTimer);
      this._aiorPlasmaFadeTimer = null;
    }
    const el = this._aiorPlasmaAudio;
    if (!el) return;
    if (this._aiorPlasmaTimeHandler) {
      el.removeEventListener('timeupdate', this._aiorPlasmaTimeHandler);
      this._aiorPlasmaTimeHandler = null;
    }
    if (hard) {
      el.pause();
      el.currentTime = 0;
      el.volume = this.volume;
      this._aiorPlasmaSuppressHitUntil = 0;
    }
  }

  /** Plasma foudroyant clip, retrigger-safe, with hard cap and fade-out. */
  playAiorPlasmaFile(playSec = AIOR_PLASMA_PLAY_SEC) {
    if (!this.enabled) return;
    void this._playAiorPlasmaFileAsync(playSec);
  }

  stopAiorPlasmaFile() {
    this._stopAiorPlasmaPlayback({ hard: true });
  }

  isAiorPlasmaHitSfxSuppressed() {
    const el = this._aiorPlasmaAudio;
    const playingNow = !!el && !el.paused && el.currentTime > 0;
    return playingNow || Date.now() < this._aiorPlasmaSuppressHitUntil;
  }

  async _playAiorPlasmaFileAsync(playSec = AIOR_PLASMA_PLAY_SEC) {
    if (!this.enabled) return false;
    this._stopAiorPlasmaPlayback({ hard: true });

    let el = this._aiorPlasmaAudio;
    const abs = new URL(AIOR_PLASMA_URL, window.location.href).href;
    if (!el || el.src !== abs) {
      el = new Audio(AIOR_PLASMA_URL);
      el.preload = 'auto';
      this._aiorPlasmaAudio = el;
    }

    const playForSec = Math.min(AIOR_PLASMA_PLAY_SEC, Math.max(0.2, playSec));
    const fadeSec = Math.min(0.55, Math.max(0.2, playForSec * 0.25));
    const fadeStartSec = Math.max(0.01, playForSec - fadeSec);
    const baseVol = this.volume;
    this._aiorPlasmaSuppressHitUntil = Date.now() + playForSec * 1000;

    const stopClip = () => {
      if (this._aiorPlasmaAudio !== el) return;
      this._stopAiorPlasmaPlayback({ hard: true });
      this._aiorPlasmaSuppressHitUntil = 0;
      el.removeEventListener('ended', stopClip);
    };

    this._aiorPlasmaTimeHandler = () => {
      if (el.currentTime >= playForSec) stopClip();
    };
    el.addEventListener('timeupdate', this._aiorPlasmaTimeHandler);
    el.addEventListener('ended', stopClip, { once: true });
    el.currentTime = 0;
    el.volume = baseVol;

    try {
      await el.play();
    } catch {
      stopClip();
      return false;
    }

    this._aiorPlasmaFadeTimer = setTimeout(() => {
      if (this._aiorPlasmaAudio !== el || !this.enabled) return;
      const steps = 8;
      const stepMs = Math.max(25, Math.floor((fadeSec * 1000) / steps));
      for (let i = 1; i <= steps; i++) {
        setTimeout(() => {
          if (this._aiorPlasmaAudio !== el) return;
          const next = baseVol * (1 - i / steps);
          el.volume = Math.max(0, next);
          if (i === steps) stopClip();
        }, i * stepMs);
      }
    }, fadeStartSec * 1000);

    this._aiorPlasmaStopTimer = setTimeout(stopClip, playForSec * 1000 + 120);
    return true;
  }

  _stopHyogaDiamondDustPlayback({ hard = true } = {}) {
    if (this._hyogaDiamondDustStopTimer) {
      clearTimeout(this._hyogaDiamondDustStopTimer);
      this._hyogaDiamondDustStopTimer = null;
    }
    if (this._hyogaDiamondDustFadeTimer) {
      clearTimeout(this._hyogaDiamondDustFadeTimer);
      this._hyogaDiamondDustFadeTimer = null;
    }
    const el = this._hyogaDiamondDustAudio;
    if (!el) return;
    if (this._hyogaDiamondDustTimeHandler) {
      el.removeEventListener('timeupdate', this._hyogaDiamondDustTimeHandler);
      this._hyogaDiamondDustTimeHandler = null;
    }
    if (hard) {
      el.pause();
      el.currentTime = 0;
      el.volume = this.volume;
      this._hyogaDiamondDustSuppressHitUntil = 0;
    }
  }

  /** Poussière de Diamant clip, retrigger-safe, with hard cap and fade-out. */
  playHyogaDiamondDust(playSec = HYOGA_DIAMOND_DUST_PLAY_SEC) {
    if (!this.enabled) return;
    void this._playHyogaDiamondDustFileAsync(playSec);
  }

  stopHyogaDiamondDustFile() {
    this._stopHyogaDiamondDustPlayback({ hard: true });
  }

  isHyogaDiamondDustHitSfxSuppressed() {
    const el = this._hyogaDiamondDustAudio;
    const playingNow = !!el && !el.paused && el.currentTime > 0;
    return playingNow || Date.now() < this._hyogaDiamondDustSuppressHitUntil;
  }

  async _playHyogaDiamondDustFileAsync(playSec = HYOGA_DIAMOND_DUST_PLAY_SEC) {
    if (!this.enabled) return false;
    this._stopHyogaDiamondDustPlayback({ hard: true });

    let el = this._hyogaDiamondDustAudio;
    const abs = new URL(HYOGA_DIAMOND_DUST_URL, window.location.href).href;
    if (!el || el.src !== abs) {
      el = new Audio(HYOGA_DIAMOND_DUST_URL);
      el.preload = 'auto';
      this._hyogaDiamondDustAudio = el;
    }

    const playForSec = Math.min(HYOGA_DIAMOND_DUST_PLAY_SEC, Math.max(0.2, playSec));
    const fadeSec = Math.min(0.55, Math.max(0.2, playForSec * 0.25));
    const fadeStartSec = Math.max(0.01, playForSec - fadeSec);
    const baseVol = this.volume;
    this._hyogaDiamondDustSuppressHitUntil = Date.now() + playForSec * 1000;

    const stopClip = () => {
      if (this._hyogaDiamondDustAudio !== el) return;
      this._stopHyogaDiamondDustPlayback({ hard: true });
      this._hyogaDiamondDustSuppressHitUntil = 0;
      el.removeEventListener('ended', stopClip);
    };

    this._hyogaDiamondDustTimeHandler = () => {
      if (el.currentTime >= playForSec) stopClip();
    };
    el.addEventListener('timeupdate', this._hyogaDiamondDustTimeHandler);
    el.addEventListener('ended', stopClip, { once: true });
    el.currentTime = 0;
    el.volume = baseVol;

    try {
      await el.play();
    } catch {
      stopClip();
      return false;
    }

    this._hyogaDiamondDustFadeTimer = setTimeout(() => {
      if (this._hyogaDiamondDustAudio !== el || !this.enabled) return;
      const steps = 8;
      const stepMs = Math.max(25, Math.floor((fadeSec * 1000) / steps));
      for (let i = 1; i <= steps; i++) {
        setTimeout(() => {
          if (this._hyogaDiamondDustAudio !== el) return;
          const next = baseVol * (1 - i / steps);
          el.volume = Math.max(0, next);
          if (i === steps) stopClip();
        }, i * stepMs);
      }
    }, fadeStartSec * 1000);

    this._hyogaDiamondDustStopTimer = setTimeout(stopClip, playForSec * 1000 + 120);
    return true;
  }

  /** Tonnerre de l'aube (Hyoga) — Antares.mp3 clip; audioStartSec from attack-fx.json (default 0). */
  playHyogaDawnThunder(playSec = HYOGA_DAWN_THUNDER_PLAY_SEC, opts = {}) {
    if (!this.enabled) return;
    void this._playHyogaDawnThunderFileAsync(playSec, opts);
  }

  stopHyogaDawnThunderFile() {
    this._stopHyogaDawnThunderPlayback({ hard: true });
    this._hyogaDawnThunderSuppressHitUntil = 0;
  }

  isHyogaDawnThunderHitSfxSuppressed() {
    const el = this._hyogaDawnThunderAudio;
    const playingNow = !!el && !el.paused && el.currentTime > 0;
    return playingNow || Date.now() < this._hyogaDawnThunderSuppressHitUntil;
  }

  async resolveHyogaDawnThunderUrl() {
    if (this._hyogaDawnThunderUrl) return this._hyogaDawnThunderUrl;
    if (this._hyogaDawnThunderUrlPromise) return this._hyogaDawnThunderUrlPromise;
    this._hyogaDawnThunderUrlPromise = (async () => {
      for (const url of HYOGA_DAWN_THUNDER_URLS) {
        if (await this._probeMeteorPegaseUrl(url)) {
          this._hyogaDawnThunderUrl = url;
          console.info('[audio] hyoga dawn thunder resolved:', url);
          return url;
        }
      }
      console.warn(
        '[audio] Tonnerre de l\'aube: no file found (expected assets/audio/attacks/Saint Seiya - Scorpio Milo -Antares.mp3)',
      );
      return null;
    })();
    const resolved = await this._hyogaDawnThunderUrlPromise;
    this._hyogaDawnThunderUrlPromise = null;
    return resolved;
  }

  _stopHyogaDawnThunderPlayback({ hard = true } = {}) {
    if (this._hyogaDawnThunderStopTimer) {
      clearTimeout(this._hyogaDawnThunderStopTimer);
      this._hyogaDawnThunderStopTimer = null;
    }
    if (this._hyogaDawnThunderFadeTimer) {
      clearTimeout(this._hyogaDawnThunderFadeTimer);
      this._hyogaDawnThunderFadeTimer = null;
    }
    const el = this._hyogaDawnThunderAudio;
    if (!el) return;
    if (this._hyogaDawnThunderTimeHandler) {
      el.removeEventListener('timeupdate', this._hyogaDawnThunderTimeHandler);
      this._hyogaDawnThunderTimeHandler = null;
    }
    if (hard) {
      el.pause();
      el.currentTime = 0;
      el.volume = this.volume;
      this._hyogaDawnThunderSuppressHitUntil = 0;
    }
  }

  async _playHyogaDawnThunderFileAsync(playSec = HYOGA_DAWN_THUNDER_PLAY_SEC, opts = {}) {
    if (!this.enabled) return false;
    this._stopHyogaDawnThunderPlayback({ hard: true });

    const url = await this.resolveHyogaDawnThunderUrl();
    if (!url) {
      this._audioDebug('hyoga-dawn-thunder-fallback-no-url', { playSec });
      this.unlock();
      this._noiseBurst(0.12, { gain: 0.14, filterFreq: 2000 });
      this._beep(420, 0.2, 'sawtooth', { gain: 0.2, freqEnd: 1200, attack: 0.003, decay: 0.06 });
      return true;
    }

    let el = this._hyogaDawnThunderAudio;
    const abs = new URL(url, window.location.href).href;
    if (!el || el.src !== abs) {
      el = new Audio(url);
      el.preload = 'auto';
      this._hyogaDawnThunderAudio = el;
    }

    const requestedStartSec = Math.max(0, opts.startSec ?? HYOGA_DAWN_THUNDER_START_SEC);
    const startSec = await this._seekAudioToStart(el, requestedStartSec);
    const playForSec = Math.min(HYOGA_DAWN_THUNDER_PLAY_SEC, Math.max(0.2, playSec));
    const endSec = startSec + playForSec;
    const fadeSec = Math.min(0.55, Math.max(0.2, playForSec * 0.25));
    const fadeStartSec = Math.max(0.01, playForSec - fadeSec);
    const baseVol = this.volume;
    this._hyogaDawnThunderSuppressHitUntil = Date.now() + playForSec * 1000;
    this._audioDebug('hyoga-dawn-thunder-play-request', {
      url,
      requestedStartSec,
      startSec,
      playForSec,
      endSec,
    });

    const stopClip = () => {
      if (this._hyogaDawnThunderAudio !== el) return;
      this._stopHyogaDawnThunderPlayback({ hard: true });
      el.removeEventListener('ended', stopClip);
    };

    this._hyogaDawnThunderTimeHandler = () => {
      if (el.currentTime >= endSec) stopClip();
    };
    el.addEventListener('timeupdate', this._hyogaDawnThunderTimeHandler);
    el.addEventListener('ended', stopClip, { once: true });
    el.volume = baseVol;

    try {
      await el.play();
      this._audioDebug('hyoga-dawn-thunder-play-success', {
        url,
        startSec: el.currentTime,
        paused: el.paused,
      });
    } catch (error) {
      const errName = error?.name ?? 'UnknownError';
      this._audioDebug('hyoga-dawn-thunder-play-failed', {
        url,
        errName,
        message: error?.message ?? String(error),
      });
      if (errName === 'NotAllowedError') {
        this._queueHtmlAudioRetry('hyoga-dawn-thunder', () => {
          void this._playHyogaDawnThunderFileAsync(playSec, opts);
        });
      }
      stopClip();
      return false;
    }

    this._hyogaDawnThunderFadeTimer = setTimeout(() => {
      if (this._hyogaDawnThunderAudio !== el || !this.enabled) return;
      const steps = 8;
      const stepMs = Math.max(25, Math.floor((fadeSec * 1000) / steps));
      for (let i = 1; i <= steps; i++) {
        setTimeout(() => {
          if (this._hyogaDawnThunderAudio !== el) return;
          const next = baseVol * (1 - i / steps);
          el.volume = Math.max(0, next);
          if (i === steps) stopClip();
        }, i * stepMs);
      }
    }, fadeStartSec * 1000);

    this._hyogaDawnThunderStopTimer = setTimeout(stopClip, playForSec * 1000 + 120);
    return true;
  }

  _stopShiryuColereDragonPlayback({ hard = true } = {}) {
    if (this._shiryuColereDragonStopTimer) {
      clearTimeout(this._shiryuColereDragonStopTimer);
      this._shiryuColereDragonStopTimer = null;
    }
    if (this._shiryuColereDragonFadeTimer) {
      clearTimeout(this._shiryuColereDragonFadeTimer);
      this._shiryuColereDragonFadeTimer = null;
    }
    const el = this._shiryuColereDragonAudio;
    if (!el) return;
    if (this._shiryuColereDragonTimeHandler) {
      el.removeEventListener('timeupdate', this._shiryuColereDragonTimeHandler);
      this._shiryuColereDragonTimeHandler = null;
    }
    if (hard) {
      el.pause();
      el.currentTime = 0;
      el.volume = this.volume;
      this._shiryuColereDragonSuppressHitUntil = 0;
    }
  }

  /** Colère / Fureur du Dragon (Shiryu) clip, retrigger-safe, with hard cap and fade-out. */
  playShiryuColereDragon(playSec = SHIRYU_COLERE_DRAGON_PLAY_SEC) {
    if (!this.enabled) return;
    void this._playShiryuColereDragonFileAsync(playSec);
  }

  stopShiryuColereDragonFile() {
    this._stopShiryuColereDragonPlayback({ hard: true });
  }

  isShiryuColereDragonHitSfxSuppressed() {
    const el = this._shiryuColereDragonAudio;
    const playingNow = !!el && !el.paused && el.currentTime > 0;
    return playingNow || Date.now() < this._shiryuColereDragonSuppressHitUntil;
  }

  async _playShiryuColereDragonFileAsync(playSec = SHIRYU_COLERE_DRAGON_PLAY_SEC) {
    if (!this.enabled) return false;
    this._stopShiryuColereDragonPlayback({ hard: true });

    let el = this._shiryuColereDragonAudio;
    const abs = new URL(SHIRYU_COLERE_DRAGON_URL, window.location.href).href;
    if (!el || el.src !== abs) {
      el = new Audio(SHIRYU_COLERE_DRAGON_URL);
      el.preload = 'auto';
      this._shiryuColereDragonAudio = el;
    }

    const playForSec = Math.min(SHIRYU_COLERE_DRAGON_PLAY_SEC, Math.max(0.2, playSec));
    const fadeSec = Math.min(0.55, Math.max(0.2, playForSec * 0.25));
    const fadeStartSec = Math.max(0.01, playForSec - fadeSec);
    const baseVol = this.volume;
    this._shiryuColereDragonSuppressHitUntil = Date.now() + playForSec * 1000;

    const stopClip = () => {
      if (this._shiryuColereDragonAudio !== el) return;
      this._stopShiryuColereDragonPlayback({ hard: true });
      this._shiryuColereDragonSuppressHitUntil = 0;
      el.removeEventListener('ended', stopClip);
    };

    this._shiryuColereDragonTimeHandler = () => {
      if (el.currentTime >= playForSec) stopClip();
    };
    el.addEventListener('timeupdate', this._shiryuColereDragonTimeHandler);
    el.addEventListener('ended', stopClip, { once: true });
    el.currentTime = 0;
    el.volume = baseVol;

    try {
      await el.play();
    } catch {
      stopClip();
      return false;
    }

    this._shiryuColereDragonFadeTimer = setTimeout(() => {
      if (this._shiryuColereDragonAudio !== el || !this.enabled) return;
      const steps = 8;
      const stepMs = Math.max(25, Math.floor((fadeSec * 1000) / steps));
      for (let i = 1; i <= steps; i++) {
        setTimeout(() => {
          if (this._shiryuColereDragonAudio !== el) return;
          const next = baseVol * (1 - i / steps);
          el.volume = Math.max(0, next);
          if (i === steps) stopClip();
        }, i * stepMs);
      }
    }, fadeStartSec * 1000);

    this._shiryuColereDragonStopTimer = setTimeout(stopClip, playForSec * 1000 + 120);
    return true;
  }

  _stopDocratesMeteoresHerculePlayback({ hard = true } = {}) {
    if (this._docratesMeteoresHerculeStopTimer) {
      clearTimeout(this._docratesMeteoresHerculeStopTimer);
      this._docratesMeteoresHerculeStopTimer = null;
    }
    if (this._docratesMeteoresHerculeFadeTimer) {
      clearTimeout(this._docratesMeteoresHerculeFadeTimer);
      this._docratesMeteoresHerculeFadeTimer = null;
    }
    const el = this._docratesMeteoresHerculeAudio;
    if (!el) return;
    if (this._docratesMeteoresHerculeTimeHandler) {
      el.removeEventListener('timeupdate', this._docratesMeteoresHerculeTimeHandler);
      this._docratesMeteoresHerculeTimeHandler = null;
    }
    if (hard) {
      el.pause();
      el.currentTime = 0;
      el.volume = this.volume;
      this._docratesMeteoresHerculeSuppressHitUntil = 0;
    }
  }

  /** Resolves first existing Météores d'Hercule clip under assets/audio/attacks or sons/. */
  async resolveDocratesMeteoresHerculeUrl() {
    if (this._docratesMeteoresHerculeUrl) return this._docratesMeteoresHerculeUrl;
    if (this._docratesMeteoresHerculeUrlPromise) return this._docratesMeteoresHerculeUrlPromise;
    this._docratesMeteoresHerculeUrlPromise = (async () => {
      for (const url of DOCRATES_METEORES_HERCULE_URLS) {
        if (await this._probeMeteorPegaseUrl(url)) {
          this._docratesMeteoresHerculeUrl = url;
          console.info('[audio] docrates meteores hercule resolved:', url);
          return url;
        }
      }
      console.warn('[audio] Météores d\'Hercule: no file found (expected assets/audio/attacks/Météore dHercule.mp3)');
      return null;
    })();
    const resolved = await this._docratesMeteoresHerculeUrlPromise;
    this._docratesMeteoresHerculeUrlPromise = null;
    return resolved;
  }

  /** Météores d'Hercule (Docrates) clip, retrigger-safe, with hard cap and fade-out. */
  playDocratesMeteoresHercule(playSec = DOCRATES_METEORES_HERCULE_PLAY_SEC) {
    if (!this.enabled) return;
    void this._playDocratesMeteoresHerculeFileAsync(playSec);
  }

  stopDocratesMeteoresHerculeFile() {
    this._stopDocratesMeteoresHerculePlayback({ hard: true });
  }

  isDocratesMeteoresHerculeHitSfxSuppressed() {
    const el = this._docratesMeteoresHerculeAudio;
    const playingNow = !!el && !el.paused && el.currentTime > 0;
    return playingNow || Date.now() < this._docratesMeteoresHerculeSuppressHitUntil;
  }

  async _playDocratesMeteoresHerculeFileAsync(playSec = DOCRATES_METEORES_HERCULE_PLAY_SEC) {
    if (!this.enabled) return false;
    this._stopDocratesMeteoresHerculePlayback({ hard: true });

    const url = await this.resolveDocratesMeteoresHerculeUrl();
    if (!url) return false;

    let el = this._docratesMeteoresHerculeAudio;
    const abs = new URL(url, window.location.href).href;
    if (!el || el.src !== abs) {
      el = new Audio(url);
      el.preload = 'auto';
      this._docratesMeteoresHerculeAudio = el;
    }

    const playForSec = Math.min(DOCRATES_METEORES_HERCULE_PLAY_SEC, Math.max(0.2, playSec));
    const fadeSec = Math.min(0.55, Math.max(0.2, playForSec * 0.25));
    const fadeStartSec = Math.max(0.01, playForSec - fadeSec);
    const baseVol = this.volume;
    this._docratesMeteoresHerculeSuppressHitUntil = Date.now() + playForSec * 1000;

    const stopClip = () => {
      if (this._docratesMeteoresHerculeAudio !== el) return;
      this._stopDocratesMeteoresHerculePlayback({ hard: true });
      this._docratesMeteoresHerculeSuppressHitUntil = 0;
      el.removeEventListener('ended', stopClip);
    };

    this._docratesMeteoresHerculeTimeHandler = () => {
      if (el.currentTime >= playForSec) stopClip();
    };
    el.addEventListener('timeupdate', this._docratesMeteoresHerculeTimeHandler);
    el.addEventListener('ended', stopClip, { once: true });
    el.currentTime = 0;
    el.volume = baseVol;

    try {
      await el.play();
    } catch {
      stopClip();
      return false;
    }

    this._docratesMeteoresHerculeFadeTimer = setTimeout(() => {
      if (this._docratesMeteoresHerculeAudio !== el || !this.enabled) return;
      const steps = 8;
      const stepMs = Math.max(25, Math.floor((fadeSec * 1000) / steps));
      for (let i = 1; i <= steps; i++) {
        setTimeout(() => {
          if (this._docratesMeteoresHerculeAudio !== el) return;
          const next = baseVol * (1 - i / steps);
          el.volume = Math.max(0, next);
          if (i === steps) stopClip();
        }, i * stepMs);
      }
    }, fadeStartSec * 1000);

    this._docratesMeteoresHerculeStopTimer = setTimeout(stopClip, playForSec * 1000 + 120);
    return true;
  }

  /** Resolves first existing Aiguille Écarlate clip under assets/audio/attacks or sons/. */
  async resolveMiloScarletNeedleUrl() {
    if (this._miloScarletNeedleUrl) return this._miloScarletNeedleUrl;
    if (this._miloScarletNeedleUrlPromise) return this._miloScarletNeedleUrlPromise;
    this._miloScarletNeedleUrlPromise = (async () => {
      for (const url of MILO_SCARLET_NEEDLE_URLS) {
        if (await this._probeMeteorPegaseUrl(url)) {
          this._miloScarletNeedleUrl = url;
          console.info('[audio] milo scarlet needle resolved:', url);
          return url;
        }
      }
      console.warn(
        '[audio] Aiguille Écarlate: no file found (expected assets/audio/attacks/Milo x Kanon Scarleth Needle.mp3)',
      );
      return null;
    })();
    const resolved = await this._miloScarletNeedleUrlPromise;
    this._miloScarletNeedleUrlPromise = null;
    return resolved;
  }

  /** Antarès (Milo) — Scarlet Needle Combo clip from 14s, retrigger-safe. */
  playMiloAntares(playSec = MILO_ANTARES_PLAY_SEC, opts = {}) {
    if (!this.enabled) return;
    const guardMs =
      Math.max(MILO_ANTARES_PLAY_SEC, Number(playSec) || MILO_ANTARES_PLAY_SEC) * 1000 + 250;
    this._miloAntaresSuppressHitUntil = Date.now() + guardMs;
    void this._playMiloAntaresFileAsync(playSec, opts);
  }

  stopMiloAntaresFile() {
    this._stopMiloScarletNeedlePlayback({ hard: true });
    this._miloAntaresSuppressHitUntil = 0;
  }

  isMiloAntaresHitSfxSuppressed() {
    const el = this._miloScarletNeedleAudio;
    const playingNow = !!el && !el.paused && el.currentTime > 0;
    return playingNow || Date.now() < this._miloAntaresSuppressHitUntil;
  }

  async resolveMiloAntaresUrl() {
    if (this._miloAntaresUrl) return this._miloAntaresUrl;
    if (this._miloAntaresUrlPromise) return this._miloAntaresUrlPromise;
    this._miloAntaresUrlPromise = (async () => {
      for (const url of MILO_ANTARES_URLS) {
        if (await this._probeMeteorPegaseUrl(url)) {
          this._miloAntaresUrl = url;
          console.info('[audio] milo antares resolved:', url);
          return url;
        }
      }
      console.warn(
        '[audio] Antarès: no file found (expected assets/audio/attacks/Milo x Kanon Scarleth Needle.mp3)',
      );
      return null;
    })();
    const resolved = await this._miloAntaresUrlPromise;
    this._miloAntaresUrlPromise = null;
    return resolved;
  }

  async _playMiloAntaresFileAsync(playSec = MILO_ANTARES_PLAY_SEC, opts = {}) {
    if (!this.enabled) return false;
    const url = await this.resolveMiloAntaresUrl();
    if (!url) {
      this._audioDebug('milo-antares-fallback-no-url', { playSec });
      this.unlock();
      this._playMiloSignatureFallback('milo-antares', playSec);
      return true;
    }
    const startSec = Math.max(0, opts.startSec ?? MILO_ANTARES_START_SEC);
    this._audioDebug('milo-antares-play-request', { url, startSec, playSec });
    return this._playMiloScarletNeedleFileAsync(playSec, {
      startSec,
      url,
      maxPlaySec: MILO_ANTARES_PLAY_SEC,
      onSuppress: (until) => {
        this._miloAntaresSuppressHitUntil = until;
      },
    });
  }

  /** Aiguille Écarlate (Milo) — Milo x Kanon Scarleth Needle clip from 9s, retrigger-safe. */
  playMiloScarletNeedle(playSec = MILO_SCARLET_NEEDLE_PLAY_SEC, opts = {}) {
    if (!this.enabled) return;
    void this._playMiloScarletNeedleFileAsync(playSec, opts);
  }

  stopMiloScarletNeedleFile() {
    this._stopMiloScarletNeedlePlayback({ hard: true });
  }

  isMiloScarletNeedleHitSfxSuppressed() {
    const el = this._miloScarletNeedleAudio;
    const playingNow = !!el && !el.paused && el.currentTime > 0;
    return playingNow || Date.now() < this._miloScarletNeedleSuppressHitUntil;
  }

  _stopMiloScarletNeedlePlayback({ hard = true } = {}) {
    if (this._miloScarletNeedleStopTimer) {
      clearTimeout(this._miloScarletNeedleStopTimer);
      this._miloScarletNeedleStopTimer = null;
    }
    if (this._miloScarletNeedleFadeTimer) {
      clearTimeout(this._miloScarletNeedleFadeTimer);
      this._miloScarletNeedleFadeTimer = null;
    }
    const el = this._miloScarletNeedleAudio;
    if (!el) return;
    if (this._miloScarletNeedleTimeHandler) {
      el.removeEventListener('timeupdate', this._miloScarletNeedleTimeHandler);
      this._miloScarletNeedleTimeHandler = null;
    }
    if (hard) {
      el.pause();
      el.currentTime = 0;
      el.volume = this.volume;
      this._miloScarletNeedleSuppressHitUntil = 0;
    }
  }

  _playMiloSignatureFallback(kind, playSec) {
    if (!this.enabled) return false;
    if (!this.unlocked || !this.ctx || !this.master) this.unlock();
    if (!this.unlocked) return false;
    const safeSec = Math.max(0.2, Number(playSec) || 0.2);
    if (kind === 'milo-antares') {
      this._noiseBurst(0.1, { gain: 0.13, filterFreq: 1800 });
      this._beep(360, 0.18, 'sawtooth', { gain: 0.22, freqEnd: 980, attack: 0.003, decay: 0.06 });
      setTimeout(() => this._beep(980, 0.15, 'triangle', { gain: 0.2, freqEnd: 1600, attack: 0.004, decay: 0.05 }), 150);
      setTimeout(() => this._noiseBurst(Math.min(0.16, safeSec * 0.22), { gain: 0.12, filterFreq: 2400 }), 260);
      this._audioDebug('milo-antares-fallback-started', { playSec: safeSec });
      return true;
    }
    this._noiseBurst(0.08, { gain: 0.12, filterFreq: 2200 });
    this._beep(650, 0.09, 'square', { gain: 0.18, freqEnd: 330, attack: 0.002, decay: 0.04 });
    setTimeout(() => this._beep(740, 0.08, 'square', { gain: 0.15, freqEnd: 380, attack: 0.002, decay: 0.035 }), 70);
    setTimeout(() => this._beep(840, 0.075, 'square', { gain: 0.13, freqEnd: 420, attack: 0.001, decay: 0.03 }), 145);
    this._audioDebug('milo-scarlet-needle-fallback-started', { playSec: safeSec });
    return true;
  }

  async _seekAudioToStart(el, requestedStartSec = 0) {
    const startSec = Math.max(0, Number(requestedStartSec) || 0);
    if (startSec <= 0) {
      try {
        el.currentTime = 0;
      } catch {
        /* ignore */
      }
      return 0;
    }

    const applySeek = () => {
      const duration = Number.isFinite(el.duration) ? el.duration : NaN;
      const maxStart = Number.isFinite(duration) && duration > 0 ? Math.max(0, duration - 0.05) : startSec;
      const target = Math.min(startSec, maxStart);
      try {
        el.currentTime = target;
        return target;
      } catch {
        return null;
      }
    };

    let seeked = applySeek();
    if (seeked != null) return seeked;

    await new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        el.removeEventListener('loadedmetadata', onReady);
        el.removeEventListener('canplay', onReady);
        el.removeEventListener('error', onReady);
        resolve();
      };
      const onReady = () => finish();
      el.addEventListener('loadedmetadata', onReady, { once: true });
      el.addEventListener('canplay', onReady, { once: true });
      el.addEventListener('error', onReady, { once: true });
      setTimeout(finish, 1400);
    });

    seeked = applySeek();
    if (seeked != null) return seeked;
    try {
      el.currentTime = 0;
    } catch {
      /* ignore */
    }
    return 0;
  }

  async _playMiloScarletNeedleFileAsync(
    playSec = MILO_SCARLET_NEEDLE_PLAY_SEC,
    opts = {},
  ) {
    if (!this.enabled) return false;
    this._stopMiloScarletNeedlePlayback({ hard: true });

    const url = opts.url ?? (await this.resolveMiloScarletNeedleUrl());
    if (!url) {
      this._audioDebug('milo-scarlet-needle-fallback-no-url', { playSec });
      this.unlock();
      this._playMiloSignatureFallback('milo-scarlet-needle', playSec);
      return true;
    }

    let el = this._miloScarletNeedleAudio;
    const abs = new URL(url, window.location.href).href;
    if (!el || el.src !== abs) {
      el = new Audio(url);
      el.preload = 'auto';
      this._miloScarletNeedleAudio = el;
    }

    const requestedStartSec = Math.max(0, opts.startSec ?? MILO_SCARLET_NEEDLE_START_SEC);
    const startSec = await this._seekAudioToStart(el, requestedStartSec);
    const maxPlay = opts.maxPlaySec ?? MILO_SCARLET_NEEDLE_PLAY_SEC;
    const playForSec = Math.min(maxPlay, Math.max(0.2, playSec));
    const endSec = startSec + playForSec;
    const fadeSec = Math.min(0.55, Math.max(0.2, playForSec * 0.25));
    const fadeStartSec = Math.max(0.01, playForSec - fadeSec);
    const baseVol = this.volume;
    const suppressUntil = Date.now() + playForSec * 1000;
    this._miloScarletNeedleSuppressHitUntil = suppressUntil;
    opts.onSuppress?.(suppressUntil);
    this._audioDebug('milo-signature-resolved', {
      url,
      requestedStartSec,
      startSec,
      playForSec,
      endSec,
    });

    const stopClip = () => {
      if (this._miloScarletNeedleAudio !== el) return;
      this._stopMiloScarletNeedlePlayback({ hard: true });
      this._miloScarletNeedleSuppressHitUntil = 0;
      this._miloAntaresSuppressHitUntil = 0;
      el.removeEventListener('ended', stopClip);
    };

    this._miloScarletNeedleTimeHandler = () => {
      if (el.currentTime >= endSec) stopClip();
    };
    el.addEventListener('timeupdate', this._miloScarletNeedleTimeHandler);
    el.addEventListener('ended', stopClip, { once: true });
    el.volume = baseVol;

    try {
      await el.play();
      this._audioDebug('milo-signature-play-success', {
        url,
        startSec: el.currentTime,
        paused: el.paused,
      });
      setTimeout(() => {
        if (this._miloScarletNeedleAudio !== el) return;
        this._audioDebug('milo-signature-progress-probe', {
          url,
          currentTime: el.currentTime,
          paused: el.paused,
        });
      }, 220);
    } catch (error) {
      const errName = error?.name ?? 'UnknownError';
      this._audioDebug('milo-signature-play-failed', {
        url,
        errName,
        message: error?.message ?? String(error),
      });
      if (errName === 'NotAllowedError') {
        this._queueHtmlAudioRetry('milo-signature', () => {
          void this._playMiloScarletNeedleFileAsync(playSec, opts);
        });
      }
      stopClip();
      return false;
    }

    this._miloScarletNeedleFadeTimer = setTimeout(() => {
      if (this._miloScarletNeedleAudio !== el || !this.enabled) return;
      const steps = 8;
      const stepMs = Math.max(25, Math.floor((fadeSec * 1000) / steps));
      for (let i = 1; i <= steps; i++) {
        setTimeout(() => {
          if (this._miloScarletNeedleAudio !== el) return;
          const next = baseVol * (1 - i / steps);
          el.volume = Math.max(0, next);
          if (i === steps) stopClip();
        }, i * stepMs);
      }
    }, fadeStartSec * 1000);

    this._miloScarletNeedleStopTimer = setTimeout(stopClip, playForSec * 1000 + 120);
    return true;
  }

  /**
   * Bouclier de la Méduse — drone during reveal, eye glint, fullscreen whiteout.
   * @param {{ revealSec?: number, totalSec?: number, eyeFlashStartSec?: number, whiteFlashStartSec?: number, whiteFlashDelaySec?: number, whiteFlashSec?: number }} [opts]
   */
  playMedusaShield(opts = {}) {
    if (!this.unlocked || !this.enabled || !this.ctx || !this.master) return;
    const revealSec = opts.revealSec ?? 2.5;
    const whiteFlash = opts.whiteFlashSec ?? 0.35;
    const eyeStart = opts.eyeFlashStartSec ?? revealSec * 0.74;
    const eyeFlashSec = opts.eyeFlashSec ?? 0.65;
    const whiteStartSec =
      opts.whiteFlashStartSec ??
      (opts.whiteFlashDelaySec != null
        ? revealSec + opts.whiteFlashDelaySec
        : eyeStart + eyeFlashSec * 0.55);
    const totalSec = opts.totalSec ?? Math.max(revealSec, whiteStartSec + whiteFlash);
    const eyeSec = eyeStart;
    const whiteStartMs = whiteStartSec * 1000;

    this._beep(52, totalSec * 0.92, 'sine', { gain: 0.07, freqEnd: 68, attack: 0.6, decay: 0.9 });
    this._beep(98, totalSec * 0.85, 'triangle', {
      gain: 0.05,
      freqEnd: 74,
      attack: 0.8,
      decay: 0.7,
      detune: -8,
    });

    const pulses = Math.max(6, Math.floor(revealSec * 2));
    for (let i = 0; i < pulses; i++) {
      const delayMs = 180 + i * ((revealSec * 1000 - 400) / pulses);
      setTimeout(() => {
        if (!this.enabled) return;
        const f = 160 + (i % 5) * 17 + Math.random() * 22;
        this._beep(f, 0.28, 'sine', {
          gain: 0.045,
          freqEnd: f * 1.08,
          attack: 0.04,
          decay: 0.12,
          detune: (Math.random() - 0.5) * 18,
        });
        this._noiseBurst(0.12, { gain: 0.035, filterFreq: 520 + i * 35 });
      }, delayMs);
    }

    setTimeout(() => {
      if (!this.enabled) return;
      this._noiseBurst(0.22, { gain: 0.12, filterFreq: 1800 });
      this._beep(520, 0.32, 'sine', { gain: 0.14, freqEnd: 1200, attack: 0.01, decay: 0.16 });
    }, eyeSec * 1000);

    setTimeout(() => {
      if (!this.enabled) return;
      this._noiseBurst(0.42, { gain: 0.22, filterFreq: 3200 });
      this._beep(880, 0.55, 'sine', { gain: 0.26, freqEnd: 2400, attack: 0.006, decay: 0.22 });
      this._beep(1400, 0.48, 'triangle', { gain: 0.16, freqEnd: 280, attack: 0.008, decay: 0.2 });
      setTimeout(() => this._beep(180, 0.24, 'square', { gain: 0.12, freqEnd: 70, attack: 0.002 }), 140);
    }, whiteStartMs);
  }

  /** Dragon roar for Colère / Fureur du Dragon (~0.55s). */
  playDragonRoar() {
    this._noiseBurst(0.2, { gain: 0.22, filterFreq: 180 });
    this._beep(95, 0.32, 'sawtooth', { gain: 0.28, freqEnd: 42, attack: 0.02, decay: 0.12 });
    setTimeout(() => this._beep(58, 0.22, 'square', { gain: 0.2, freqEnd: 28, attack: 0.01, decay: 0.1 }), 90);
    setTimeout(() => this._noiseBurst(0.08, { gain: 0.12, filterFreq: 400 }), 180);
  }

  /** Energy attach — sparkle chime (~0.35s). */
  playMagicEnergy() {
    const chimes = [1047, 1319, 1568];
    chimes.forEach((f, i) => {
      setTimeout(
        () => this._beep(f, 0.065, 'sine', { gain: 0.2, freqEnd: f * 1.03, attack: 0.003, decay: 0.045 }),
        i * 52,
      );
    });
    setTimeout(() => this._beep(2093, 0.045, 'triangle', { gain: 0.1, attack: 0.002 }), 168);
  }

  playDamage() {
    this._beep(220, 0.1, 'sawtooth', { gain: 0.3, freqEnd: 110, attack: 0.003 });
  }

  playKO() {
    this._beep(380, 0.14, 'triangle', { gain: 0.32, freqEnd: 120 });
    setTimeout(() => this._beep(200, 0.12, 'sine', { gain: 0.25, freqEnd: 80 }), 90);
  }

  playEnergy() {
    this.playMagicEnergy();
  }

  playHeal() {
    this._beep(440, 0.08, 'sine', { gain: 0.24, freqEnd: 660 });
    setTimeout(() => this._beep(660, 0.1, 'sine', { gain: 0.2, freqEnd: 880 }), 70);
  }

  playCoin() {
    this._beep(1040, 0.04, 'sine', { gain: 0.22 });
    setTimeout(() => this._beep(1320, 0.05, 'sine', { gain: 0.18 }), 45);
  }

  playWin() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => {
      setTimeout(() => this._beep(f, 0.12, 'sine', { gain: 0.28 }), i * 95);
    });
  }

  playTurn() {
    this._beep(392, 0.09, 'triangle', { gain: 0.2, freqEnd: 494 });
  }

  playCardPlay() {
    this._noiseBurst(0.04, { gain: 0.1, filterFreq: 1200 });
    this._beep(300, 0.06, 'sine', { gain: 0.18, freqEnd: 420 });
  }

  playPromote() {
    this._beep(330, 0.08, 'sine', { gain: 0.24, freqEnd: 550 });
    setTimeout(() => this._beep(550, 0.1, 'triangle', { gain: 0.22, freqEnd: 720 }), 60);
  }

  /** Subtle prize chime (lighter than playCoin). */
  playPrizeChime() {
    this._beep(880, 0.06, 'sine', { gain: 0.14 });
    setTimeout(() => this._beep(1100, 0.08, 'sine', { gain: 0.12, freqEnd: 1240 }), 50);
  }
}

export const gameAudio = new GameAudio();
