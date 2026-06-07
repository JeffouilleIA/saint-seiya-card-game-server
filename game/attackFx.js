/** Styles d'animation d'attaque (thème anime) — data/attack-fx.json */

let ATTACK_FX_MAP = {};
let FX_TIMING = {};

const NAME_GUESSES = [
  [/m[eé]t[eé]ore.*p[eé]gase|m\s*t\s*ores.*p\s*gase|com[eè]te.*p[eé]gase/i, 'pegasus-meteors'],
  [/m[eé]t[eé]ore.*noir|m\s*t\s*ores.*noir|com[eè]te.*noir/i, 'black-meteors'],
  [/m[eé]t[eé]ore.*aigle|m[eé]t[eé]ores de l['']?aigle/i, 'eagle-meteors'],
  [
    /hoyoku|tensho|battement d['’]?aile|battement d['’]?ailes|vol du ph[eé]nix|ph[eé]nix noir|ph[eé]nix qui vole/i,
    'phoenix-hoyoku-tensho',
  ],
  [/m[eé]t[eé]ore.*hercule|hercule.*m[eé]t[eé]ore/i, 'docrates-meteores-hercule'],
  [/col[eè]re.*dragon|col\s*re.*dragon|fureur.*dragon/i, 'dragon-wrath'],
  [/météore|meteore/i, 'eagle-meteors'],
  [/flèche|fleche/i, 'arrow-ghost'],
  [/toile|web/i, 'spider-web-drain'],
  [/feu|flamme|fire/i, 'fire-tornado'],
  [/lotus/i, 'lotus-spin'],
  [/griffes du tonnerre|thunder\s*claw/i, 'shina-thunder-claw'],
  [/combo griffes/i, 'ichi-combo-griffe'],
  [/tourbillon.*l[eé]zard|l[eé]zard.*tourbillon/i, 'misty-tourbillon-lezard'],
  [/ankh sacrificielle/i, 'kagaho-ankh-sacrificielle'],
  [/cobra|morsure/i, 'cobra-bite'],
  [/corbeau|plume/i, 'crow-swarm'],
  [/cha\s*ne\s*serpent|cha[iîê].*serpent|serpent.*cha[iîê]/i, 'andromede-chaine-serpent'],
  [/chaîne|chaine/i, 'chains-bind'],
  [/bouclier.*m[eé]duse|m[eé]duse.*bouclier/i, 'medusa-shield'],
  [/lyre|note|mélodie|melodie/i, 'music-notes'],
  [/corps à corps|corps a corps/i, 'melee-light'],
  [/^om$/i, 'shaka-om'],
  [/tr[eé]sors du ciel/i, 'shakka-tresor-du-ciel'],
  [/trident royal/i, 'poseidon-trident-royal'],
  [/plasma foudroyant/i, 'aior-plasma'],
  [/poussi[eè]re.*diamant|poussi\s*re.*diamant/i, 'hyoga-diamond-dust'],
  [/tonnerre de l['']?aube/i, 'hyoga-dawn-thunder'],
  [/boule de feu/i, 'aior-fireball'],
  [/appel aux amis/i, 'vieux-allies'],
  [/[eé]clairs de rozan/i, 'vieux-rozan'],
  [/col[eè]re du dragon/i, 'dokko-dragon-spirit'],
  [/100 dragons/i, 'dokko-hundred-dragons'],
  [/aiguille [eé]carlate/i, 'milo-scarlet-needle'],
  [/antar[eè]s/i, 'milo-antares'],
  [/foudre atomique/i, 'sagittarius-atomic-thunder'],
  [/fl[eè]che d'or/i, 'aioros-golden-arrow'],
  [/excalibur/i, 'shura-excalibur'],
  [/saut du capricorne/i, 'shura-capricorn-leap'],
  [/dague sacr[eé]e/i, 'pope-sacred-dagger'],
  [/rayon diabolique/i, 'pope-diabolic-ray'],
  [/armure des g[eé]meaux/i, 'pope-gemini-armor'],
  [/corne.*taureau|great\s*horn|grand\s*horn/i, 'aldebaran-great-horn'],
  [/autre dimension/i, 'saga-dimension'],
  [/privation des 5 sens/i, 'saga-five-senses'],
  [/explosion galactique/i, 'saga-explosion-galactique'],
  [/mur de cristal/i, 'mu-crystal-wall'],
  [/spirale stellaire/i, 'mu-spiral-stellaire'],
  [/mort d'une [eé]toile/i, 'mu-death-star'],
];

/** Chevaliers d'or — attaques thématiques ~3s */
export const GOLD_SAINT_FX_IDS = new Set([
  'shaka-om',
  'shakka-tresor-du-ciel',
  'aior-plasma',
  'aior-fireball',
  'vieux-allies',
  'vieux-rozan',
  'dokko-dragon-spirit',
  'dokko-hundred-dragons',
  'milo-scarlet-needle',
  'milo-antares',
  'aioros-golden-arrow',
  'shura-excalibur',
  'shura-capricorn-leap',
  'aldebaran-great-horn',
  'pope-sacred-dagger',
  'pope-diabolic-ray',
  'pope-gemini-armor',
  'saga-dimension',
  'saga-five-senses',
  'saga-explosion-galactique',
  'mu-crystal-wall',
  'mu-spiral-stellaire',
  'mu-death-star',
]);

export function isGoldSaintAttackFx(fxId) {
  return GOLD_SAINT_FX_IDS.has(fxId);
}

export function goldSaintFxDurationMs(fallbackMs = 3000) {
  const t = FX_TIMING['gold-saint'] || {};
  return t.durationMs ?? fallbackMs;
}

/** Spirale Stellaire: video ends at durationMs; flash tail may extend total FX length. */
export function muSpiralStellaireFxDurationMs(t = {}) {
  const videoEndMs = t.durationMs ?? 5800;
  const flashAtMs = t.flashAtMs ?? Math.max(0, videoEndMs - 200);
  const flashFadeMs = t.flashFadeMs ?? 2000;
  return Math.max(videoEndMs, flashAtMs + flashFadeMs);
}

/** Explosion Galactique: shared timing for UI CSS vars and engine duration. */
export function sagaExplosionGalactiqueTiming(t = {}) {
  const videoEndMs = t.durationMs ?? 11038;
  const fadeMs = t.videoFadeOutMs ?? 1000;
  const fadeStartMs = Math.max(0, videoEndMs - fadeMs);
  const flashAtMs = t.flashAtMs ?? Math.max(0, videoEndMs - 200);
  const flashFadeMs = t.flashFadeMs ?? 1000;
  const fxTotalMs = Math.max(videoEndMs, flashAtMs + flashFadeMs);
  return { videoEndMs, fadeMs, fadeStartMs, flashAtMs, flashFadeMs, fxTotalMs };
}

/** Explosion Galactique: video ends at durationMs; flash tail may extend total FX length. */
export function sagaExplosionGalactiqueFxDurationMs(t = {}) {
  return sagaExplosionGalactiqueTiming(t).fxTotalMs;
}

/** Per-FX duration when `_fxTiming[fxId].durationMs` is set. */
export function themedFxDurationMs(fxId, fallbackMs = 3000) {
  const t = FX_TIMING[fxId] || {};
  if (fxId === 'mu-spiral-stellaire') return muSpiralStellaireFxDurationMs(t);
  if (fxId === 'saga-explosion-galactique') return sagaExplosionGalactiqueFxDurationMs(t);
  if (t.durationMs != null) return t.durationMs;
  if (isGoldSaintAttackFx(fxId)) return goldSaintFxDurationMs(fallbackMs);
  return fallbackMs;
}

export function loadAttackFx() {
  return fetch('./data/attack-fx.json')
    .then((r) => (r.ok ? r.json() : {}))
    .then((data) => {
      const raw = data || {};
      const { _fxTiming, ...cards } = raw;
      ATTACK_FX_MAP = cards;
      FX_TIMING = _fxTiming || {};
    })
    .catch(() => {
      ATTACK_FX_MAP = {};
      FX_TIMING = {};
    });
}

export function getAttackFxId(cardId, attackName) {
  if (!cardId || !attackName) return 'melee-light';
  const byCard = ATTACK_FX_MAP[cardId];
  if (byCard?.[attackName]) return byCard[attackName];
  for (const [re, id] of NAME_GUESSES) {
    if (re.test(attackName)) return id;
  }
  return 'melee-light';
}

/** FX ids from attack-fx.json for corp à corps (melee-kick, melee-punch, …). */
export function isMeleeAttackFx(fxId) {
  return typeof fxId === 'string' && fxId.startsWith('melee-');
}

/** True when attack resolves as corp à corps (FX id or attack name). */
export function isMeleeAttack(cardId, attackName) {
  if (isMeleeAttackFx(getAttackFxId(cardId, attackName))) return true;
  return /corps\s*[àa]\s*corps/i.test(attackName || '');
}

/** Bronze signature FX (Seiya meteors, Shiryu dragon) — skip generic punch/beam. */
export function isSignatureAttackFx(fxId) {
  return (
    fxId === 'pegasus-meteors' ||
    fxId === 'black-meteors' ||
    fxId === 'sagittarius-atomic-thunder' ||
    fxId === 'eagle-meteors' ||
    fxId === 'dragon-wrath' ||
    fxId === 'docrates-meteores-hercule' ||
    fxId === 'medusa-shield' ||
    fxId === 'hyoga-diamond-dust' ||
    fxId === 'hyoga-dawn-thunder' ||
    fxId === 'phoenix-hoyoku-tensho' ||
    fxId === 'shina-thunder-claw' ||
    fxId === 'ichi-combo-griffe' ||
    fxId === 'shura-excalibur' ||
    fxId === 'mu-spiral-stellaire' ||
    fxId === 'kagaho-ankh-sacrificielle' ||
    fxId === 'misty-tourbillon-lezard' ||
    fxId === 'andromede-chaine-serpent' ||
    fxId === 'shakka-tresor-du-ciel' ||
    fxId === 'saga-explosion-galactique' ||
    fxId === 'poseidon-trident-royal'
  );
}

/** Defer HP loss until themed FX finishes (pegasus meteors, medusa shield, …). */
export function shouldDeferAttackDamage(fxId) {
  // Engine finishAttack always defers damage until after visual FX + coin flips.
  // Kept for UI/audio timing hints (impact SFX, deferred hit animations).
  return (
    fxId === 'pegasus-meteors' ||
    fxId === 'black-meteors' ||
    fxId === 'sagittarius-atomic-thunder' ||
    fxId === 'eagle-meteors' ||
    fxId === 'medusa-shield' ||
    fxId === 'hyoga-diamond-dust' ||
    fxId === 'dragon-wrath' ||
    fxId === 'docrates-meteores-hercule' ||
    fxId === 'milo-scarlet-needle' ||
    fxId === 'shura-capricorn-leap' ||
    fxId === 'shura-excalibur' ||
    fxId === 'aldebaran-great-horn' ||
    fxId === 'phoenix-hoyoku-tensho' ||
    fxId === 'shina-thunder-claw' ||
    fxId === 'ichi-combo-griffe' ||
    fxId === 'mu-spiral-stellaire' ||
    fxId === 'kagaho-ankh-sacrificielle' ||
    fxId === 'misty-tourbillon-lezard' ||
    fxId === 'andromede-chaine-serpent' ||
    fxId === 'shakka-tresor-du-ciel' ||
    fxId === 'saga-explosion-galactique' ||
    fxId === 'poseidon-trident-royal'
  );
}

/** Optional per-FX timing from attack-fx.json `_fxTiming`. */
export function getFxTiming(fxId) {
  return FX_TIMING[fxId] || {};
}

/** Poséidon Trident Royal — lethal uses Trident.mp4, non-lethal uses TridentCourt.mp4. */
export function poseidonTridentRoyalTiming(t = FX_TIMING['poseidon-trident-royal'] || {}, lethal = true) {
  if (lethal) {
    return {
      videoPath: t.videoPath ?? './sons/Trident.mp4',
      durationMs: t.durationMs ?? 6778,
      impactAtMs: t.impactAtMs ?? 4880,
      videoStartSec: t.videoStartSec ?? 0,
      videoOpacity: t.videoOpacity ?? 0.35,
      videoVolume: t.videoVolume ?? 0.35,
      videoFadeInMs: t.videoFadeInMs ?? 350,
      videoFadeOutMs: t.videoFadeOutMs ?? 700,
    };
  }
  return {
    videoPath: t.courtVideoPath ?? './sons/TridentCourt.mp4',
    durationMs: t.courtDurationMs ?? 5435,
    impactAtMs: t.courtImpactAtMs ?? 3913,
    videoStartSec: t.videoStartSec ?? 0,
    videoOpacity: t.videoOpacity ?? 0.35,
    videoVolume: t.videoVolume ?? 0.35,
    videoFadeInMs: t.videoFadeInMs ?? 350,
    videoFadeOutMs: t.videoFadeOutMs ?? 700,
  };
}

/** When fullscreen whiteout starts (overlaps last part of eye glow by default). */
export function medusaWhiteStartSec(t = FX_TIMING['medusa-shield'] || {}) {
  if (t.whiteFlashStartSec != null) return t.whiteFlashStartSec;
  const reveal = t.revealSec ?? 2.5;
  const eyeStart = t.eyeFlashStartSec ?? reveal * 0.74;
  const eyeSec = t.eyeFlashSec ?? 0.65;
  if (t.whiteFlashDelaySec != null) return reveal + t.whiteFlashDelaySec;
  return eyeStart + eyeSec * 0.55;
}

/** Medusa shield: reveal → eye glow (white overlaps tail) → splash / damage. */
export function medusaFxTotalSec(t = FX_TIMING['medusa-shield'] || {}) {
  if (t.totalSec != null) return t.totalSec;
  const reveal = t.revealSec ?? 2.5;
  const whiteFlash = t.whiteFlashSec ?? 0.35;
  return Math.max(reveal, medusaWhiteStartSec(t) + whiteFlash);
}

/** Total medusa shield FX duration (reveal + white flash tail). */
export function medusaFxDurationMs(fallbackMs = 3000) {
  const totalSec = medusaFxTotalSec();
  return Math.max(fallbackMs, Math.ceil(totalSec * 1000) + 350);
}

/** Aioria — Plasma foudroyant (~2.5s multi-direction light barrage). */
export function aiorPlasmaFxDurationMs(fallbackMs = 2500) {
  const t = FX_TIMING['aior-plasma'] || {};
  return t.durationMs ?? fallbackMs;
}

/** Docrates — Météores d'Hercule (~14.1s charge + twin parallel projectiles, 4 phases). */
export function docratesMeteoresFxDurationMs(fallbackMs = 14100) {
  const t = FX_TIMING['docrates-meteores-hercule'] || {};
  if (t.durationMs != null) return t.durationMs;
  const p1 = t.phase1Ms ?? 12000;
  const p2 = t.phase2Ms ?? 620;
  const p3 = t.phase3Ms ?? 700;
  const p4 = t.phase4Ms ?? 780;
  return p1 + p2 + p3 + p4 || fallbackMs;
}

/** Shiryu — Colère / Fureur du Dragon (~2.9s serpent dragon, 4 phases). */
export function dragonWrathFxDurationMs(fallbackMs = 2900) {
  const t = FX_TIMING['dragon-wrath'] || {};
  if (t.durationMs != null) return t.durationMs;
  const p1 = t.phase1Ms ?? 700;
  const p2 = t.phase2Ms ?? 800;
  const p3 = t.phase3Ms ?? 1000;
  const p4 = t.phase4Ms ?? 400;
  return p1 + p2 + p3 + p4 || fallbackMs;
}

/** Hyoga — Poussière de Diamant (~3.5s ice storm, 4 phases). */
export function hyogaDiamondDustFxDurationMs(fallbackMs = 3500) {
  const t = FX_TIMING['hyoga-diamond-dust'] || {};
  if (t.durationMs != null) return t.durationMs;
  const p1 = t.phase1Ms ?? 600;
  const p2 = t.phase2Ms ?? 700;
  const p3 = t.phase3Ms ?? 1700;
  const p4 = t.phase4Ms ?? 500;
  return p1 + p2 + p3 + p4 || fallbackMs;
}

/** Hyoga — Tonnerre de l'aube (~2.9s lightning barrage). */
export function hyogaDawnThunderFxDurationMs(fallbackMs = 2900) {
  const t = FX_TIMING['hyoga-dawn-thunder'] || {};
  return t.durationMs ?? fallbackMs;
}

/** Aioria — Boule de feu (~2.6s single projectile + impact burst). */
export function aiorFireballFxDurationMs(fallbackMs = 2600) {
  const t = FX_TIMING['aior-fireball'] || {};
  if (t.durationMs != null) return t.durationMs;
  const prep = t.prepMs ?? 450;
  const flight = t.flightMs ?? 950;
  const burst = t.burstMs ?? 550;
  return prep + flight + burst + 450;
}

/** Themed attack FX length for engine/UI timers. */
export function attackFxDurationMs(fxId, fallbackMs = 1250, opts = {}) {
  if (fxId === 'poseidon-trident-royal') {
    return poseidonTridentRoyalTiming(FX_TIMING[fxId] || {}, opts.attackLethal !== false).durationMs;
  }
  if (
    fxId === 'pegasus-meteors' ||
    fxId === 'black-meteors' ||
    fxId === 'sagittarius-atomic-thunder' ||
    fxId === 'eagle-meteors'
  ) {
    return pegasusFxDurationMs(fallbackMs, fxId);
  }
  if (fxId === 'medusa-shield') return medusaFxDurationMs(fallbackMs);
  if (fxId === 'aior-plasma') return aiorPlasmaFxDurationMs(fallbackMs);
  if (fxId === 'aior-fireball') return aiorFireballFxDurationMs(fallbackMs);
  if (fxId === 'hyoga-diamond-dust') return hyogaDiamondDustFxDurationMs(fallbackMs);
  if (fxId === 'hyoga-dawn-thunder') return hyogaDawnThunderFxDurationMs(fallbackMs);
  if (fxId === 'dragon-wrath') return dragonWrathFxDurationMs(fallbackMs);
  if (fxId === 'docrates-meteores-hercule') return docratesMeteoresFxDurationMs(fallbackMs);
  return themedFxDurationMs(fxId, isGoldSaintAttackFx(fxId) ? goldSaintFxDurationMs(fallbackMs) : fallbackMs);
}

/** Total meteor-storm FX duration (flash + meteors + veil tail). */
export function pegasusFxDurationMs(fallbackMs = 2800, fxId = 'pegasus-meteors') {
  const t = FX_TIMING[fxId] || FX_TIMING['pegasus-meteors'] || {};
  const count = t.count ?? 30;
  const meteorStart = t.meteorStartSec ?? 3;
  const stagger = t.staggerSec ?? 0.0603;
  const fall = t.fallSec ?? 0.14;
  const burstDelay = t.burstDelaySec ?? 0.268;
  const burst = t.burstSec ?? 0.509;
  const veil = t.veilSec ?? 1.273;
  const impactsEnd = meteorStart + (count - 1) * stagger + burstDelay + Math.max(burst, fall);
  const totalSec = impactsEnd + veil * 0.35;
  return Math.max(fallbackMs, Math.ceil(totalSec * 1000) + 350);
}

/** Stadium overlay FX length (Elysion judgement, etc.). */
export function stadiumFxDurationMs(fxId, fallbackMs = 1000) {
  if (fxId === 'elysion_judgement') return fallbackMs || 1000;
  if (fxId === 'athena_blood') return fallbackMs || 3000;
  if (isGoldSaintAttackFx(fxId)) return goldSaintFxDurationMs(fallbackMs || 3000);
  return fallbackMs;
}

/** Dragon count for Les 100 Dragons (scales with discarded energy). */
export function hundredDragonsFxCount(discardedEnergyCount = 0) {
  const t = FX_TIMING['dokko-hundred-dragons'] || {};
  const base = t.baseCount ?? 5;
  const per = t.perEnergy ?? 2;
  const max = t.maxCount ?? 28;
  const n = base + Math.max(0, discardedEnergyCount) * per;
  return Math.min(max, Math.max(base, n));
}
