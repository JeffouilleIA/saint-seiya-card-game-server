/**
 * Menu principal, constructeur de deck, sélection avant partie
 */

import {
  getAttackTestKnights,
  getCardDef,
  getCardImageUrl,
  getKnightRewardCards,
  getPrizeCountForKnockout,
  isBronzeAutre,
  isBronzeMajeur,
  isBronzeMineur,
  isLostCanvasGold,
  knightHasTag,
} from './cards.js';
import { syncCardImage } from './ui.js';
import {
  TARGET_DECK_SIZE,
  MAX_COPIES_PER_CARD,
  loadSavedDecks,
  loadDeckFolders,
  saveDeck,
  createDeckFolder,
  renameDeckFolder,
  deleteDeck,
  deleteDeckFolder,
  moveDeckToFolder,
  groupDecksByFolder,
  UNFILED_FOLDER_LABEL,
  getAllDeckOptions,
  getDeckById,
  isSharedDeckStorage,
  usesServerDeckStorage,
  refreshDeckStorage,
  publishLocalDecksToProject,
  getPoolCards,
  deckEntryToCardList,
  poolFilterType,
  poolTypeLabel,
  countDeckCards,
  validateDeck,
  maxCopiesForCard,
  isDeckEnergyCard,
} from './decks.js';
import {
  clearAllDeckStats,
  formatStatDecimal,
  formatStatNumber,
  formatWinPercent,
  getAvgDamagePerTurnForMatch,
  getDeckStatRows,
} from './deck-stats.js';
import {
  formatAiBattleStatus,
  formatWinReason,
  simulateAiBattle,
} from './ai-battle.js';
import {
  clearTwelveHousesLeaderboard,
  formatLegendDate,
  loadTwelveHousesLeaderboard,
  prepareTwelveHousesRun,
  saveTwelveHousesLegend,
  TWELVE_HOUSES_DIFFICULTIES,
  TWELVE_HOUSES_DIFFICULTY_HINTS,
  TWELVE_HOUSES_DIFFICULTY_LABELS,
  normalizeTwelveHousesDifficulty,
  getHouseLadderItemState,
  getHouseDeckDisplayName,
  formatHouseTierLabel,
} from './twelve-houses.js';
import {
  MIN_DECKS_PER_PLAYER,
  MAX_DECKS_PER_PLAYER,
  applyDraftPick,
  applySecretPick,
  advanceSecretPhase,
  beginSecretPickPhase,
  clearCombat1000History,
  createCombat1000Run,
  formatCombat1000Date,
  getActiveCombat1000Run,
  getCombat1000Winner,
  getDraftTurnInfo,
  getMatchDeckNames,
  getUnusedDeckIds,
  isDraftComplete,
  loadCombat1000History,
  minDecksRequiredForCombat,
} from './combat-1000-jours.js';
import { getMultiplayerClient, readLastRoom } from './multiplayer.js';

const DECK_LIMIT_HINT = `max ${MAX_COPIES_PER_CARD} par carte (énergies illimitées)`;
/** Clé spéciale de navigation : afficher tous les decks (combat). */
const ALL_FOLDERS_NAV_KEY = '__all__';
const ALL_FOLDERS_LABEL = 'Tous';

export const AI_DIFFICULTY_STORAGE_KEY = 'chevalier-ai-difficulty';
export const AI_DIFFICULTIES = ['facile', 'moyen', 'difficile', 'expert', 'legende', 'ridicule', 'absurde'];

export function normalizeAiDifficulty(value) {
  return AI_DIFFICULTIES.includes(value) ? value : 'moyen';
}

export function loadAiDifficulty() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(AI_DIFFICULTY_STORAGE_KEY) : null;
    return normalizeAiDifficulty(raw);
  } catch {
    return 'moyen';
  }
}

export function saveAiDifficulty(value) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(AI_DIFFICULTY_STORAGE_KEY, normalizeAiDifficulty(value));
    }
  } catch {
    /* localStorage unavailable */
  }
}

const AI_DIFFICULTY_LABELS = {
  facile: 'Facile',
  moyen: 'Moyen',
  difficile: 'Difficile',
  expert: 'Expert',
  legende: 'Légende',
  ridicule: 'Ridicule',
  absurde: 'Absurde',
};

const AI_DIFFICULTY_HINTS = {
  facile: '',
  moyen: '',
  difficile: '',
  expert: '',
  legende: 'Recherche approfondie, sans triche',
  ridicule: 'Triche : connaît l\'ordre du deck et les prochaines pioches',
  absurde: 'Triche : deck + main adverse visible pour l\'IA',
};

const POOL_FILTERS = ['all', 'chevalier', 'energie', 'supporter', 'stade', 'objet', 'outil'];

/** Sous-filtres chevaliers (bronze de base = mineur + majeur, hors Cosmo ardent / divin). */
const POOL_CHEVALIER_FILTERS = [
  { id: 'all', label: 'Tous les chevaliers' },
  { id: 'bronze-mineur', label: 'Bronze mineur' },
  { id: 'chevalier-bronze', label: 'Bronze majeur' },
  { id: 'cosmo-ardent', label: 'Cosmo ardent' },
  { id: 'bronze-autre', label: 'Bronze autre' },
  { id: 'chevalier-noir', label: 'Chevalier noir', optional: true },
  { id: 'chevalier-argent', label: 'Argent' },
  { id: 'chevalier-or', label: 'Or' },
  { id: 'guerrier-divin-asgard', label: 'Asgard' },
  { id: 'armee-poseidon', label: 'Généraux de Poséidon', optional: true },
  { id: 'spectre', label: 'Spectres', optional: true },
  { id: 'juge', label: 'Juges', optional: true },
  { id: 'chevalier-divin', label: 'Chevalier Divin', optional: true },
  { id: 'divinite', label: 'Divinité', optional: true },
  { id: 'lost-canvas', label: 'Lost Canvas' },
];

function poolChevalierSubFilter(card, subFilter) {
  if (!subFilter || subFilter === 'all') return card.cardType === 'chevalier';
  if (card.cardType !== 'chevalier') return false;
  switch (subFilter) {
    case 'bronze-de-base':
      return isBronzeMajeur(card) || isBronzeMineur(card);
    case 'chevalier-bronze':
      return isBronzeMajeur(card);
    case 'bronze-mineur':
      return isBronzeMineur(card);
    case 'chevalier-argent':
      return card.rawType === 'chevalier-argent';
    case 'chevalier-or':
      return card.rawType === 'chevalier-or' && !isLostCanvasGold(card);
    case 'lost-canvas':
      return isLostCanvasGold(card);
    case 'guerrier-divin-asgard':
      return card.knightType === 'GuerrierDivinAsgard' || card.rawType === 'guerrier-divin-asgard';
    case 'armee-hades':
      return card.rawType === 'armee-hades';
    case 'juge':
      return card.rawType === 'armee-hades' && knightHasTag(card, 'juge');
    case 'spectre':
      return card.rawType === 'armee-hades' && knightHasTag(card, 'spectre');
    case 'armee-poseidon':
      return card.rawType === 'armee-poseidon';
    case 'cosmo-ardent':
      return card.stage === 'cosmo ardent';
    case 'bronze-autre':
      return isBronzeAutre(card);
    case 'chevalier-divin':
      return card.stage === 'chevalier-divin' || card.knightType === 'ChevalierDivin';
    case 'divinite':
      return card.knightType === 'Divinite';
    case 'chevalier-noir':
      return card.rawType === 'chevalier-noir';
    default:
      return true;
  }
}

function getVisibleChevalierSubFilters() {
  const pool = getPoolCards();
  const has = (pred) => pool.some((c) => c.cardType === 'chevalier' && pred(c));
  return POOL_CHEVALIER_FILTERS.filter((f) => {
    if (!f.optional) return true;
    if (f.id === 'chevalier-noir') return has((c) => c.rawType === 'chevalier-noir');
    if (f.id === 'cosmo-ardent') return has((c) => c.stage === 'cosmo ardent');
    if (f.id === 'bronze-autre') return has((c) => isBronzeAutre(c));
    if (f.id === 'chevalier-divin') return has((c) => c.stage === 'chevalier-divin');
    if (f.id === 'divinite') return has((c) => c.knightType === 'Divinite');
    if (f.id === 'juge') return has((c) => c.rawType === 'armee-hades' && knightHasTag(c, 'juge'));
    if (f.id === 'spectre') return has((c) => c.rawType === 'armee-hades' && knightHasTag(c, 'spectre'));
    if (f.id === 'armee-poseidon') return has((c) => c.rawType === 'armee-poseidon');
    if (f.id === 'lost-canvas') return has((c) => isLostCanvasGold(c));
    return true;
  });
}

function rewardLabel(card) {
  const n = getKnightRewardCards(card);
  if (n == null || n < 1) return '';
  return ` · ${n} récomp.`;
}

const CARD_IMG_ONLOAD =
  "this.classList.add('loaded');this.classList.remove('missing')";
const CARD_IMG_ONERROR =
  "this.classList.add('missing');this.classList.remove('loaded')";

function escapePreviewHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stagePreviewLabel(stage) {
  if (stage === 'cosmo ardent') return 'Cosmo ardent';
  if (stage === 'chevalier-divin') return 'Chevalier divin';
  if (stage === 'evolution') return 'Évolution';
  if (stage === 'base') return '';
  return stage;
}

/** Full card detail markup for deck builder zoom overlay. */
function buildBuilderPreviewHtml(cardId) {
  const def = getCardDef(cardId);
  if (!def) {
    return `<p class="builder-preview-missing">Carte inconnue : ${escapePreviewHtml(cardId)}</p>`;
  }

  const imgSrc = getCardImageUrl(cardId);
  const meta = [];
  if (def.type) meta.push(def.type);
  const stageLbl = stagePreviewLabel(def.stage);
  if (stageLbl) meta.push(stageLbl);
  if (def.knightType === 'GuerrierDivinAsgard') meta.push('Asgard');
  if (def.knightType === 'Spectre') meta.push('Spectre');
  if (def.knightType === 'Juge') meta.push('Juge');
  if (def.knightType === 'GeneralPoseidon') meta.push('Général Poséidon');
  if (knightHasTag(def, 'julian-solo')) meta.push('Julian Solo');
  if (def.id === 'poseidon-dieu-oceans') meta.push('Poséidon Dieu des Océans');
  if (def.cardType === 'energie' && def.energyType) meta.push(`Énergie ${def.energyType}`);

  const badges = [];
  if (def.stage === 'cosmo ardent') badges.push('<span class="builder-preview-badge cosmo">Cosmo ardent</span>');
  if (def.stage === 'chevalier-divin') badges.push('<span class="builder-preview-badge divin">Divin</span>');
  if (def.cardType === 'supporter') badges.push('<span class="builder-preview-badge supporter">Supporter</span>');
  if (def.cardType === 'stade') badges.push('<span class="builder-preview-badge stade">Stade</span>');
  if (def.cardType === 'outil') badges.push('<span class="builder-preview-badge outil">Outil</span>');
  if (def.cardType === 'objet') badges.push('<span class="builder-preview-badge objet">Objet</span>');

  const stats = [];
  if (def.hp != null) stats.push(`<span class="builder-preview-stat"><strong>PV</strong> ${def.hp}</span>`);
  if (def.retreat != null && def.cardType === 'chevalier') {
    stats.push(`<span class="builder-preview-stat"><strong>Retraite</strong> ${def.retreat}</span>`);
  }
  const prizeLine =
    def.cardType === 'chevalier'
      ? `<p class="builder-preview-prize"><strong>Cartes récompense (si KO) :</strong> ${getPrizeCountForKnockout(def)}</p>`
      : '';

  const attacksHtml =
    def.attacks?.length &&
    def.attacks
      .map((a) => {
        const desc =
          typeof a.description === 'string' && a.description.trim()
            ? `<p class="atk-desc">${escapePreviewHtml(a.description.trim())}</p>`
            : '';
        const label = a.label ? `<span class="atk-label">${escapePreviewHtml(a.label)}</span>` : '';
        const dmg = a.damage != null && a.damage !== '' ? String(a.damage) : '';
        return `
      <div class="attack-line">
        <span class="atk-cost">${'◆'.repeat(a.cost || 0) || '—'}</span>
        ${label}
        <strong class="atk-name">${escapePreviewHtml(a.name)}</strong>
        <span class="atk-dmg">${escapePreviewHtml(dmg)}</span>
        ${desc}
      </div>`;
      })
      .join('');

  const objetText =
    def.text &&
    (def.cardType === 'objet' ||
      def.cardType === 'supporter' ||
      def.cardType === 'stade' ||
      def.cardType === 'outil' ||
      def.cardType === 'dresseur')
      ? `<div class="builder-preview-effect"><h4>Effet</h4><p>${escapePreviewHtml(def.text)}</p></div>`
      : '';

  const talentHtml = def.talent
    ? `<div class="card-talent builder-preview-talent"><strong>${escapePreviewHtml(def.talent.name)}</strong><p>${escapePreviewHtml(def.talent.text)}</p></div>`
    : '';

  const attacksBlock = attacksHtml
    ? `<div class="builder-preview-section"><h4>Attaques</h4><div class="card-attacks">${attacksHtml}</div></div>`
    : '';

  return `
    <header class="builder-preview-header">
      <h2 class="builder-preview-name" id="builder-preview-name">${escapePreviewHtml(def.name)}</h2>
      ${meta.length ? `<p class="builder-preview-meta">${meta.map(escapePreviewHtml).join(' · ')}</p>` : ''}
      ${badges.length ? `<div class="builder-preview-badges">${badges.join('')}</div>` : ''}
      ${stats.length ? `<div class="builder-preview-stats">${stats.join('')}</div>` : ''}
      ${prizeLine}
    </header>
    <div class="builder-preview-art" id="builder-preview-art">
      ${
        imgSrc
          ? `<div class="card-art"><img src="${imgSrc}" alt="" loading="eager" onload="${CARD_IMG_ONLOAD}" onerror="${CARD_IMG_ONERROR}" /><div class="art-fallback" aria-hidden="true"></div></div>`
          : '<div class="card-art"><img class="missing" alt="" /><div class="art-fallback" aria-hidden="true"></div></div>'
      }
    </div>
    <div class="builder-preview-body">
      ${talentHtml}
      ${attacksBlock}
      ${objetText}
    </div>
  `;
}

/** Small card-art thumbnail for deck builder (pool + deck list). */
function createBuilderThumb(cardId, { eager = false, onPreview = null } = {}) {
  const def = getCardDef(cardId);
  const wrap = document.createElement('button');
  wrap.type = 'button';
  wrap.className = `builder-thumb builder-thumb-${def?.cardType || 'unknown'}`;
  if (cardId) wrap.dataset.cardId = cardId;
  wrap.setAttribute('aria-label', `Aperçu : ${def?.name || cardId}`);

  const imgSrc = getCardImageUrl(cardId);
  const loading = eager ? 'eager' : 'lazy';
  const art = document.createElement('div');
  art.className = 'card-art';
  art.innerHTML = imgSrc
    ? `<img src="${imgSrc}" alt="" loading="${loading}" onload="${CARD_IMG_ONLOAD}" onerror="${CARD_IMG_ONERROR}" />`
    : '<img class="missing" alt="" />';
  const fallback = document.createElement('div');
  fallback.className = 'art-fallback';
  fallback.setAttribute('aria-hidden', 'true');
  art.appendChild(fallback);
  wrap.appendChild(art);
  syncCardImage(wrap);
  if (onPreview) {
    wrap.addEventListener('click', (e) => {
      e.stopPropagation();
      onPreview(cardId);
    });
  }
  return wrap;
}

export class GameMenu {
  /**
   * @param {HTMLElement} host
   * @param {{ onStartMatch: (opts: { playerDeckId: string, opponentDeckId: string, gameMode: 'ai' | 'local2p', aiDifficulty?: string }) => void, onStartAttackTest: (knightCardId: string) => void, onStartTwelveHouses: (opts: { playerDeckId: string, difficulty: string, prepared?: object }) => void, onInitCombat1000: (run: object) => void, onStartCombat1000Match: () => void, onStartOnlineMatch: (opts: { seat: number, start: object, client: import('./multiplayer.js').MultiplayerClient }) => void }} callbacks
   */
  constructor(host, callbacks = {}) {
    this.host = host;
    this.onStartMatch = callbacks.onStartMatch || (() => {});
    this.onStartAttackTest = callbacks.onStartAttackTest || (() => {});
    this.onStartTwelveHouses = callbacks.onStartTwelveHouses || (() => {});
    this.onInitCombat1000 = callbacks.onInitCombat1000 || (() => {});
    this.onStartCombat1000Match = callbacks.onStartCombat1000Match || (() => {});
    this.onStartOnlineMatch = callbacks.onStartOnlineMatch || (() => {});
    this.screen = 'main';
    this.builderCards = [];
    this.builderEditingId = null;
    this.poolFilter = 'all';
    this.poolChevalierFilter = 'all';
    this.poolSearch = '';
    this.builderName = '';
    this.builderFolderId = '';
    this.builderPreviewCardId = null;
    this._builderPreviewKeyHandler = null;
    this.aiDifficulty = loadAiDifficulty();
    this.twelveHousesMeta = null;
    this.twelveHousesEndResult = null;
    this.twelveHousesDifficulty = 'normal';
    this.twelveHousesLegendTab = 'normal';
    this.twelveHousesPlayerDeckId = null;
    this.twelveHousesLadderPhase = 'intro';
    this.twelveHousesLadderOnContinue = null;
    this.aiBattleResult = null;
    this.aiBattleRunning = false;
    this.combat1000EndMeta = null;
    /** @type {string | null} null = liste des dossiers ; '' = Divers ; id = dossier ouvert ; ALL_FOLDERS_NAV_KEY = tous */
    this.editPickFolderId = null;
    /** @type {string | null} null = liste des dossiers ; ALL_FOLDERS_NAV_KEY = tous les decks */
    this.combatDraftFolderId = null;
    this.onlineClient = getMultiplayerClient();
    this.onlineJoinCode = '';
    this.onlinePlayerName = '';
    this.onlineMsg = '';
    this.onlineBusy = false;
  }

  showCombat1000Config() {
    this.screen = 'combat-1000-config';
    this.render();
  }

  showCombat1000Draft() {
    this.combatDraftFolderId = null;
    this.screen = 'combat-1000-draft';
    this.render();
  }

  showCombat1000SecretPick() {
    this.screen = 'combat-1000-secret';
    this.render();
  }

  showCombat1000Vs() {
    this.screen = 'combat-1000-vs';
    this.render();
  }

  /** @param {import('./combat-1000-jours.js').Combat1000Run} run */
  showCombat1000End(run, { abandoned = false } = {}) {
    this.combat1000EndMeta = { run, abandoned };
    this.screen = 'combat-1000-end';
    this.render();
  }

  showMain() {
    this.hideBuilderCardPreview();
    if (this._builderPreviewKeyHandler) {
      document.removeEventListener('keydown', this._builderPreviewKeyHandler);
      this._builderPreviewKeyHandler = null;
    }
    this.onlineMsg = '';
    this.screen = 'main';
    this.render();
  }

  showOnlineHome() {
    this.screen = 'online-home';
    this.onlineMsg = '';
    this.render();
  }

  showOnlineLobby() {
    this.screen = 'online-lobby';
    this.render();
  }

  showBuilder(editingDeck = null) {
    this.screen = 'builder';
    this.builderEditingId = editingDeck?.id ?? null;
    this.builderCards = editingDeck ? editingDeck.cards.map((c) => ({ ...c })) : [];
    this.builderName = editingDeck?.name || '';
    this.builderFolderId = editingDeck?.folderId || '';
    this.poolFilter = 'all';
    this.poolChevalierFilter = 'all';
    this.poolSearch = '';
    this.render();
  }

  showStart() {
    this.screen = 'start';
    this.render();
  }

  showEditPicker() {
    this.editPickFolderId = null;
    this.screen = 'edit-pick';
    this.render();
  }

  showStats() {
    this.screen = 'stats';
    this.render();
  }

  showTwelveHousesDifficulty() {
    this.twelveHousesMeta = null;
    this.screen = 'twelve-houses-difficulty';
    this.render();
  }

  showTwelveHousesPick() {
    this.twelveHousesPlayerDeckId = null;
    this.twelveHousesLadderOnContinue = null;
    this.screen = 'twelve-houses-pick';
    this.render();
  }

  showTwelveHousesLadderIntro(playerDeckId) {
    this.twelveHousesPlayerDeckId = playerDeckId;
    this.twelveHousesLadderPhase = 'intro';
    this.twelveHousesLadderOnContinue = null;
    this.screen = 'twelve-houses-ladder';
    this.render();
  }

  /**
   * Écran de progression entre deux combats (appelé depuis app.js).
   * @param {{ houses: object[], wins: number, currentIndex: number, totalHouses: number, onContinue: () => void }} opts
   */
  showTwelveHousesLadderProgress(opts) {
    this.twelveHousesLadderPhase = 'progress';
    this.twelveHousesLadderOnContinue = opts.onContinue || null;
    this.twelveHousesLadderData = {
      houses: opts.houses,
      wins: opts.wins,
      currentIndex: opts.currentIndex,
      totalHouses: opts.totalHouses,
      modeDifficulty: opts.modeDifficulty,
    };
    if (opts.modeDifficulty) {
      this.twelveHousesMeta = {
        ...(this.twelveHousesMeta || {}),
        houses: opts.houses,
        totalHouses: opts.totalHouses,
        modeDifficulty: opts.modeDifficulty,
      };
    }
    this.screen = 'twelve-houses-ladder';
    this.render();
  }

  showTwelveHousesEnd(result) {
    this.twelveHousesEndResult = result;
    this.screen = 'twelve-houses-end';
    this.render();
  }

  showTestKnightPicker() {
    this.screen = 'test-pick';
    this.poolFilter = 'all';
    this.poolChevalierFilter = 'all';
    this.poolSearch = '';
    this.render();
  }

  showAiBattlePick() {
    this.screen = 'ai-battle-pick';
    this.render();
  }

  showAiBattleResult(result) {
    this.aiBattleResult = result;
    this.screen = 'ai-battle-result';
    this.render();
  }

  render() {
    const deckScreens = new Set([
      'main',
      'edit-pick',
      'start',
      'twelve-houses-pick',
      'combat-1000-config',
      'combat-1000-draft',
      'combat-1000-secret',
      'online-home',
      'online-lobby',
    ]);
    if (usesServerDeckStorage() && deckScreens.has(this.screen)) {
      refreshDeckStorage().finally(() => this.renderNow());
      return;
    }
    this.renderNow();
  }

  renderNow() {
    if (this.screen === 'main') this.renderMain();
    else if (this.screen === 'builder') this.renderBuilder();
    else if (this.screen === 'start') this.renderStart();
    else if (this.screen === 'edit-pick') this.renderEditPicker();
    else if (this.screen === 'stats') this.renderStats();
    else if (this.screen === 'test-pick') this.renderTestKnightPicker();
    else if (this.screen === 'ai-battle-pick') this.renderAiBattlePick();
    else if (this.screen === 'ai-battle-result') this.renderAiBattleResult();
    else if (this.screen === 'twelve-houses-difficulty') this.renderTwelveHousesDifficulty();
    else if (this.screen === 'twelve-houses-pick') this.renderTwelveHousesPick();
    else if (this.screen === 'twelve-houses-ladder') this.renderTwelveHousesLadder();
    else if (this.screen === 'twelve-houses-end') this.renderTwelveHousesEnd();
    else if (this.screen === 'combat-1000-config') this.renderCombat1000Config();
    else if (this.screen === 'combat-1000-draft') this.renderCombat1000Draft();
    else if (this.screen === 'combat-1000-secret') this.renderCombat1000SecretPick();
    else if (this.screen === 'combat-1000-vs') this.renderCombat1000Vs();
    else if (this.screen === 'combat-1000-end') this.renderCombat1000End();
    else if (this.screen === 'online-home') this.renderOnlineHome();
    else if (this.screen === 'online-lobby') this.renderOnlineLobby();
  }

  renderMain() {
    const sharedHint = usesServerDeckStorage()
      ? `<p class="menu-shared-hint">${isSharedDeckStorage() ? 'Decks partagés sur le serveur (tous les appareils du réseau)' : 'Decks chargés depuis le projet (data/saved-decks.json)'}</p>`
      : '';
    this.host.innerHTML = `
      <div class="menu-screen menu-main">
        <h1 class="menu-title">Chevalier TCG</h1>
        <p class="menu-subtitle">Saint Seiya — V1</p>
        ${sharedHint}
        <nav class="menu-actions" aria-label="Menu principal">
          <button type="button" class="btn-menu primary" data-action="builder">Créer un deck</button>
          <button type="button" class="btn-menu" data-action="edit-pick">Modifier un deck</button>
          <button type="button" class="btn-menu" data-action="start">Lancer une partie</button>
          <button type="button" class="btn-menu" data-action="online">Jouer en ligne</button>
          <button type="button" class="btn-menu" data-action="ai-battle">IA Battle</button>
          <button type="button" class="btn-menu" data-action="twelve-houses">Les 12 maisons</button>
          <button type="button" class="btn-menu" data-action="combat-1000">Combat des 1000 Jours</button>
          <button type="button" class="btn-menu" data-action="test">Test</button>
          <button type="button" class="btn-menu" data-action="publish-decks">Publier mes decks dans le projet</button>
          <button type="button" class="btn-menu" data-action="stats">Statistiques</button>
        </nav>
      </div>
    `;
    this.host.querySelector('[data-action="builder"]')?.addEventListener('click', () => this.showBuilder());
    this.host.querySelector('[data-action="edit-pick"]')?.addEventListener('click', () => this.showEditPicker());
    this.host.querySelector('[data-action="start"]')?.addEventListener('click', () => this.showStart());
    this.host.querySelector('[data-action="online"]')?.addEventListener('click', () => this.showOnlineHome());
    this.host.querySelector('[data-action="ai-battle"]')?.addEventListener('click', () => this.showAiBattlePick());
    this.host.querySelector('[data-action="twelve-houses"]')?.addEventListener('click', () => this.showTwelveHousesDifficulty());
    this.host.querySelector('[data-action="combat-1000"]')?.addEventListener('click', () => this.showCombat1000Config());
    this.host.querySelector('[data-action="test"]')?.addEventListener('click', () => this.showTestKnightPicker());
    this.host.querySelector('[data-action="stats"]')?.addEventListener('click', () => this.showStats());
    this.host.querySelector('[data-action="publish-decks"]')?.addEventListener('click', () => {
      publishLocalDecksToProject().then((res) => {
        if (res.ok) {
          window.alert(`${res.count} deck(s) enregistré(s) dans Chevalier1/data/saved-decks.json.`);
          refreshDeckStorage().finally(() => this.showMain());
        } else {
          window.alert(res.error || 'Échec de la publication.');
        }
      });
    });
  }

  isOnlineRoomHost(room = this.onlineClient.room) {
    const socketId = this.onlineClient.socket?.id;
    if (room?.hostId && socketId) return room.hostId === socketId;
    return Number(this.onlineClient.seat) === 0;
  }

  explainOnlineStartBlock({ isHost, bothConnected, players, room, canStart }) {
    if (!isHost || canStart || room?.status !== 'waiting') return '';
    const reasons = [];
    if (players.length < 2) reasons.push('En attente du 2e joueur.');
    else if (!bothConnected) {
      const away = players.filter((p) => !p.connected).map((p) => p.name);
      if (away.length) reasons.push(`Joueur(s) hors ligne : ${away.join(', ')}.`);
    }
    for (const p of players) {
      if (!p.deckId) reasons.push(`${p.name} : deck non confirmé côté serveur.`);
      else if (!p.ready) reasons.push(`${p.name} : pas prêt.`);
    }
    return reasons.length
      ? `<p class="online-start-hint">${this.escapeHtml(reasons.join(' '))}</p>`
      : '';
  }

  beginOnlineMatch(start) {
    if (!start || this.screen === 'online-match') return;
    this.screen = 'online-match';
    this.onStartOnlineMatch({
      seat: this.onlineClient.seat,
      start,
      client: this.onlineClient,
    });
  }

  bindOnlineLobbyClient() {
    this.onlineClient.onRoomUpdate = (room) => {
      if (room?.status === 'playing' || room?.inGame) return;
      if (this.screen === 'online-lobby') this.renderOnlineLobby();
    };
    this.onlineClient.onGameStart = (start) => {
      this.beginOnlineMatch(start);
    };
    this.onlineClient.onOpponentLeft = () => {
      this.onlineMsg = 'L’adversaire s’est déconnecté.';
      this.showOnlineHome();
    };
    this.onlineClient.onRejoined = (payload) => {
      if (!payload?.start) return;
      this.onStartOnlineMatch({
        seat: payload.seat ?? this.onlineClient.seat,
        start: payload.start,
        client: this.onlineClient,
        reconnected: true,
        state: payload.state ?? null,
      });
    };
  }

  renderOnlineHome() {
    this.bindOnlineLobbyClient();
    const lastRoom = readLastRoom();
    const resumeBlock = lastRoom?.code
      ? `<div class="online-resume">
          <p>Session en cours : <strong>${this.escapeHtml(lastRoom.code)}</strong></p>
          <button type="button" class="btn-menu primary" data-action="reconnect-room" ${this.onlineBusy ? 'disabled' : ''}>Reprendre la partie</button>
        </div>`
      : '';
    const msg = this.onlineMsg
      ? `<p class="online-msg" role="status">${this.escapeHtml(this.onlineMsg)}</p>`
      : '<div id="online-msg"></div>';
    this.host.innerHTML = `
      <div class="menu-screen menu-online-home">
        <div class="menu-bar">
          <button type="button" class="btn-back" data-action="back">← Menu principal</button>
        </div>
        <h1 class="menu-title">Jouer en ligne</h1>
        <p class="menu-subtitle">Partie 1v1 sur internet — créez une salle ou rejoignez avec un code</p>
        ${resumeBlock}
        ${msg}
        <label class="online-field">
          <span>Votre pseudo</span>
          <input type="text" id="online-name" maxlength="24" placeholder="Joueur" value="${this.escapeAttr(this.onlinePlayerName)}" />
        </label>
        <div class="online-actions">
          <button type="button" class="btn-menu primary" data-action="create-room" ${this.onlineBusy ? 'disabled' : ''}>Créer une salle</button>
        </div>
        <fieldset class="online-join">
          <legend>Rejoindre une salle</legend>
          <label class="online-field">
            <span>Code (6 caractères)</span>
            <input type="text" id="online-code" maxlength="6" autocapitalize="characters" autocomplete="off" placeholder="ABC123" value="${this.escapeAttr(this.onlineJoinCode)}" />
          </label>
          <button type="button" class="btn-menu" data-action="join-room" ${this.onlineBusy ? 'disabled' : ''}>Rejoindre</button>
        </fieldset>
      </div>
    `;

    this.host.querySelector('[data-action="back"]')?.addEventListener('click', () => {
      void this.onlineClient.leaveRoom().finally(() => this.showMain());
    });

    const setBusy = (busy) => {
      this.onlineBusy = busy;
      for (const btn of this.host.querySelectorAll('[data-action="create-room"], [data-action="join-room"], [data-action="reconnect-room"]')) {
        btn.toggleAttribute('disabled', busy);
      }
    };

    const showMsg = (text, isError = false) => {
      this.onlineMsg = text;
      const el = this.host.querySelector('#online-msg') || this.host.querySelector('.online-msg');
      if (el) {
        el.textContent = text;
        el.classList.toggle('online-msg-error', isError);
      } else {
        this.renderOnlineHome();
      }
    };

    this.host.querySelector('[data-action="create-room"]')?.addEventListener('click', async () => {
      const name = this.host.querySelector('#online-name')?.value?.trim() || 'Hôte';
      this.onlinePlayerName = name;
      setBusy(true);
      showMsg('Connexion…');
      try {
        await this.onlineClient.createRoom(name);
        this.showOnlineLobby();
      } catch (err) {
        showMsg(err.message || 'Impossible de créer la salle.', true);
      } finally {
        setBusy(false);
      }
    });

    this.host.querySelector('[data-action="join-room"]')?.addEventListener('click', async () => {
      const name = this.host.querySelector('#online-name')?.value?.trim() || 'Invité';
      const code = this.host.querySelector('#online-code')?.value?.trim() || '';
      this.onlinePlayerName = name;
      this.onlineJoinCode = code.toUpperCase();
      if (!code.trim()) {
        showMsg('Entrez le code de la salle.', true);
        return;
      }
      setBusy(true);
      showMsg('Connexion…');
      try {
        await this.onlineClient.joinRoom(code, name);
        this.showOnlineLobby();
      } catch (err) {
        showMsg(err.message || 'Impossible de rejoindre.', true);
      } finally {
        setBusy(false);
      }
    });

    this.host.querySelector('[data-action="reconnect-room"]')?.addEventListener('click', async () => {
      const saved = readLastRoom();
      if (!saved?.code) {
        showMsg('Aucune session à reprendre.', true);
        return;
      }
      const name = this.host.querySelector('#online-name')?.value?.trim() || 'Joueur';
      this.onlinePlayerName = name;
      setBusy(true);
      showMsg('Reconnexion…');
      try {
        const reply = await this.onlineClient.reconnectRoom(saved.code, name);
        if (reply.start) {
          this.onStartOnlineMatch({
            seat: reply.seat,
            start: reply.start,
            client: this.onlineClient,
            reconnected: true,
            state: reply.state ?? null,
          });
        } else {
          this.showOnlineLobby();
        }
      } catch (err) {
        showMsg(err.message || 'Reconnexion impossible.', true);
      } finally {
        setBusy(false);
      }
    });
  }

  renderOnlineLobby() {
    this.bindOnlineLobbyClient();
    const room = this.onlineClient.room;
    if (!room) {
      this.showOnlineHome();
      return;
    }

    const decks = getAllDeckOptions();
    const mySeat = this.onlineClient.seat ?? 0;
    const players = room.players || [];
    const me = players.find((p) => p.seat === mySeat) || players[0];
    const preferredFolderKey = this.getFolderNavKeyForDeckId(decks, me?.deckId);
    const { empty, folderOptionsHtml, optionsHtml } = this.buildDeckSelectOptions(
      decks,
      preferredFolderKey,
    );
    const opp = players.find((p) => p.seat !== mySeat);
    const isHost = this.isOnlineRoomHost(room);
    const bothConnected = players.length >= 2 && players.every((p) => p.connected);
    const canStart =
      isHost &&
      bothConnected &&
      players.every((p) => p.deckId && p.ready) &&
      room.status === 'waiting';
    const startBlockHint = this.explainOnlineStartBlock({
      isHost,
      bothConnected,
      players,
      room,
      canStart,
    });

    const playerRows = (room.players || [])
      .map((p) => {
        const deckLabel = p.deckId ? (getDeckById(p.deckId)?.name || p.deckId) : '—';
        return `<li class="online-player ${p.connected ? 'connected' : 'away'}">
          <span class="online-player-name">${this.escapeHtml(p.name)}${p.seat === 0 ? ' (hôte)' : ''}</span>
          <span class="online-player-deck">${this.escapeHtml(deckLabel)}</span>
          <span class="online-player-ready">${p.ready ? 'Prêt' : 'En attente'}</span>
        </li>`;
      })
      .join('');

    this.host.innerHTML = `
      <div class="menu-screen menu-online-lobby">
        <div class="menu-bar">
          <button type="button" class="btn-back" data-action="leave">← Quitter la salle</button>
        </div>
        <h1 class="menu-title">Salle ${this.escapeHtml(room.code)}</h1>
        <p class="menu-subtitle">Partagez ce code avec votre adversaire</p>
        <div class="online-code-display" aria-label="Code de salle">${this.escapeHtml(room.code)}</div>
        <ul class="online-players">${playerRows}</ul>
        ${empty ? this.renderNoDecksHint() : `
        <div class="online-deck-pick">
          ${this.renderFolderDeckPickerRow({
            folderSelectId: 'online-deck-folder',
            deckSelectId: 'online-deck',
            folderLabel: 'Dossier',
            deckLabel: 'Votre deck',
            folderOptionsHtml,
            deckOptionsHtml: optionsHtml,
          })}
          <label class="online-ready">
            <input type="checkbox" id="online-ready" ${me?.ready ? 'checked' : ''} disabled />
            Prêt
          </label>
        </div>
        <div class="menu-footer-actions">
          ${isHost ? `<button type="button" class="btn-menu primary" data-action="start-game" ${canStart ? '' : 'disabled'}>Lancer la partie</button>${startBlockHint}` : `<p class="online-wait-host">${opp?.connected ? 'En attente de l’hôte…' : 'En attente du 2e joueur…'}</p>`}
        </div>`}
      </div>
    `;

    this.host.querySelector('[data-action="leave"]')?.addEventListener('click', () => {
      void this.onlineClient.leaveRoom().finally(() => this.showMain());
    });

    if (empty) {
      this.bindNoDecksBuilderAction();
      return;
    }

    this.bindFolderDeckCascade({
      folderSelectId: 'online-deck-folder',
      deckSelectId: 'online-deck',
      decks,
      defaultDeckIndex: 0,
      initialFolderKey: preferredFolderKey,
      initialDeckId: me?.deckId || null,
      onDeckChange: (deckId) => this.syncOnlineLobbyDeck(deckId),
      onFolderChange: (deckId) => this.syncOnlineLobbyDeck(deckId),
    });

    const deckSelect = this.host.querySelector('#online-deck');
    const readyBox = this.host.querySelector('#online-ready');
    const selectedDeckId = deckSelect?.value || '';
    const deckConfirmed = Boolean(me?.deckId && me.deckId === selectedDeckId);

    if (readyBox) readyBox.disabled = !deckConfirmed;

    if (selectedDeckId && !me?.deckId && this._onlineDeckSyncId !== selectedDeckId) {
      this._onlineDeckSyncId = selectedDeckId;
      void this.onlineClient.updateSelf({ deckId: selectedDeckId }).finally(() => {
        const synced = this.onlineClient.room?.players?.find((p) => p.seat === mySeat)?.deckId;
        if (synced === selectedDeckId) this._onlineDeckSyncId = null;
      });
    }

    readyBox?.addEventListener('change', () => {
      const deckId = this.host.querySelector('#online-deck')?.value;
      if (!deckId) return;
      const liveMe = this.onlineClient.room?.players?.find((p) => p.seat === mySeat);
      const payload =
        liveMe?.deckId === deckId ? { ready: readyBox.checked } : { deckId, ready: readyBox.checked };
      void this.onlineClient.updateSelf(payload);
    });

    this.host.querySelector('[data-action="start-game"]')?.addEventListener('click', async () => {
      const btn = this.host.querySelector('[data-action="start-game"]');
      if (btn?.disabled) return;
      const reply = await this.onlineClient.startGame();
      if (!reply.ok) {
        window.alert(reply.error || 'Impossible de lancer la partie.');
        return;
      }
      if (reply.start) this.beginOnlineMatch(reply.start);
    });
  }

  renderTestKnightPicker() {
    this.host.innerHTML = `
      <div class="menu-screen menu-test-pick">
        <div class="menu-bar">
          <button type="button" class="btn-back" data-action="back">← Menu principal</button>
        </div>
        <h1 class="menu-title">Test d'attaques</h1>
        <p class="menu-subtitle">Choisissez un chevalier — cibles mannequin (1000 PV, sans attaques)</p>
        <div class="pool-filters" id="test-pool-filters"></div>
        <div class="pool-chevalier-filters" id="test-pool-chevalier-filters" hidden aria-label="Sous-catégories chevaliers"></div>
        <input type="search" class="pool-search" id="test-pool-search" placeholder="Rechercher un chevalier…" value="${this.escapeAttr(this.poolSearch)}" />
        <div class="pool-grid test-knight-grid" id="test-pool-grid"></div>
      </div>
    `;

    this.host.querySelector('[data-action="back"]')?.addEventListener('click', () => this.showMain());

    const filtersEl = this.host.querySelector('#test-pool-filters');
    for (const f of POOL_FILTERS.filter((id) => id === 'all' || id === 'chevalier')) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = poolTypeLabel(f);
      btn.classList.toggle('active', this.poolFilter === f);
      btn.addEventListener('click', () => {
        this.poolFilter = f;
        if (f !== 'all' && f !== 'chevalier') this.poolChevalierFilter = 'all';
        this.renderTestKnightPicker();
      });
      filtersEl?.appendChild(btn);
    }

    const bar = this.host.querySelector('#test-pool-chevalier-filters');
    const showBar = this.poolFilter === 'all' || this.poolFilter === 'chevalier';
    if (bar) {
      bar.hidden = !showBar;
      if (showBar) {
        bar.innerHTML = '';
        const visible = getVisibleChevalierSubFilters();
        if (!visible.some((f) => f.id === this.poolChevalierFilter)) {
          this.poolChevalierFilter = 'all';
        }
        for (const f of visible) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.textContent = f.label;
          btn.classList.toggle('active', this.poolChevalierFilter === f.id);
          btn.addEventListener('click', () => {
            this.poolChevalierFilter = f.id;
            this.renderTestKnightGrid();
            for (const sibling of bar.querySelectorAll('button')) {
              sibling.classList.toggle('active', sibling === btn);
            }
          });
          bar.appendChild(btn);
        }
      }
    }

    const searchEl = this.host.querySelector('#test-pool-search');
    searchEl?.addEventListener('input', () => {
      this.poolSearch = searchEl.value;
      this.renderTestKnightGrid();
    });

    this.renderTestKnightGrid();
  }

  renderTestKnightGrid() {
    const grid = this.host.querySelector('#test-pool-grid');
    if (!grid) return;
    const q = (this.poolSearch || '').trim().toLowerCase();
    const applyChevalierSub =
      (this.poolFilter === 'all' || this.poolFilter === 'chevalier') && this.poolChevalierFilter !== 'all';
    const cards = getAttackTestKnights().filter((c) => {
      if (this.poolFilter !== 'all' && !poolFilterType(c, this.poolFilter)) return false;
      if (applyChevalierSub && !poolChevalierSubFilter(c, this.poolChevalierFilter)) return false;
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q);
    });

    grid.innerHTML = '';
    if (cards.length === 0) {
      grid.innerHTML = '<p class="menu-empty-hint">Aucun chevalier avec attaques ne correspond à ce filtre.</p>';
      return;
    }

    for (const card of cards) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'pool-card test-knight-card';
      const thumbSlot = document.createElement('div');
      thumbSlot.className = 'pool-card-thumb';
      thumbSlot.appendChild(createBuilderThumb(card.id, { eager: false }));
      el.appendChild(thumbSlot);

      const body = document.createElement('div');
      body.className = 'pool-card-body';
      const atkCount = card.attacks?.length ?? 0;
      body.innerHTML = `
        <span class="pool-card-name">${this.escapeHtml(card.name)}</span>
        <span class="pool-card-type">${this.escapeHtml(card.type || card.cardType)} · ${atkCount} attaque${atkCount !== 1 ? 's' : ''}${rewardLabel(card)}</span>
      `;
      el.appendChild(body);
      el.addEventListener('click', () => this.onStartAttackTest(card.id));
      grid.appendChild(el);
    }
  }

  renderStatsDetailSection(title, rowsHtml) {
    if (!rowsHtml) return '';
    return `
      <section class="deck-stats-section">
        <h3 class="deck-stats-section-title">${this.escapeHtml(title)}</h3>
        ${rowsHtml}
      </section>`;
  }

  renderStats() {
    const rows = getDeckStatRows((id) => getDeckById(id));
    const listHtml =
      rows.length === 0
        ? '<p class="menu-empty-hint">Aucune statistique pour l\'instant. Jouez une partie pour commencer le suivi.</p>'
        : `<ul class="deck-stats-list" aria-label="Statistiques par deck">
            ${rows
              .map((row) => {
                const removedHint = row.removed
                  ? ' <span class="deck-stats-removed">(deck supprimé)</span>'
                  : '';
                const drawsLine =
                  row.draws > 0 ? ` · ${row.draws} nulles` : '';
                const offensiveKnightRankLabels = [
                  'Chevalier le plus offensif (1er)',
                  '2e chevalier offensif',
                  '3e chevalier offensif',
                  '4e chevalier offensif',
                ];
                const topKnightsLines = (row.topKnights || [])
                  .map((knight, i) => {
                    const label =
                      offensiveKnightRankLabels[i] ||
                      `${i + 1}e chevalier offensif`;
                    return `<li><span class="deck-stats-label">${this.escapeHtml(label)}</span><span class="deck-stats-value">${this.escapeHtml(knight.name)} — ${formatStatNumber(knight.totalDamage)} dégâts totaux · ${formatStatDecimal(knight.avgPerGame)} dégât moyen / partie</span></li>`;
                  })
                  .join('');
                const vsDeckHtml =
                  row.vsDeckRows.length > 0
                    ? `<ul class="deck-stats-sublist">
                        ${row.vsDeckRows
                          .map((v) => {
                            const rem = v.removed
                              ? ' <span class="deck-stats-removed">(supprimé)</span>'
                              : '';
                            return `<li><span class="deck-stats-label">vs ${this.escapeHtml(v.opponentName)}${rem}</span><span class="deck-stats-value">${formatWinPercent(v.winPercent)} <span class="deck-stats-sub">(${v.wins}V · ${v.losses}D${v.draws ? ` · ${v.draws}N` : ''})</span></span></li>`;
                          })
                          .join('')}
                      </ul>`
                    : '<p class="deck-stats-empty">Aucun affrontement enregistré contre un autre deck.</p>';
                const vsAiHtml =
                  row.vsAiRows.length > 0
                    ? `<ul class="deck-stats-sublist">
                        ${row.vsAiRows
                          .map(
                            (v) =>
                              `<li><span class="deck-stats-label">IA ${this.escapeHtml(v.label)}</span><span class="deck-stats-value">${formatWinPercent(v.winPercent)} <span class="deck-stats-sub">(${v.wins}V · ${v.losses}D)</span></span></li>`,
                          )
                          .join('')}
                      </ul>`
                    : '<p class="deck-stats-empty">Aucune partie solo vs IA enregistrée.</p>';

                return `
            <li class="deck-stats-item">
              <details class="deck-stats-details">
                <summary class="deck-stats-summary">
                  <div class="deck-stats-meta">
                    <span class="deck-stats-name">${this.escapeHtml(row.name)}${removedHint}</span>
                    <span class="deck-stats-detail">
                      ${row.wins} victoire${row.wins !== 1 ? 's' : ''} · ${row.losses} défaite${row.losses !== 1 ? 's' : ''}${drawsLine} · ${row.games} partie${row.games !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <span class="deck-stats-pct" aria-label="Pourcentage de victoires">${formatWinPercent(row.winPercent)}</span>
                </summary>
                <div class="deck-stats-expanded">
                  <ul class="deck-stats-metrics">
                    <li><span class="deck-stats-label">Tours avant votre 1<sup>er</sup> KO adverse</span><span class="deck-stats-value">${formatStatDecimal(row.avgTurnsFirstKoDealt)}</span></li>
                    <li><span class="deck-stats-label">Tours avant votre 1<sup>er</sup> KO subi</span><span class="deck-stats-value">${formatStatDecimal(row.avgTurnsFirstKoReceived)}</span></li>
                    <li><span class="deck-stats-label">Dégâts totaux infligés (toutes sources)</span><span class="deck-stats-value">${formatStatNumber(row.damageDealt)}</span></li>
                    <li><span class="deck-stats-label">Dégâts totaux reçus</span><span class="deck-stats-value">${formatStatNumber(row.damageReceived)}</span></li>
                    <li><span class="deck-stats-label">Dégât moyen par tour attaquant</span><span class="deck-stats-value">${formatStatDecimal(row.avgDamageDealtPerTurn)}</span></li>
                    <li><span class="deck-stats-label">Dégât moyen par tour défenseur</span><span class="deck-stats-value">${formatStatDecimal(row.avgDamageReceivedPerTurn)}</span></li>
                    ${topKnightsLines}
                  </ul>
                  ${this.renderStatsDetailSection('Face à chaque deck adverse', vsDeckHtml)}
                  ${this.renderStatsDetailSection('Face à chaque niveau d\'IA', vsAiHtml)}
                </div>
              </details>
            </li>`;
              })
              .join('')}
          </ul>`;

    this.host.innerHTML = `
      <div class="menu-screen menu-stats">
        <div class="menu-bar">
          <button type="button" class="btn-back" data-action="back">← Menu principal</button>
        </div>
        <h1 class="menu-title">Statistiques</h1>
        <p class="menu-subtitle">Résultats par deck — développez une ligne pour le détail (solo vs IA et 2 joueurs)</p>
        <p class="menu-stats-legend">Moyennes KO : tours avant le 1<sup>er</sup> KO que vous infligez / subissez. Dégâts / tour : infligés ÷ vos tours attaquant, reçus ÷ vos tours défenseur.</p>
        <div class="deck-stats-scroll">${listHtml}</div>
        ${this.renderCombat1000HistorySection()}
        <div class="menu-footer-actions menu-stats-footer">
          <button type="button" class="btn-menu btn-menu-danger" data-action="reset-stats">Réinitialiser les stats decks</button>
        </div>
      </div>
    `;

    this.host.querySelector('[data-action="back"]')?.addEventListener('click', () => this.showMain());
    this.host.querySelector('[data-action="reset-combat-1000-history"]')?.addEventListener('click', () => {
      const ok = window.confirm('Effacer tout l\'historique des Combats des 1000 Jours ?');
      if (!ok) return;
      clearCombat1000History();
      this.renderStats();
    });
    this.host.querySelector('[data-action="reset-stats"]')?.addEventListener('click', () => {
      const ok = window.confirm(
        'Réinitialiser toutes les statistiques ? Cette action est irréversible.',
      );
      if (!ok) return;
      clearAllDeckStats();
      this.renderStats();
    });
  }

  encodeFolderNavKey(folderId) {
    return folderId ?? '';
  }

  decodeFolderNavKey(key) {
    return key === '' ? null : key;
  }

  isAllFoldersNavKey(key) {
    return key === ALL_FOLDERS_NAV_KEY;
  }

  getDecksForFolderNavKey(folderKey, decks = loadSavedDecks()) {
    if (this.isAllFoldersNavKey(folderKey)) return decks;
    return this.findDeckFolderGroup(folderKey, decks)?.decks || [];
  }

  getDeckFolderGroupsForNav(decks = loadSavedDecks()) {
    return groupDecksByFolder(decks).filter((group) => group.decks.length > 0 || group.folderId);
  }

  findDeckFolderGroup(folderKey, decks = loadSavedDecks()) {
    const decoded = this.decodeFolderNavKey(folderKey);
    return this.getDeckFolderGroupsForNav(decks).find((group) =>
      decoded ? group.folderId === decoded : !group.folderId,
    );
  }

  /** Dossier contenant un deck (pour restaurer le sélecteur lobby en ligne). */
  getFolderNavKeyForDeckId(decks, deckId) {
    if (!deckId) return null;
    const deck = decks.find((d) => d.id === deckId);
    if (!deck) return ALL_FOLDERS_NAV_KEY;
    return this.encodeFolderNavKey(deck.folderId ?? null);
  }

  renderDeckFolderNavList(groups, pickAttr = 'data-pick-folder', { showAllOption = false, allDeckCount = 0 } = {}) {
    const visible = groups.filter((group) => group.decks.length > 0 || group.folderId);
    const allItem =
      showAllOption && allDeckCount > 0
        ? `
          <li class="deck-folder-nav-item">
            <button type="button" class="deck-folder-nav-btn" ${pickAttr}="${this.escapeAttr(ALL_FOLDERS_NAV_KEY)}">
              <span class="deck-folder-nav-main">
                <span class="saved-deck-name">${this.escapeHtml(ALL_FOLDERS_LABEL)}</span>
                <span class="saved-deck-count">${allDeckCount} deck${allDeckCount !== 1 ? 's' : ''}</span>
              </span>
              <span class="deck-folder-nav-chevron" aria-hidden="true">›</span>
            </button>
          </li>`
        : '';
    if (!visible.length && !allItem) {
      return '<p class="menu-empty-hint">Aucun dossier disponible.</p>';
    }
    return `<ul class="saved-deck-list deck-folder-nav-list">${allItem}${visible
      .map((group) => {
        const key = this.encodeFolderNavKey(group.folderId);
        const countLabel = `${group.decks.length} deck${group.decks.length !== 1 ? 's' : ''}`;
        const folderActions =
          group.folderId
            ? `<div class="deck-folder-actions">
                <button type="button" class="btn-folder-action" data-rename-folder="${this.escapeAttr(group.folderId)}" aria-label="Renommer ${this.escapeAttr(group.name)}">Renommer</button>
                <button type="button" class="btn-folder-action btn-folder-action-danger" data-delete-folder="${this.escapeAttr(group.folderId)}" aria-label="Supprimer ${this.escapeAttr(group.name)}">Supprimer</button>
              </div>`
            : '';
        return `
          <li class="deck-folder-nav-item">
            <button type="button" class="deck-folder-nav-btn" ${pickAttr}="${this.escapeAttr(key)}">
              <span class="deck-folder-nav-main">
                <span class="saved-deck-name">${this.escapeHtml(group.name)}</span>
                <span class="saved-deck-count">${countLabel}</span>
              </span>
              <span class="deck-folder-nav-chevron" aria-hidden="true">›</span>
            </button>
            ${folderActions}
          </li>`;
      })
      .join('')}</ul>`;
  }

  bindDeckFolderToolbarActions({ onRefresh, pickAttr = 'data-pick-folder', onPickFolder }) {
    this.host.querySelector('[data-action="new-folder"]')?.addEventListener('click', () => {
      const name = window.prompt('Nom du nouveau dossier :');
      if (name == null) return;
      const created = createDeckFolder(name);
      if (created.error) {
        window.alert(created.error);
        return;
      }
      onRefresh();
    });
    for (const btn of this.host.querySelectorAll('[data-rename-folder]')) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const folderId = btn.getAttribute('data-rename-folder');
        const folder = loadDeckFolders().find((f) => f.id === folderId);
        if (!folder) return;
        const name = window.prompt('Nouveau nom du dossier :', folder.name);
        if (name == null) return;
        const renamed = renameDeckFolder(folderId, name);
        if (renamed.error) {
          window.alert(renamed.error);
          return;
        }
        onRefresh();
      });
    }
    for (const btn of this.host.querySelectorAll('[data-delete-folder]')) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const folderId = btn.getAttribute('data-delete-folder');
        const folder = loadDeckFolders().find((f) => f.id === folderId);
        if (!folder) return;
        const ok = window.confirm(
          `Supprimer le dossier « ${folder.name} » ? Les decks qu'il contient seront déplacés vers « ${UNFILED_FOLDER_LABEL} ».`,
        );
        if (!ok) return;
        deleteDeckFolder(folderId);
        onRefresh();
      });
    }
    if (onPickFolder) {
      for (const btn of this.host.querySelectorAll(`[${pickAttr}]`)) {
        btn.addEventListener('click', () => {
          onPickFolder(btn.getAttribute(pickAttr) ?? '');
        });
      }
    }
  }

  bindSavedDeckRowActions({ onRefresh, onEdit, onDeleteConfirm }) {
    for (const select of this.host.querySelectorAll('.deck-folder-move')) {
      select.addEventListener('change', () => {
        const deckId = select.getAttribute('data-deck-id');
        const folderId = select.value || '';
        const moved = moveDeckToFolder(deckId, folderId);
        if (moved.error) {
          window.alert(moved.error);
          onRefresh();
          return;
        }
        onRefresh();
      });
    }
    for (const btn of this.host.querySelectorAll('[data-edit-id]')) {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-edit-id');
        const deck = loadSavedDecks().find((d) => d.id === id);
        if (deck) onEdit(deck);
      });
    }
    for (const btn of this.host.querySelectorAll('[data-delete-deck]')) {
      btn.addEventListener('click', () => {
        const deckId = btn.getAttribute('data-delete-deck');
        const deck = loadSavedDecks().find((d) => d.id === deckId);
        if (!deck) return;
        const ok = window.confirm(
          onDeleteConfirm?.(deck) ??
            `Supprimer le deck « ${deck.name} » ? Cette action est irréversible.`,
        );
        if (!ok) return;
        deleteDeck(deckId);
        onRefresh();
      });
    }
  }

  buildDeckFolderOptions(selectedId = '') {
    const folders = loadDeckFolders();
    const opts = [
      `<option value="">${this.escapeHtml(UNFILED_FOLDER_LABEL)}</option>`,
      ...folders.map(
        (folder) =>
          `<option value="${this.escapeAttr(folder.id)}"${selectedId === folder.id ? ' selected' : ''}>${this.escapeHtml(folder.name)}</option>`,
      ),
    ];
    return opts.join('');
  }

  renderSavedDeckRow(deck, { showMove = true, showEdit = true, showDelete = false, pickButton = null } = {}) {
    const actions = [];
    if (pickButton) {
      actions.push(
        `<button type="button" class="btn-edit-deck" data-pick-deck="${this.escapeAttr(pickButton)}">Choisir</button>`,
      );
    }
    if (showEdit) {
      actions.push(
        `<button type="button" class="btn-edit-deck" data-edit-id="${this.escapeAttr(deck.id)}">Modifier</button>`,
      );
    }
    if (showDelete) {
      actions.push(
        `<button type="button" class="btn-delete-deck" data-delete-deck="${this.escapeAttr(deck.id)}">Supprimer</button>`,
      );
    }
    const moveHtml = showMove
      ? `<label class="deck-folder-move-label">
          <span class="visually-hidden">Dossier pour ${this.escapeHtml(deck.name)}</span>
          <select class="deck-folder-move" data-deck-id="${this.escapeAttr(deck.id)}" aria-label="Dossier du deck ${this.escapeAttr(deck.name)}">
            ${this.buildDeckFolderOptions(deck.folderId || '')}
          </select>
        </label>`
      : '';
    return `
      <li>
        <div class="saved-deck-meta">
          <span class="saved-deck-name">${this.escapeHtml(deck.name)}</span>
          <span class="saved-deck-count">${countDeckCards(deck.cards)} / ${TARGET_DECK_SIZE} cartes</span>
        </div>
        ${moveHtml}
        ${actions.length ? `<div class="saved-deck-actions">${actions.join('')}</div>` : ''}
      </li>`;
  }

  renderEditPicker() {
    const saved = loadSavedDecks();
    const groups = this.getDeckFolderGroupsForNav(saved);
    const inFolderView = this.editPickFolderId !== null;
    const currentGroup = inFolderView ? this.findDeckFolderGroup(this.editPickFolderId, saved) : null;

    let bodyHtml;
    if (saved.length === 0) {
      bodyHtml = '<p class="menu-empty-hint">Aucun deck enregistré. Créez-en un depuis le menu principal.</p>';
    } else if (!inFolderView) {
      bodyHtml = `
        <p class="menu-subtitle deck-folder-nav-hint">Choisissez un dossier pour voir ses decks</p>
        ${this.renderDeckFolderNavList(groups)}`;
    } else if (!currentGroup) {
      bodyHtml = '<p class="menu-empty-hint">Dossier introuvable.</p>';
    } else {
      bodyHtml = `
        <h2 class="deck-folder-title deck-folder-open-title">${this.escapeHtml(currentGroup.name)}</h2>
        ${
          currentGroup.decks.length
            ? `<ul class="saved-deck-list">${currentGroup.decks.map((deck) => this.renderSavedDeckRow(deck, { showDelete: true })).join('')}</ul>`
            : '<p class="deck-folder-empty">Aucun deck dans ce dossier.</p>'
        }`;
    }

    this.host.innerHTML = `
      <div class="menu-screen menu-edit-pick">
        <div class="menu-bar">
          ${
            inFolderView
              ? '<button type="button" class="btn-back" data-action="back-folders">← Dossiers</button>'
              : '<button type="button" class="btn-back" data-action="back">← Menu principal</button>'
          }
        </div>
        <h1 class="menu-title">Modifier un deck</h1>
        ${
          inFolderView
            ? '<p class="menu-subtitle">Modifiez, déplacez ou supprimez un deck</p>'
            : '<p class="menu-subtitle">Parcourez vos dossiers de decks</p>'
        }
        <div class="deck-folder-toolbar">
          <button type="button" class="btn-menu" data-action="new-folder">Nouveau dossier</button>
        </div>
        ${bodyHtml}
        <div class="menu-footer-actions">
          <button type="button" class="btn-menu" data-action="builder">Créer un nouveau deck</button>
        </div>
      </div>
    `;

    this.host.querySelector('[data-action="back"]')?.addEventListener('click', () => this.showMain());
    this.host.querySelector('[data-action="back-folders"]')?.addEventListener('click', () => {
      this.editPickFolderId = null;
      this.renderEditPicker();
    });
    this.host.querySelector('[data-action="builder"]')?.addEventListener('click', () => this.showBuilder());

    this.bindDeckFolderToolbarActions({
      onRefresh: () => this.renderEditPicker(),
      onPickFolder: !inFolderView
        ? (folderKey) => {
            this.editPickFolderId = folderKey;
            this.renderEditPicker();
          }
        : null,
    });

    if (inFolderView && currentGroup) {
      this.bindSavedDeckRowActions({
        onRefresh: () => this.renderEditPicker(),
        onEdit: (deck) => this.showBuilder(deck),
      });
    }
  }

  renderBuilder() {
    const total = countDeckCards(this.builderCards);
    const validation = validateDeck(this.builderCards);
    const statsClass =
      validation.errors.length > 0 ? 'err' : validation.warnings.length > 0 ? 'warn' : total === TARGET_DECK_SIZE ? 'ok' : 'warn';

    this.host.innerHTML = `
      <div class="menu-screen menu-builder">
        <div class="menu-bar">
          <button type="button" class="btn-back" data-action="back">← Menu principal</button>
        </div>
        <h1 class="menu-title">${this.builderEditingId ? 'Modifier le deck' : 'Constructeur de deck'}</h1>
        <div class="deck-form-row">
          <label for="deck-name">Nom du deck</label>
          <input type="text" id="deck-name" maxlength="48" placeholder="Mon deck" value="${this.escapeAttr(this.builderName)}" />
        </div>
        <div class="deck-form-row">
          <label for="deck-folder">Dossier</label>
          <select id="deck-folder">${this.buildDeckFolderOptions(this.builderFolderId)}</select>
        </div>
        <div id="builder-msg"></div>
        <div class="deck-builder-layout">
          <section class="pool-panel" aria-label="Réserve de cartes">
            <h3>Cartes disponibles</h3>
            <div class="pool-filters" id="pool-filters"></div>
            <div class="pool-chevalier-filters" id="pool-chevalier-filters" hidden aria-label="Sous-catégories chevaliers"></div>
            <input type="search" class="pool-search" id="pool-search" placeholder="Rechercher une carte…" value="${this.escapeAttr(this.poolSearch)}" />
            <div class="pool-grid" id="pool-grid"></div>
          </section>
          <section class="deck-panel" aria-label="Votre deck">
            <h3>Votre deck</h3>
            <ul class="deck-list" id="deck-list"></ul>
            <div class="deck-stats ${statsClass}" id="deck-stats">
              <strong>${total}</strong> / ${TARGET_DECK_SIZE} cartes (${DECK_LIMIT_HINT})
              ${validation.warnings.length ? `<br>${validation.warnings.join(' · ')}` : ''}
            </div>
            <div class="menu-footer-actions">
              <button type="button" class="btn-menu" data-action="edit-pick">Modifier un autre deck</button>
              <button type="button" class="btn-menu primary" data-action="save">${this.builderEditingId ? 'Mettre à jour' : 'Enregistrer le deck'}</button>
            </div>
          </section>
        </div>
        <div id="builder-card-preview" class="builder-card-preview hidden" role="dialog" aria-modal="true" aria-labelledby="builder-preview-name">
          <button type="button" class="builder-preview-backdrop" aria-label="Fermer l'aperçu"></button>
          <div class="builder-preview-panel">
            <button type="button" class="builder-preview-close" aria-label="Fermer">×</button>
            <div class="builder-preview-scroll" id="builder-preview-content"></div>
          </div>
        </div>
      </div>
    `;

    this.host.querySelector('#deck-name')?.addEventListener('input', (e) => {
      this.builderName = e.target.value;
    });
    this.host.querySelector('#deck-folder')?.addEventListener('change', (e) => {
      this.builderFolderId = e.target.value;
    });

    this.host.querySelector('[data-action="back"]')?.addEventListener('click', () => this.showMain());
    this.host.querySelector('[data-action="edit-pick"]')?.addEventListener('click', () => this.showEditPicker());
    this.host.querySelector('[data-action="save"]')?.addEventListener('click', () => this.saveBuilderDeck());

    const filtersEl = this.host.querySelector('#pool-filters');
    for (const f of POOL_FILTERS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = poolTypeLabel(f);
      btn.classList.toggle('active', this.poolFilter === f);
      btn.addEventListener('click', () => {
        const nameEl = this.host.querySelector('#deck-name');
        if (nameEl) this.builderName = nameEl.value;
        this.poolFilter = f;
        if (f !== 'all' && f !== 'chevalier') this.poolChevalierFilter = 'all';
        this.renderBuilder();
      });
      filtersEl?.appendChild(btn);
    }

    this.renderChevalierSubFilters();

    const searchEl = this.host.querySelector('#pool-search');
    searchEl?.addEventListener('input', () => {
      this.poolSearch = searchEl.value;
      this.renderPoolGrid();
    });

    this.renderPoolGrid();
    this.renderDeckList();
    this.bindBuilderPreviewControls();
    if (this.builderPreviewCardId) {
      this.showBuilderCardPreview(this.builderPreviewCardId);
    }
  }

  renderChevalierSubFilters() {
    const bar = this.host.querySelector('#pool-chevalier-filters');
    if (!bar) return;

    const showBar = this.poolFilter === 'all' || this.poolFilter === 'chevalier';
    bar.hidden = !showBar;
    if (!showBar) return;

    const visible = getVisibleChevalierSubFilters();
    if (!visible.some((f) => f.id === this.poolChevalierFilter)) {
      this.poolChevalierFilter = 'all';
    }

    bar.innerHTML = '';
    for (const f of visible) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = f.label;
      btn.dataset.chevalierFilter = f.id;
      btn.classList.toggle('active', this.poolChevalierFilter === f.id);
      btn.addEventListener('click', () => {
        const nameEl = this.host.querySelector('#deck-name');
        if (nameEl) this.builderName = nameEl.value;
        this.poolChevalierFilter = f.id;
        for (const sibling of bar.querySelectorAll('button')) {
          sibling.classList.toggle('active', sibling === btn);
        }
        this.renderPoolGrid();
      });
      bar.appendChild(btn);
    }
  }

  renderPoolGrid() {
    const grid = this.host.querySelector('#pool-grid');
    if (!grid) return;
    const q = (this.poolSearch || '').trim().toLowerCase();
    const applyChevalierSub =
      (this.poolFilter === 'all' || this.poolFilter === 'chevalier') && this.poolChevalierFilter !== 'all';
    const cards = getPoolCards().filter((c) => {
      if (!poolFilterType(c, this.poolFilter)) return false;
      if (applyChevalierSub && !poolChevalierSubFilter(c, this.poolChevalierFilter)) return false;
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q);
    });

    grid.innerHTML = '';
    for (const card of cards) {
      const inDeck = this.getCardCount(card.id);
      const max = maxCopiesForCard(card.id);
      const atMax = inDeck >= max;
      const limitLabel = isDeckEnergyCard(card.id) ? `${inDeck}/∞` : `${inDeck}/${MAX_COPIES_PER_CARD}`;
      const el = document.createElement('div');
      el.className = 'pool-card';
      const thumbSlot = document.createElement('div');
      thumbSlot.className = 'pool-card-thumb';
      thumbSlot.appendChild(createBuilderThumb(card.id, { eager: false, onPreview: (id) => this.toggleBuilderCardPreview(id) }));
      el.appendChild(thumbSlot);

      const body = document.createElement('div');
      body.className = 'pool-card-body';
      body.innerHTML = `
        <span class="pool-card-name">${this.escapeHtml(card.name)}</span>
        <span class="pool-card-type">${this.escapeHtml(card.type || card.cardType)}${rewardLabel(card)}</span>
        <div class="pool-card-actions">
          <span>${limitLabel}</span>
          <button type="button" class="btn-add"${atMax ? ' disabled' : ''}>+</button>
        </div>
      `;
      el.appendChild(body);
      body.querySelector('.btn-add')?.addEventListener('click', () => {
        this.addCardToBuilder(card.id);
      });
      grid.appendChild(el);
    }
    this.syncBuilderPreviewHighlight();
  }

  renderDeckList() {
    const list = this.host.querySelector('#deck-list');
    if (!list) return;
    const sorted = [...this.builderCards].sort((a, b) => {
      const na = getCardDef(a.id)?.name || a.id;
      const nb = getCardDef(b.id)?.name || b.id;
      return na.localeCompare(nb, 'fr');
    });

    list.innerHTML = '';
    if (sorted.length === 0) {
      list.innerHTML = '<li style="color:var(--text-dim)">Aucune carte — ajoutez depuis la réserve.</li>';
      return;
    }

    for (const entry of sorted) {
      const def = getCardDef(entry.id);
      const li = document.createElement('li');
      const main = document.createElement('div');
      main.className = 'deck-entry-main';
      main.appendChild(createBuilderThumb(entry.id, { eager: true, onPreview: (id) => this.toggleBuilderCardPreview(id) }));
      const nameSpan = document.createElement('span');
      nameSpan.className = 'deck-entry-name';
      nameSpan.textContent = def?.name || entry.id;
      main.appendChild(nameSpan);
      li.appendChild(main);

      const countWrap = document.createElement('span');
      countWrap.className = 'deck-count';
      countWrap.innerHTML = `
        <button type="button" aria-label="Retirer">−</button>
        <span>${entry.count}</span>
        <button type="button" aria-label="Ajouter">+</button>
      `;
      li.appendChild(countWrap);

      const [btnMinus, btnPlus] = countWrap.querySelectorAll('button');
      btnMinus?.addEventListener('click', () => this.changeCardCount(entry.id, -1));
      btnPlus?.addEventListener('click', () => this.changeCardCount(entry.id, 1));
      list.appendChild(li);
    }

    const stats = this.host.querySelector('#deck-stats');
    if (stats) {
      const total = countDeckCards(this.builderCards);
      const validation = validateDeck(this.builderCards);
      stats.className = `deck-stats ${
        validation.errors.length ? 'err' : validation.warnings.length ? 'warn' : total === TARGET_DECK_SIZE ? 'ok' : 'warn'
      }`;
      stats.innerHTML = `
        <strong>${total}</strong> / ${TARGET_DECK_SIZE} cartes (${DECK_LIMIT_HINT})
        ${validation.warnings.length ? `<br>${validation.warnings.join(' · ')}` : ''}
      `;
    }
    this.syncBuilderPreviewHighlight();
  }

  syncBuilderPreviewHighlight() {
    if (!this.builderPreviewCardId) return;
    for (const thumb of this.host.querySelectorAll('.builder-thumb')) {
      thumb.classList.toggle('preview-active', thumb.dataset.cardId === this.builderPreviewCardId);
    }
  }

  getCardCount(cardId) {
    return this.builderCards.find((c) => c.id === cardId)?.count || 0;
  }

  toggleBuilderCardPreview(cardId) {
    if (this.builderPreviewCardId === cardId) {
      this.hideBuilderCardPreview();
      return;
    }
    this.showBuilderCardPreview(cardId);
  }

  showBuilderCardPreview(cardId) {
    const overlay = this.host.querySelector('#builder-card-preview');
    const contentEl = this.host.querySelector('#builder-preview-content');
    if (!overlay || !contentEl) return;

    this.builderPreviewCardId = cardId;
    contentEl.innerHTML = buildBuilderPreviewHtml(cardId);
    syncCardImage(contentEl);
    overlay.classList.remove('hidden');
    for (const thumb of this.host.querySelectorAll('.builder-thumb')) {
      thumb.classList.toggle('preview-active', thumb.dataset.cardId === cardId);
    }
  }

  hideBuilderCardPreview() {
    const overlay = this.host.querySelector('#builder-card-preview');
    overlay?.classList.add('hidden');
    this.builderPreviewCardId = null;
    for (const thumb of this.host.querySelectorAll('.builder-thumb.preview-active')) {
      thumb.classList.remove('preview-active');
    }
  }

  bindBuilderPreviewControls() {
    const overlay = this.host.querySelector('#builder-card-preview');
    if (!overlay) return;

    overlay.querySelector('.builder-preview-backdrop')?.addEventListener('click', () => {
      this.hideBuilderCardPreview();
    });
    overlay.querySelector('.builder-preview-close')?.addEventListener('click', () => {
      this.hideBuilderCardPreview();
    });

    if (this._builderPreviewKeyHandler) {
      document.removeEventListener('keydown', this._builderPreviewKeyHandler);
    }
    this._builderPreviewKeyHandler = (e) => {
      if (e.key === 'Escape' && this.builderPreviewCardId) {
        this.hideBuilderCardPreview();
      }
    };
    document.addEventListener('keydown', this._builderPreviewKeyHandler);
  }

  showBuilderLimitMessage(cardId) {
    const name = getCardDef(cardId)?.name || cardId;
    const msgEl = this.host.querySelector('#builder-msg');
    if (msgEl) {
      msgEl.className = 'menu-msg error';
      msgEl.textContent = `Limite atteinte : max ${MAX_COPIES_PER_CARD} exemplaires de « ${name} » (les énergies sont illimitées).`;
    }
  }

  addCardToBuilder(cardId) {
    const max = maxCopiesForCard(cardId);
    const existing = this.builderCards.find((c) => c.id === cardId);
    if (existing) {
      if (existing.count >= max) {
        if (!isDeckEnergyCard(cardId)) this.showBuilderLimitMessage(cardId);
        return;
      }
      existing.count += 1;
    } else {
      this.builderCards.push({ id: cardId, count: 1 });
    }
    const msgEl = this.host.querySelector('#builder-msg');
    if (msgEl?.classList.contains('error')) {
      msgEl.textContent = '';
      msgEl.className = 'menu-msg';
    }
    this.renderDeckList();
    this.renderPoolGrid();
  }

  changeCardCount(cardId, delta) {
    const max = maxCopiesForCard(cardId);
    const existing = this.builderCards.find((c) => c.id === cardId);
    if (!existing) return;
    if (delta > 0 && existing.count >= max) {
      if (!isDeckEnergyCard(cardId)) this.showBuilderLimitMessage(cardId);
      return;
    }
    existing.count += delta;
    if (existing.count <= 0) {
      this.builderCards = this.builderCards.filter((c) => c.id !== cardId);
    } else if (existing.count > max) {
      existing.count = max;
      if (!isDeckEnergyCard(cardId)) this.showBuilderLimitMessage(cardId);
    }
    this.renderDeckList();
    this.renderPoolGrid();
  }

  saveBuilderDeck() {
    const nameInput = this.host.querySelector('#deck-name');
    const folderInput = this.host.querySelector('#deck-folder');
    const name = (nameInput?.value || '').trim() || 'Sans nom';
    const folderId = folderInput?.value || '';
    const validation = validateDeck(this.builderCards);
    const msgEl = this.host.querySelector('#builder-msg');

    if (!validation.valid) {
      if (msgEl) {
        msgEl.className = 'menu-msg error';
        msgEl.textContent = validation.errors.join(' ');
      }
      return;
    }

    const saved = saveDeck({
      id: this.builderEditingId || undefined,
      name,
      folderId: folderId || undefined,
      cards: this.builderCards.map((c) => ({ ...c })),
    });
    if (saved.error) {
      if (msgEl) {
        msgEl.className = 'menu-msg error';
        msgEl.textContent = saved.error.join(' ');
      }
      return;
    }
    this.builderEditingId = saved.id;
    if (msgEl) {
      msgEl.className = 'menu-msg success';
      msgEl.textContent = `Deck « ${saved.name} » enregistré.`;
    }
    if (validation.warnings.length && msgEl) {
      msgEl.textContent += ` ${validation.warnings.join(' ')}`;
    }
  }

  renderTwelveHousesDifficulty() {
    const difficultyRadios = TWELVE_HOUSES_DIFFICULTIES.map(
      (d) => `
          <label class="mode-option">
            <input type="radio" name="twelve-difficulty" value="${d}"${this.twelveHousesDifficulty === d ? ' checked' : ''} />
            <span><strong>${TWELVE_HOUSES_DIFFICULTY_LABELS[d]}</strong> — ${TWELVE_HOUSES_DIFFICULTY_HINTS[d]}</span>
          </label>`,
    ).join('');

    this.host.innerHTML = `
      <div class="menu-screen menu-twelve-houses-difficulty">
        <div class="menu-bar">
          <button type="button" class="btn-back" data-action="back">← Menu principal</button>
        </div>
        <h1 class="menu-title">Les 12 maisons</h1>
        <p class="menu-subtitle">Choisissez la difficulté de la conquête. Chaque niveau a son propre tableau des légendes.</p>
        <fieldset class="twelve-houses-difficulty-fieldset">
          <legend class="visually-hidden">Difficulté</legend>
          ${difficultyRadios}
        </fieldset>
        <div class="menu-footer-actions">
          <button type="button" class="btn-menu primary" data-action="continue">Choisir un deck</button>
        </div>
        <section class="twelve-houses-legend-preview" aria-label="Tableau des légendes">
          <h2 class="twelve-houses-legend-title">Tableau des légendes</h2>
          ${this.renderTwelveHousesLegendBoard(this.twelveHousesLegendTab)}
        </section>
      </div>
    `;

    this.host.querySelector('[data-action="back"]')?.addEventListener('click', () => this.showMain());
    this.host.querySelector('[data-action="continue"]')?.addEventListener('click', () => {
      const selected = this.host.querySelector('input[name="twelve-difficulty"]:checked')?.value;
      this.twelveHousesDifficulty = normalizeTwelveHousesDifficulty(selected);
      this.twelveHousesLegendTab = this.twelveHousesDifficulty;
      this.twelveHousesMeta = null;
      this.showTwelveHousesPick();
    });
    this.bindTwelveHousesLegendTabs();
  }

  buildDeckSelectOptions(decks, folderKey = null) {
    if (!decks.length) {
      return {
        empty: true,
        optionsHtml: '<option value="">— Aucun deck enregistré —</option>',
        folderOptionsHtml: '',
        defaultFolderKey: '',
      };
    }
    const groups = this.getDeckFolderGroupsForNav(decks).filter((group) => group.decks.length > 0);
    const defaultFolderKey =
      folderKey != null &&
      (this.isAllFoldersNavKey(folderKey) ||
        groups.some((group) => this.encodeFolderNavKey(group.folderId) === folderKey))
        ? folderKey
        : this.encodeFolderNavKey(groups[0]?.folderId);
    const activeFolderKey = folderKey != null ? folderKey : defaultFolderKey;
    const scopedDecks = this.getDecksForFolderNavKey(activeFolderKey, decks);
    const folderOptionsHtml = [
      `<option value="${this.escapeAttr(ALL_FOLDERS_NAV_KEY)}"${activeFolderKey === ALL_FOLDERS_NAV_KEY ? ' selected' : ''}>${this.escapeHtml(ALL_FOLDERS_LABEL)} (${decks.length})</option>`,
      ...groups.map((group) => {
        const key = this.encodeFolderNavKey(group.folderId);
        return `<option value="${this.escapeAttr(key)}"${key === activeFolderKey ? ' selected' : ''}>${this.escapeHtml(group.name)} (${group.decks.length})</option>`;
      }),
    ].join('');
    const optionsHtml = scopedDecks.length
      ? scopedDecks
          .map(
            (d) =>
              `<option value="${this.escapeAttr(d.id)}">${this.escapeHtml(d.name)} (${countDeckCards(d.cards)} cartes)</option>`,
          )
          .join('')
      : '<option value="">— Aucun deck dans ce dossier —</option>';
    return {
      empty: false,
      optionsHtml,
      folderOptionsHtml,
      defaultFolderKey,
    };
  }

  syncOnlineLobbyDeck(deckId) {
    if (!deckId) return;
    this._onlineDeckSyncId = null;
    const readyBox = this.host.querySelector('#online-ready');
    if (readyBox) {
      readyBox.checked = false;
      readyBox.disabled = true;
    }
    void this.onlineClient.updateSelf({ deckId, ready: false });
  }

  bindFolderDeckCascade({
    folderSelectId,
    deckSelectId,
    decks,
    defaultDeckIndex = 0,
    initialFolderKey = null,
    initialDeckId = null,
    onDeckChange = null,
    onFolderChange = null,
  }) {
    const folderSelect = this.host.querySelector(`#${folderSelectId}`);
    const deckSelect = this.host.querySelector(`#${deckSelectId}`);
    if (!folderSelect || !deckSelect) return;

    if (initialFolderKey != null) folderSelect.value = initialFolderKey;

    const pickDeckInSelect = (deckId) => {
      if (!deckId) return false;
      const hasOption = [...deckSelect.options].some((option) => option.value === deckId);
      if (!hasOption) return false;
      deckSelect.value = deckId;
      return true;
    };

    const refreshDecks = (applyDefaultIndex = false) => {
      const folderDecks = this.getDecksForFolderNavKey(folderSelect.value, decks);
      deckSelect.innerHTML = folderDecks.length
        ? folderDecks
            .map(
              (d) =>
                `<option value="${this.escapeAttr(d.id)}">${this.escapeHtml(d.name)} (${countDeckCards(d.cards)} cartes)</option>`,
            )
            .join('')
        : '<option value="">— Aucun deck dans ce dossier —</option>';
      if (pickDeckInSelect(initialDeckId)) return;
      if (applyDefaultIndex && defaultDeckIndex > 0 && deckSelect.options.length > defaultDeckIndex) {
        deckSelect.selectedIndex = defaultDeckIndex;
      }
    };

    folderSelect.addEventListener('change', () => {
      refreshDecks(false);
      onFolderChange?.(deckSelect.value);
    });
    deckSelect.addEventListener('change', () => onDeckChange?.(deckSelect.value));
    refreshDecks(true);
    pickDeckInSelect(initialDeckId);
  }

  renderFolderDeckPickerRow({ folderSelectId, deckSelectId, folderLabel, deckLabel, folderOptionsHtml, deckOptionsHtml }) {
    return `
      <div class="deck-form-row">
        <label for="${this.escapeAttr(folderSelectId)}">${this.escapeHtml(folderLabel)}</label>
        <select id="${this.escapeAttr(folderSelectId)}">${folderOptionsHtml}</select>
      </div>
      <div class="deck-form-row">
        <label for="${this.escapeAttr(deckSelectId)}">${this.escapeHtml(deckLabel)}</label>
        <select id="${this.escapeAttr(deckSelectId)}">${deckOptionsHtml}</select>
      </div>`;
  }

  renderNoDecksHint(actionLabel = 'Créer un deck') {
    return `
      <p class="menu-empty-hint">Aucun deck enregistré. Créez-en un avant de jouer.</p>
      <div class="menu-footer-actions">
        <button type="button" class="btn-menu primary" data-action="builder">${this.escapeHtml(actionLabel)}</button>
      </div>
    `;
  }

  bindNoDecksBuilderAction() {
    this.host.querySelector('[data-action="builder"]')?.addEventListener('click', () => this.showBuilder());
  }

  renderTwelveHousesPick() {
    const decks = getAllDeckOptions();
    const { empty, folderOptionsHtml, optionsHtml } = this.buildDeckSelectOptions(decks);
    const houseCount = this.twelveHousesMeta?.totalHouses ?? (this.twelveHousesDifficulty === 'facile' ? 10 : 12);
    const diffKey = normalizeTwelveHousesDifficulty(
      this.twelveHousesMeta?.modeDifficulty ?? this.twelveHousesDifficulty,
    );
    const diffLabel = TWELVE_HOUSES_DIFFICULTY_LABELS[diffKey] || 'Moyen';
    const aiLabel = AI_DIFFICULTY_LABELS[normalizeAiDifficulty(this.twelveHousesMeta?.aiDifficulty)] || 'Moyen';

    this.host.innerHTML = `
      <div class="menu-screen menu-twelve-houses-pick">
        <div class="menu-bar">
          <button type="button" class="btn-back" data-action="back">← Changer la difficulté</button>
        </div>
        <h1 class="menu-title">Les 12 maisons</h1>
        <p class="menu-subtitle">Affrontez ${houseCount} decks adverses, du plus faible au plus fort. Une défaite met fin à la run.</p>
        <p class="menu-twelve-houses-rules">Difficulté : <strong>${this.escapeHtml(diffLabel)}</strong> · IA : <strong>${this.escapeHtml(aiLabel)}</strong> · Victoires enchaînées = score</p>
        <div id="twelve-houses-pick-msg"></div>
        ${empty ? this.renderNoDecksHint() : `
        <div class="start-decks">
          ${this.renderFolderDeckPickerRow({
            folderSelectId: 'twelve-deck-folder',
            deckSelectId: 'twelve-deck-player',
            folderLabel: 'Dossier',
            deckLabel: 'Votre deck',
            folderOptionsHtml,
            deckOptionsHtml: optionsHtml,
          })}
        </div>
        <div class="menu-footer-actions">
          <button type="button" class="btn-menu primary" data-action="start-run">Commencer la conquête</button>
        </div>`}
        <section class="twelve-houses-legend-preview" aria-label="Tableau des légendes">
          <h2 class="twelve-houses-legend-title">Tableau des légendes</h2>
          ${this.renderTwelveHousesLegendBoard(this.twelveHousesLegendTab)}
        </section>
      </div>
    `;

    this.host.querySelector('[data-action="back"]')?.addEventListener('click', () => this.showTwelveHousesDifficulty());
    if (empty) {
      this.bindNoDecksBuilderAction();
    } else {
      this.bindFolderDeckCascade({
        folderSelectId: 'twelve-deck-folder',
        deckSelectId: 'twelve-deck-player',
        decks,
      });
      this.host.querySelector('[data-action="start-run"]')?.addEventListener('click', () => {
        const playerId = this.host.querySelector('#twelve-deck-player')?.value;
        if (!playerId) return;
        if (!this.twelveHousesMeta?.houses?.length) {
          const msg = this.host.querySelector('#twelve-houses-pick-msg');
          if (msg) {
            msg.className = 'menu-msg error';
            msg.textContent = 'Chargement des maisons en cours… Réessayez dans un instant.';
          }
          return;
        }
        this.showTwelveHousesLadderIntro(playerId);
      });
    }
    this.bindTwelveHousesLegendTabs();

    if (!empty && !this.twelveHousesMeta) {
      prepareTwelveHousesRun(normalizeTwelveHousesDifficulty(this.twelveHousesDifficulty))
        .then((meta) => {
          const expected = normalizeTwelveHousesDifficulty(this.twelveHousesDifficulty);
          if (this.screen !== 'twelve-houses-pick') return;
          if (normalizeTwelveHousesDifficulty(meta.modeDifficulty) !== expected) return;
          this.twelveHousesMeta = meta;
          this.renderTwelveHousesPick();
        })
        .catch((err) => {
          const msg = this.host.querySelector('#twelve-houses-pick-msg');
          if (msg) {
            msg.className = 'menu-msg error';
            msg.textContent = err.message || String(err);
          }
        });
    }
  }

  /**
   * @param {{ houses?: object[], wins?: number, currentIndex?: number, totalHouses?: number, phase?: 'intro' | 'progress' }} [opts]
   */
  renderTwelveHousesLadder(opts = {}) {
    const stored = this.twelveHousesLadderData || {};
    const phase = opts.phase || this.twelveHousesLadderPhase || 'intro';
    const meta = this.twelveHousesMeta;
    const houses = opts.houses || stored.houses || meta?.houses || [];
    const totalHouses = opts.totalHouses ?? stored.totalHouses ?? meta?.totalHouses ?? houses.length;
    const wins = opts.wins ?? stored.wins ?? 0;
    const currentIndex = opts.currentIndex ?? stored.currentIndex ?? 0;
    const diffKey = normalizeTwelveHousesDifficulty(meta?.modeDifficulty ?? this.twelveHousesDifficulty);
    const diffLabel = TWELVE_HOUSES_DIFFICULTY_LABELS[diffKey] || 'Moyen';
    const currentHouse = houses[currentIndex];
    const isIntro = phase === 'intro';

    const statusLabels = {
      defeated: 'Vaincue',
      current: isIntro ? 'Première épreuve' : 'Prochaine épreuve',
      upcoming: 'À venir',
    };

    const ladderItems = houses
      .map((house, index) => {
        const state = getHouseLadderItemState(index, { wins, currentIndex });
        const tierLabel = formatHouseTierLabel(house.houseTier);
        const deckLabel = getHouseDeckDisplayName(house);
        const statusText =
          state === 'defeated' ? '✓' : state === 'current' ? '▶' : `${house.houseNumber ?? index + 1}`;
        return `
          <li class="houses-ladder-item houses-ladder-item--${state}" aria-current="${state === 'current' ? 'step' : 'false'}">
            <span class="houses-ladder-marker" aria-hidden="true">${statusText}</span>
            <div class="houses-ladder-body">
              <span class="houses-ladder-rank">Maison ${house.houseNumber ?? index + 1}</span>
              <strong class="houses-ladder-name">${this.escapeHtml(deckLabel)}</strong>
              ${tierLabel ? `<span class="houses-ladder-tier">${this.escapeHtml(tierLabel)}</span>` : ''}
            </div>
            <span class="houses-ladder-status visually-hidden">${statusLabels[state]}</span>
          </li>`;
      })
      .join('');

    const title = isIntro ? 'Échelle des maisons' : 'Progression de la conquête';
    const subtitle = isIntro
      ? `${totalHouses} épreuves du plus faible au plus fort. Une défaite met fin à la run.`
      : `${wins} maison${wins !== 1 ? 's' : ''} vaincue${wins !== 1 ? 's' : ''} sur ${totalHouses}. Vous grimpez l'échelle.`;

    const currentDeckName = currentHouse ? getHouseDeckDisplayName(currentHouse) : '';
    const actionLabel = isIntro
      ? 'Commencer le premier combat'
      : currentDeckName
        ? `Affronter ${currentDeckName}`
        : 'Continuer';

    this.host.innerHTML = `
      <div class="menu-screen menu-twelve-houses-ladder">
        <div class="menu-bar">
          ${
            isIntro
              ? '<button type="button" class="btn-back" data-action="back">← Choisir un deck</button>'
              : ''
          }
        </div>
        <h1 class="menu-title">${this.escapeHtml(title)}</h1>
        <p class="menu-subtitle">${this.escapeHtml(subtitle)}</p>
        <p class="menu-twelve-houses-rules">Difficulté : <strong>${this.escapeHtml(diffLabel)}</strong> · ${totalHouses} maison${totalHouses !== 1 ? 's' : ''}</p>
        <div class="houses-ladder-actions">
          <button type="button" class="btn-menu primary" data-action="ladder-continue">${this.escapeHtml(actionLabel)}</button>
        </div>
        <ol class="houses-ladder" aria-label="Échelle des ${totalHouses} maisons">
          ${ladderItems}
        </ol>
      </div>
    `;

    if (isIntro) {
      this.host.querySelector('[data-action="back"]')?.addEventListener('click', () => this.showTwelveHousesPick());
    }

    const onLadderContinue = () => {
      if (isIntro) {
        const playerId = this.twelveHousesPlayerDeckId;
        if (!playerId) {
          this.showTwelveHousesPick();
          return;
        }
        if (!meta?.houses?.length) {
          window.alert('Les decks maisons ne sont pas encore chargés. Revenez en arrière et réessayez.');
          return;
        }
        const startRun = window.chevalierStartTwelveHousesRun || this.onStartTwelveHouses.bind(this);
        startRun({
          playerDeckId: playerId,
          difficulty: diffKey,
          prepared: meta,
        });
        return;
      }
      const onContinue = this.twelveHousesLadderOnContinue;
      if (!onContinue) return;
      this.twelveHousesLadderOnContinue = null;
      onContinue();
    };

    this.host.querySelectorAll('[data-action="ladder-continue"]').forEach((btn) => {
      btn.addEventListener('click', onLadderContinue);
    });
  }

  renderTwelveHousesLegendBoard(activeDifficulty) {
    const tab = normalizeTwelveHousesDifficulty(activeDifficulty);
    const entries = loadTwelveHousesLeaderboard(tab);
    const tabs = TWELVE_HOUSES_DIFFICULTIES.map(
      (d) =>
        `<button type="button" class="legend-diff-tab${d === tab ? ' active' : ''}" data-legend-tab="${d}">${TWELVE_HOUSES_DIFFICULTY_LABELS[d]}</button>`,
    ).join('');
    return `
      <div class="legend-diff-tabs" role="tablist" aria-label="Classement par difficulté">${tabs}</div>
      <div class="legend-table-host">${this.renderTwelveHousesLegendTable(entries, tab)}</div>`;
  }

  bindTwelveHousesLegendTabs() {
    this.host.querySelectorAll('[data-legend-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.twelveHousesLegendTab = normalizeTwelveHousesDifficulty(btn.getAttribute('data-legend-tab'));
        const host = this.host.querySelector('.legend-table-host');
        if (host) {
          host.innerHTML = this.renderTwelveHousesLegendTable(
            loadTwelveHousesLeaderboard(this.twelveHousesLegendTab),
            this.twelveHousesLegendTab,
          );
        }
        this.host.querySelectorAll('[data-legend-tab]').forEach((el) => {
          el.classList.toggle('active', el.getAttribute('data-legend-tab') === this.twelveHousesLegendTab);
        });
      });
    });
  }

  renderTwelveHousesLegendTable(entries, difficulty) {
    const diffLabel = TWELVE_HOUSES_DIFFICULTY_LABELS[normalizeTwelveHousesDifficulty(difficulty)] || 'Moyen';
    if (!entries.length) {
      return `<p class="menu-empty-hint">Aucun score enregistré en ${this.escapeHtml(diffLabel.toLowerCase())} pour l'instant.</p>`;
    }
    return `
      <table class="legend-table">
        <thead>
          <tr><th scope="col">#</th><th scope="col">Nom</th><th scope="col">Victoires</th><th scope="col">Deck</th><th scope="col">Date</th></tr>
        </thead>
        <tbody>
          ${entries
            .slice(0, 15)
            .map(
              (e, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>${this.escapeHtml(e.name)}</td>
              <td>${e.score}</td>
              <td>${this.escapeHtml(this.formatLegendDeckLabel(e))}</td>
              <td>${this.escapeHtml(formatLegendDate(e.date))}</td>
            </tr>`,
            )
            .join('')}
        </tbody>
      </table>`;
  }

  formatLegendDeckLabel(entry) {
    if (entry?.deckName) return entry.deckName;
    if (entry?.deckId) {
      const deck = getDeckById(entry.deckId);
      if (deck?.name) return deck.name;
    }
    return '—';
  }

  renderTwelveHousesEnd() {
    const result = this.twelveHousesEndResult || {
      wins: 0,
      totalHouses: 12,
      wonAll: false,
      abandoned: false,
      difficulty: 'normal',
    };
    const diffKey = normalizeTwelveHousesDifficulty(result.difficulty);
    this.twelveHousesLegendTab = diffKey;
    const diffLabel = TWELVE_HOUSES_DIFFICULTY_LABELS[diffKey] || 'Moyen';
    const playerDeck = getDeckById(result.playerDeckId);
    const deckLabel = playerDeck?.name || 'votre deck';
    const headline = result.abandoned
      ? 'Run abandonnée'
      : result.wonAll
        ? 'Conquête complète !'
        : result.wins > 0
          ? 'Run terminée'
          : 'Défaite dès la première maison';
    const summary = result.abandoned
      ? `Vous abandonnez après ${result.wins} victoire${result.wins !== 1 ? 's' : ''} sur ${result.totalHouses} maisons avec « ${deckLabel} ». Enregistrez votre score ci-dessous.`
      : result.wonAll
        ? `Vous avez conquis les ${result.totalHouses} maisons avec « ${deckLabel} ».`
        : `Score : ${result.wins} victoire${result.wins !== 1 ? 's' : ''} sur ${result.totalHouses} maisons avec « ${deckLabel} ».`;

    this.host.innerHTML = `
      <div class="menu-screen menu-twelve-houses-end">
        <div class="menu-bar">
          <button type="button" class="btn-back" data-action="back">← Menu principal</button>
        </div>
        <h1 class="menu-title">${this.escapeHtml(headline)}</h1>
        <p class="menu-subtitle">${this.escapeHtml(summary)}</p>
        <p class="menu-twelve-houses-rules">Classement : <strong>${this.escapeHtml(diffLabel)}</strong></p>
        <div class="deck-form-row">
          <label for="legend-name">Nom pour le tableau des légendes</label>
          <input type="text" id="legend-name" maxlength="24" placeholder="Votre nom" />
        </div>
        <div id="twelve-houses-end-msg"></div>
        <div class="menu-footer-actions">
          <button type="button" class="btn-menu primary" data-action="save-legend">Enregistrer le score (${result.wins})</button>
        </div>
        <section class="twelve-houses-legend-preview" aria-label="Tableau des légendes">
          <h2 class="twelve-houses-legend-title">Tableau des légendes</h2>
          <div id="legend-table-host">${this.renderTwelveHousesLegendBoard(diffKey)}</div>
        </section>
        <div class="menu-footer-actions menu-stats-footer">
          <button type="button" class="btn-menu btn-menu-danger" data-action="reset-legend">Effacer le classement ${this.escapeHtml(diffLabel)}</button>
        </div>
      </div>
    `;

    this.host.querySelector('[data-action="back"]')?.addEventListener('click', () => {
      this.twelveHousesEndResult = null;
      this.showMain();
    });
    this.host.querySelector('[data-action="save-legend"]')?.addEventListener('click', () => {
      const name = this.host.querySelector('#legend-name')?.value?.trim() || 'Anonyme';
      saveTwelveHousesLegend({
        name,
        score: result.wins,
        date: new Date().toISOString(),
        difficulty: diffKey,
        deckId: result.playerDeckId || '',
        deckName: playerDeck?.name || '',
      });
      const msg = this.host.querySelector('#twelve-houses-end-msg');
      if (msg) {
        msg.className = 'menu-msg success';
        msg.textContent = `Score enregistré pour « ${name} » (${result.wins} victoire${result.wins !== 1 ? 's' : ''}, ${diffLabel}, deck « ${deckLabel} »).`;
      }
      const host = this.host.querySelector('#legend-table-host');
      if (host) host.innerHTML = this.renderTwelveHousesLegendBoard(diffKey);
      this.bindTwelveHousesLegendTabs();
    });
    this.host.querySelector('[data-action="reset-legend"]')?.addEventListener('click', () => {
      const ok = window.confirm(`Effacer le classement ${diffLabel} ?`);
      if (!ok) return;
      clearTwelveHousesLeaderboard(diffKey);
      const host = this.host.querySelector('#legend-table-host');
      if (host) host.innerHTML = this.renderTwelveHousesLegendBoard(diffKey);
      this.bindTwelveHousesLegendTabs();
    });
    this.bindTwelveHousesLegendTabs();
  }

  renderCombat1000Config() {
    const decks = getAllDeckOptions();
    const deckCountOptions = Array.from(
      { length: MAX_DECKS_PER_PLAYER - MIN_DECKS_PER_PLAYER + 1 },
      (_, i) => MIN_DECKS_PER_PLAYER + i,
    )
      .map(
        (n) =>
          `<option value="${n}">${n} deck${n !== 1 ? 's' : ''} par joueur (${minDecksRequiredForCombat(n)} decks au total)</option>`,
      )
      .join('');

    this.host.innerHTML = `
      <div class="menu-screen menu-combat-1000-config">
        <div class="menu-bar">
          <button type="button" class="btn-back" data-action="back">← Menu principal</button>
        </div>
        <h1 class="menu-title">Combat des 1000 Jours</h1>
        <p class="menu-subtitle">Série de duels en 2 joueurs — chaque deck ne peut être joué qu'une fois</p>
        <div id="combat-1000-config-msg"></div>
        <div class="start-decks combat-1000-form">
          <div class="deck-form-row">
            <label for="combat-1000-p1">Joueur 1</label>
            <input type="text" id="combat-1000-p1" maxlength="24" placeholder="Nom du joueur 1" value="Joueur 1" />
          </div>
          <div class="deck-form-row">
            <label for="combat-1000-p2">Joueur 2</label>
            <input type="text" id="combat-1000-p2" maxlength="24" placeholder="Nom du joueur 2" value="Joueur 2" />
          </div>
          <div class="deck-form-row">
            <label for="combat-1000-decks">Decks par joueur</label>
            <select id="combat-1000-decks">${deckCountOptions}</select>
          </div>
        </div>
        <p class="menu-combat-1000-rules">Draft en serpent : J1 choisit 1 deck, J2 en choisit 2, puis 2 par tour jusqu'à remplir les rosters. Il faut au moins <strong>${minDecksRequiredForCombat(1)}</strong> decks enregistrés (${decks.length} disponible${decks.length !== 1 ? 's' : ''}).</p>
        <div class="menu-footer-actions">
          <button type="button" class="btn-menu primary" data-action="start-draft"${decks.length < minDecksRequiredForCombat(1) ? ' disabled' : ''}>Commencer le draft</button>
        </div>
        ${decks.length < minDecksRequiredForCombat(1) ? this.renderNoDecksHint('Créer des decks') : ''}
      </div>
    `;

    this.host.querySelector('[data-action="back"]')?.addEventListener('click', () => this.showMain());
    if (decks.length < minDecksRequiredForCombat(1)) {
      this.bindNoDecksBuilderAction();
    } else {
      this.host.querySelector('[data-action="start-draft"]')?.addEventListener('click', () => {
        const p1 = this.host.querySelector('#combat-1000-p1')?.value?.trim() || 'Joueur 1';
        const p2 = this.host.querySelector('#combat-1000-p2')?.value?.trim() || 'Joueur 2';
        const decksPerPlayer = Number(this.host.querySelector('#combat-1000-decks')?.value) || MIN_DECKS_PER_PLAYER;
        const needed = minDecksRequiredForCombat(decksPerPlayer);
        const msg = this.host.querySelector('#combat-1000-config-msg');
        if (decks.length < needed) {
          if (msg) {
            msg.className = 'menu-msg error';
            msg.textContent = `Il faut au moins ${needed} decks enregistrés pour ${decksPerPlayer} deck${decksPerPlayer !== 1 ? 's' : ''} par joueur (${decks.length} disponible${decks.length !== 1 ? 's' : ''}).`;
          }
          return;
        }
        const run = createCombat1000Run({
          player1Name: p1,
          player2Name: p2,
          decksPerPlayer,
          availableDeckIds: decks.map((d) => d.id),
        });
        this.onInitCombat1000(run);
        this.showCombat1000Draft();
      });
    }
  }

  renderCombat1000DraftDeckList(run, { selectable = false, availableIds = null } = {}) {
    const ids = availableIds ?? run.availableDeckIds;
    if (!ids.length) {
      return '<p class="menu-empty-hint">Aucun deck disponible.</p>';
    }

    const decks = ids.map((id) => getDeckById(id)).filter(Boolean);
    const groups = this.getDeckFolderGroupsForNav(decks).filter((group) =>
      group.decks.some((deck) => ids.includes(deck.id)),
    );
    const inFolderView = this.combatDraftFolderId !== null;
    const currentGroup = inFolderView
      ? this.isAllFoldersNavKey(this.combatDraftFolderId)
        ? { name: ALL_FOLDERS_LABEL, decks }
        : this.findDeckFolderGroup(this.combatDraftFolderId, decks)
      : null;

    if (!inFolderView) {
      return `
        <p class="menu-subtitle deck-folder-nav-hint">Choisissez un dossier</p>
        ${this.renderDeckFolderNavList(
          groups.map((group) => ({
            ...group,
            decks: group.decks.filter((deck) => ids.includes(deck.id)),
          })),
          'data-pick-draft-folder',
          { showAllOption: true, allDeckCount: decks.length },
        )}`;
    }

    if (!currentGroup) {
      return '<p class="menu-empty-hint">Dossier introuvable.</p>';
    }

    const visibleDecks = currentGroup.decks.filter((deck) => ids.includes(deck.id));
    return `
      <div class="deck-folder-draft-header">
        <button type="button" class="btn-back" data-action="back-draft-folders">← Dossiers</button>
        <h3 class="deck-folder-open-title">${this.escapeHtml(currentGroup.name)}</h3>
      </div>
      ${
        visibleDecks.length
          ? `<ul class="saved-deck-list combat-1000-deck-pick">${visibleDecks
              .map((deck) =>
                this.renderSavedDeckRow(deck, {
                  showMove: false,
                  showEdit: false,
                  pickButton: selectable ? deck.id : null,
                }),
              )
              .join('')}</ul>`
          : '<p class="deck-folder-empty">Aucun deck disponible dans ce dossier.</p>'
      }`;
  }

  renderCombat1000RosterSummary(run) {
    const renderSide = (name, ids, wins) => {
      const items = ids
        .map((id) => {
          const deck = getDeckById(id);
          return `<li>${this.escapeHtml(deck?.name || id)}</li>`;
        })
        .join('');
      return `
        <div class="combat-1000-roster-side">
          <h3>${this.escapeHtml(name)} <span class="combat-1000-roster-score">${wins} victoire${wins !== 1 ? 's' : ''}</span></h3>
          <ol class="combat-1000-roster-list">${items || '<li class="menu-empty-hint">—</li>'}</ol>
        </div>`;
    };
    return `
      <div class="combat-1000-rosters">
        ${renderSide(run.player1Name, run.player1DeckIds, run.player1Wins)}
        ${renderSide(run.player2Name, run.player2DeckIds, run.player2Wins)}
      </div>`;
  }

  renderCombat1000Draft() {
    const run = getActiveCombat1000Run();
    if (!run) {
      this.showCombat1000Config();
      return;
    }

    if (isDraftComplete(run)) {
      beginSecretPickPhase(run);
      this.showCombat1000SecretPick();
      return;
    }

    const info = getDraftTurnInfo(run);
    if (!info) {
      beginSecretPickPhase(run);
      this.showCombat1000SecretPick();
      return;
    }

    const turnHint =
      info.picksRemainingThisTurn === 1
        ? 'choisit 1 deck'
        : `choisit encore ${info.picksRemainingThisTurn} deck${info.picksRemainingThisTurn !== 1 ? 's' : ''}`;

    this.host.innerHTML = `
      <div class="menu-screen menu-combat-1000-draft">
        <div class="menu-bar">
          <button type="button" class="btn-back" data-action="back">← Configuration</button>
        </div>
        <h1 class="menu-title">Draft des decks</h1>
        <p class="menu-subtitle combat-1000-turn-banner"><strong>${this.escapeHtml(info.playerName)}</strong> ${turnHint}</p>
        <p class="menu-combat-1000-rules">Chaque deck ne peut être choisi qu'une fois. Objectif : ${run.decksPerPlayer} deck${run.decksPerPlayer !== 1 ? 's' : ''} par joueur.</p>
        <div id="combat-1000-draft-msg"></div>
        <section aria-label="Decks disponibles">
          <h2 class="combat-1000-section-title">Decks disponibles</h2>
          ${this.renderCombat1000DraftDeckList(run, { selectable: true })}
        </section>
        <section aria-label="Rosters" class="combat-1000-rosters-wrap">
          <h2 class="combat-1000-section-title">Rosters</h2>
          ${this.renderCombat1000RosterSummary(run)}
        </section>
      </div>
    `;

    this.host.querySelector('[data-action="back"]')?.addEventListener('click', () => this.showCombat1000Config());
    this.host.querySelector('[data-action="back-draft-folders"]')?.addEventListener('click', () => {
      this.combatDraftFolderId = null;
      this.renderCombat1000Draft();
    });

    this.bindDeckFolderToolbarActions({
      onRefresh: () => this.renderCombat1000Draft(),
      pickAttr: 'data-pick-draft-folder',
      onPickFolder:
        this.combatDraftFolderId === null
          ? (folderKey) => {
              this.combatDraftFolderId = folderKey;
              this.renderCombat1000Draft();
            }
          : null,
    });

    for (const btn of this.host.querySelectorAll('[data-pick-deck]')) {
      btn.addEventListener('click', () => {
        const deckId = btn.getAttribute('data-pick-deck');
        const result = applyDraftPick(run, deckId);
        const msg = this.host.querySelector('#combat-1000-draft-msg');
        if (!result.ok) {
          if (msg) {
            msg.className = 'menu-msg error';
            msg.textContent = result.error;
          }
          return;
        }
        this.combatDraftFolderId = null;
        if (isDraftComplete(run)) {
          beginSecretPickPhase(run);
          this.showCombat1000SecretPick();
        } else {
          this.renderCombat1000Draft();
        }
      });
    }
  }

  renderCombat1000SecretPick() {
    const run = getActiveCombat1000Run();
    if (!run) {
      this.showCombat1000Config();
      return;
    }

    if (!run.secretPhase) {
      beginSecretPickPhase(run);
    }

    const phase = run.secretPhase;
    if (phase === 'vs') {
      this.showCombat1000Vs();
      return;
    }

    if (phase === 'pass-p1' || phase === 'pass-p2') {
      const playerName = phase === 'pass-p1' ? run.player1Name : run.player2Name;
      const otherName = phase === 'pass-p1' ? run.player2Name : run.player1Name;
      this.host.innerHTML = `
        <div class="menu-screen menu-combat-1000-secret">
          <h1 class="menu-title">Sélection secrète</h1>
          <p class="menu-subtitle">Manche ${run.roundNumber + 1} — ${run.player1Wins} à ${run.player2Wins}</p>
          <div class="combat-1000-pass-card">
            <p class="combat-1000-pass-title">Passez l'appareil à</p>
            <p class="combat-1000-pass-name">${this.escapeHtml(playerName)}</p>
            <p class="menu-combat-1000-rules">L'autre joueur (${this.escapeHtml(otherName)}) ne doit pas voir l'écran.</p>
          </div>
          <div class="menu-footer-actions">
            <button type="button" class="btn-menu primary" data-action="secret-ready">Je suis prêt — choisir mon deck</button>
          </div>
        </div>
      `;
      this.host.querySelector('[data-action="secret-ready"]')?.addEventListener('click', () => {
        advanceSecretPhase(run);
        this.renderCombat1000SecretPick();
      });
      return;
    }

    const playerIndex = phase === 'pick-p1' ? 0 : 1;
    const playerName = playerIndex === 0 ? run.player1Name : run.player2Name;
    const unused = getUnusedDeckIds(run, playerIndex);

    this.host.innerHTML = `
      <div class="menu-screen menu-combat-1000-secret">
        <h1 class="menu-title">${this.escapeHtml(playerName)}</h1>
        <p class="menu-subtitle">Choisissez un deck en secret pour la manche ${run.roundNumber + 1}</p>
        <p class="menu-combat-1000-rules">Decks restants : ${unused.length}</p>
        <div id="combat-1000-secret-msg"></div>
        ${this.renderCombat1000DraftDeckList(run, { selectable: true, availableIds: unused })}
      </div>
    `;

    this.host.querySelector('[data-action="back-draft-folders"]')?.addEventListener('click', () => {
      this.combatDraftFolderId = null;
      this.renderCombat1000SecretPick();
    });

    this.bindDeckFolderToolbarActions({
      onRefresh: () => this.renderCombat1000SecretPick(),
      pickAttr: 'data-pick-draft-folder',
      onPickFolder:
        this.combatDraftFolderId === null
          ? (folderKey) => {
              this.combatDraftFolderId = folderKey;
              this.renderCombat1000SecretPick();
            }
          : null,
    });

    for (const btn of this.host.querySelectorAll('[data-pick-deck]')) {
      btn.addEventListener('click', () => {
        const deckId = btn.getAttribute('data-pick-deck');
        const result = applySecretPick(run, playerIndex, deckId);
        const msg = this.host.querySelector('#combat-1000-secret-msg');
        if (!result.ok) {
          if (msg) {
            msg.className = 'menu-msg error';
            msg.textContent = result.error;
          }
          return;
        }
        this.combatDraftFolderId = null;
        this.renderCombat1000SecretPick();
      });
    }
  }

  renderCombat1000Vs() {
    const run = getActiveCombat1000Run();
    if (!run?.matchPlayer1DeckId || !run?.matchPlayer2DeckId) {
      this.showCombat1000SecretPick();
      return;
    }

    const { player1DeckName, player2DeckName } = getMatchDeckNames(run);

    this.host.innerHTML = `
      <div class="menu-screen menu-combat-1000-vs">
        <h1 class="menu-title">Manche ${run.roundNumber + 1}</h1>
        <p class="menu-subtitle">Score : ${this.escapeHtml(run.player1Name)} ${run.player1Wins} — ${run.player2Wins} ${this.escapeHtml(run.player2Name)}</p>
        <div class="combat-1000-vs-card">
          <div class="combat-1000-vs-side">
            <span class="combat-1000-vs-player">${this.escapeHtml(run.player1Name)}</span>
            <strong class="combat-1000-vs-deck">${this.escapeHtml(player1DeckName)}</strong>
          </div>
          <span class="combat-1000-vs-vs" aria-hidden="true">VS</span>
          <div class="combat-1000-vs-side">
            <span class="combat-1000-vs-player">${this.escapeHtml(run.player2Name)}</span>
            <strong class="combat-1000-vs-deck">${this.escapeHtml(player2DeckName)}</strong>
          </div>
        </div>
        <p class="menu-combat-1000-rules">Le premier joueur sera tiré au sort. Règles de partie inchangées.</p>
        <div class="menu-footer-actions">
          <button type="button" class="btn-menu primary" data-action="start-match">Commencer le combat</button>
        </div>
      </div>
    `;

    this.host.querySelector('[data-action="start-match"]')?.addEventListener('click', () => {
      this.onStartCombat1000Match();
    });
  }

  renderCombat1000End() {
    const meta = this.combat1000EndMeta;
    const run = meta?.run || getActiveCombat1000Run();
    if (!run) {
      this.showMain();
      return;
    }

    const { winnerName } = getCombat1000Winner(run);
    const abandoned = !!meta?.abandoned;
    const title = abandoned ? 'Combat abandonné' : 'Combat des 1000 Jours terminé';
    const subtitle = abandoned
      ? 'Résultat partiel enregistré dans l\'historique.'
      : winnerName === 'Égalité'
        ? 'Match nul — égalité parfaite.'
        : `Victoire de ${winnerName}`;

    this.host.innerHTML = `
      <div class="menu-screen menu-combat-1000-end">
        <div class="menu-bar">
          <button type="button" class="btn-back" data-action="back">← Menu principal</button>
        </div>
        <h1 class="menu-title">${this.escapeHtml(title)}</h1>
        <p class="menu-subtitle">${this.escapeHtml(subtitle)}</p>
        <div class="combat-1000-end-score">
          <div class="combat-1000-end-player">
            <span class="combat-1000-end-name">${this.escapeHtml(run.player1Name)}</span>
            <strong class="combat-1000-end-wins">${run.player1Wins}</strong>
          </div>
          <span class="combat-1000-vs-vs">—</span>
          <div class="combat-1000-end-player">
            <span class="combat-1000-end-name">${this.escapeHtml(run.player2Name)}</span>
            <strong class="combat-1000-end-wins">${run.player2Wins}</strong>
          </div>
        </div>
        <p class="menu-combat-1000-rules">${run.roundNumber} manche${run.roundNumber !== 1 ? 's' : ''} jouée${run.roundNumber !== 1 ? 's' : ''} · ${run.decksPerPlayer} deck${run.decksPerPlayer !== 1 ? 's' : ''} par joueur</p>
        ${this.renderCombat1000RosterSummary(run)}
        <div class="menu-footer-actions">
          <button type="button" class="btn-menu primary" data-action="menu">Menu principal</button>
        </div>
      </div>
    `;

    this.host.querySelector('[data-action="back"]')?.addEventListener('click', () => this.showMain());
    this.host.querySelector('[data-action="menu"]')?.addEventListener('click', () => this.showMain());
  }

  renderCombat1000HistorySection() {
    const history = loadCombat1000History();
    if (!history.length) {
      return `
        <section class="combat-1000-history-section" aria-label="Historique des Combats des 1000 Jours">
          <h2 class="combat-1000-section-title">Historique des Combats des 1000 Jours</h2>
          <p class="menu-empty-hint">Aucun combat enregistré pour l'instant.</p>
        </section>`;
    }

    const rows = history
      .map(
        (entry) => `
        <tr>
          <td>${this.escapeHtml(formatCombat1000Date(entry.date))}</td>
          <td>${this.escapeHtml(entry.player1Name)}</td>
          <td>${this.escapeHtml(entry.player2Name)}</td>
          <td>${entry.decksPerPlayer}</td>
          <td><strong>${entry.player1Wins} — ${entry.player2Wins}</strong></td>
          <td>${this.escapeHtml(entry.winnerName)}</td>
        </tr>`,
      )
      .join('');

    return `
      <section class="combat-1000-history-section" aria-label="Historique des Combats des 1000 Jours">
        <h2 class="combat-1000-section-title">Historique des Combats des 1000 Jours</h2>
        <div class="combat-1000-history-scroll">
          <table class="legend-table combat-1000-history-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>J1</th>
                <th>J2</th>
                <th>Decks</th>
                <th>Score</th>
                <th>Gagnant</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div class="menu-footer-actions menu-stats-footer">
          <button type="button" class="btn-menu btn-menu-danger" data-action="reset-combat-1000-history">Effacer l'historique</button>
        </div>
      </section>`;
  }

  renderStart() {
    const decks = getAllDeckOptions();
    const { empty, folderOptionsHtml, optionsHtml } = this.buildDeckSelectOptions(decks);
    const difficultyRadios = AI_DIFFICULTIES.map(
      (d) => {
        const hint = AI_DIFFICULTY_HINTS[d];
        const hintHtml = hint
          ? `<span class="mode-option-hint">${this.escapeHtml(hint)}</span>`
          : '';
        return `
          <label class="mode-option mode-option-stacked">
            <input type="radio" name="ai-difficulty" value="${d}"${this.aiDifficulty === d ? ' checked' : ''} />
            <span><strong>${AI_DIFFICULTY_LABELS[d]}</strong>${hintHtml ? ` — ${hintHtml}` : ''}</span>
          </label>`;
      },
    ).join('');

    this.host.innerHTML = `
      <div class="menu-screen menu-start">
        <div class="menu-bar">
          <button type="button" class="btn-back" data-action="back">← Menu principal</button>
        </div>
        <h1 class="menu-title">Lancer une partie</h1>
        <p class="menu-subtitle">Choisissez un deck pour chaque joueur</p>
        <div id="start-msg"></div>
        <fieldset class="start-mode" aria-label="Mode de jeu">
          <legend>Mode de jeu</legend>
          <label class="mode-option">
            <input type="radio" name="game-mode" value="ai" checked />
            Solo vs IA
          </label>
          <label class="mode-option">
            <input type="radio" name="game-mode" value="local2p" />
            2 joueurs (local)
          </label>
        </fieldset>
        <fieldset class="start-mode start-ai-difficulty" id="ai-difficulty-field" aria-label="Difficulté de l'IA">
          <legend>Difficulté IA</legend>
          ${difficultyRadios}
        </fieldset>
        ${empty ? this.renderNoDecksHint() : `
        <div class="start-decks">
          ${this.renderFolderDeckPickerRow({
            folderSelectId: 'deck-player-folder',
            deckSelectId: 'deck-player',
            folderLabel: 'Dossier — Joueur',
            deckLabel: 'Deck — Joueur',
            folderOptionsHtml,
            deckOptionsHtml: optionsHtml,
          })}
          ${this.renderFolderDeckPickerRow({
            folderSelectId: 'deck-opponent-folder',
            deckSelectId: 'deck-opponent',
            folderLabel: 'Dossier — Adversaire',
            deckLabel: 'Deck — Adversaire',
            folderOptionsHtml,
            deckOptionsHtml: optionsHtml,
          })}
        </div>
        <div class="menu-footer-actions">
          <button type="button" class="btn-menu primary" data-action="play">Commencer la partie</button>
        </div>`}
      </div>
    `;

    this.host.querySelector('[data-action="back"]')?.addEventListener('click', () => this.showMain());

    const difficultyField = this.host.querySelector('#ai-difficulty-field');
    const syncDifficultyVisibility = () => {
      const isAi =
        this.host.querySelector('input[name="game-mode"]:checked')?.value !== 'local2p';
      difficultyField?.toggleAttribute('hidden', !isAi);
    };
    syncDifficultyVisibility();
    for (const radio of this.host.querySelectorAll('input[name="game-mode"]')) {
      radio.addEventListener('change', syncDifficultyVisibility);
    }
    for (const radio of this.host.querySelectorAll('input[name="ai-difficulty"]')) {
      radio.addEventListener('change', () => {
        const value = this.host.querySelector('input[name="ai-difficulty"]:checked')?.value;
        if (value) {
          this.aiDifficulty = normalizeAiDifficulty(value);
          saveAiDifficulty(this.aiDifficulty);
        }
      });
    }

    if (empty) {
      this.bindNoDecksBuilderAction();
    } else {
      this.bindFolderDeckCascade({
        folderSelectId: 'deck-player-folder',
        deckSelectId: 'deck-player',
        decks,
      });
      this.bindFolderDeckCascade({
        folderSelectId: 'deck-opponent-folder',
        deckSelectId: 'deck-opponent',
        decks,
        defaultDeckIndex: 1,
      });
      this.host.querySelector('[data-action="play"]')?.addEventListener('click', () => {
        const playerId = this.host.querySelector('#deck-player')?.value;
        const opponentId = this.host.querySelector('#deck-opponent')?.value;
        const gameMode =
          this.host.querySelector('input[name="game-mode"]:checked')?.value === 'local2p'
            ? 'local2p'
            : 'ai';
        const aiDifficulty = normalizeAiDifficulty(
          this.host.querySelector('input[name="ai-difficulty"]:checked')?.value,
        );
        if (gameMode === 'ai') {
          this.aiDifficulty = aiDifficulty;
          saveAiDifficulty(aiDifficulty);
        }
        if (!playerId || !opponentId) return;
        this.onStartMatch({
          playerDeckId: playerId,
          opponentDeckId: opponentId,
          gameMode,
          aiDifficulty: gameMode === 'ai' ? aiDifficulty : undefined,
        });
      });
    }
  }

  renderAiBattlePick() {
    const decks = getAllDeckOptions();
    const { empty, folderOptionsHtml, optionsHtml } = this.buildDeckSelectOptions(decks);
    const needsTwoDecks = !empty && decks.length < 2;
    const difficultyRadios = AI_DIFFICULTIES.map(
      (d) => {
        const hint = AI_DIFFICULTY_HINTS[d];
        const hintHtml = hint
          ? `<span class="mode-option-hint">${this.escapeHtml(hint)}</span>`
          : '';
        return `
          <label class="mode-option mode-option-stacked">
            <input type="radio" name="ai-battle-difficulty" value="${d}"${this.aiDifficulty === d ? ' checked' : ''} />
            <span><strong>${AI_DIFFICULTY_LABELS[d]}</strong>${hintHtml ? ` — ${hintHtml}` : ''}</span>
          </label>`;
      },
    ).join('');

    this.host.innerHTML = `
      <div class="menu-screen menu-ai-battle-pick">
        <div class="menu-bar">
          <button type="button" class="btn-back" data-action="back">← Menu principal</button>
        </div>
        <h1 class="menu-title">IA Battle</h1>
        <p class="menu-subtitle">Simulation headless — deux IA s'affrontent sans plateau ni animations</p>
        <div id="ai-battle-msg"></div>
        <fieldset class="start-mode" aria-label="Difficulté des IA">
          <legend>Difficulté IA (les deux decks)</legend>
          ${difficultyRadios}
        </fieldset>
        ${empty ? this.renderNoDecksHint() : needsTwoDecks ? `
        <p class="menu-empty-hint">Il faut au moins deux decks enregistrés pour une simulation IA Battle.</p>
        <div class="menu-footer-actions">
          <button type="button" class="btn-menu primary" data-action="builder">Créer un deck</button>
        </div>` : `
        <div class="start-decks">
          ${this.renderFolderDeckPickerRow({
            folderSelectId: 'ai-battle-folder-a',
            deckSelectId: 'ai-battle-deck-a',
            folderLabel: 'Dossier — Deck A',
            deckLabel: 'Deck A',
            folderOptionsHtml,
            deckOptionsHtml: optionsHtml,
          })}
          ${this.renderFolderDeckPickerRow({
            folderSelectId: 'ai-battle-folder-b',
            deckSelectId: 'ai-battle-deck-b',
            folderLabel: 'Dossier — Deck B',
            deckLabel: 'Deck B',
            folderOptionsHtml,
            deckOptionsHtml: optionsHtml,
          })}
        </div>
        <div class="menu-footer-actions">
          <button type="button" class="btn-menu primary" data-action="run-ai-battle"${this.aiBattleRunning ? ' disabled' : ''}>Lancer la simulation</button>
        </div>`}
      </div>
    `;

    this.host.querySelector('[data-action="back"]')?.addEventListener('click', () => this.showMain());
    for (const radio of this.host.querySelectorAll('input[name="ai-battle-difficulty"]')) {
      radio.addEventListener('change', () => {
        const value = this.host.querySelector('input[name="ai-battle-difficulty"]:checked')?.value;
        if (value) {
          this.aiDifficulty = normalizeAiDifficulty(value);
          saveAiDifficulty(this.aiDifficulty);
        }
      });
    }

    if (empty || needsTwoDecks) {
      this.bindNoDecksBuilderAction();
    } else {
      this.bindFolderDeckCascade({
        folderSelectId: 'ai-battle-folder-a',
        deckSelectId: 'ai-battle-deck-a',
        decks,
      });
      this.bindFolderDeckCascade({
        folderSelectId: 'ai-battle-folder-b',
        deckSelectId: 'ai-battle-deck-b',
        decks,
        defaultDeckIndex: 1,
      });

      this.host.querySelector('[data-action="run-ai-battle"]')?.addEventListener('click', () => {
        void this.runAiBattleSimulation();
      });
    }
  }

  async runAiBattleSimulation() {
    if (this.aiBattleRunning) return;
    const deckAId = this.host.querySelector('#ai-battle-deck-a')?.value;
    const deckBId = this.host.querySelector('#ai-battle-deck-b')?.value;
    const aiDifficulty = normalizeAiDifficulty(
      this.host.querySelector('input[name="ai-battle-difficulty"]:checked')?.value,
    );
    const msgEl = this.host.querySelector('#ai-battle-msg');
    const runBtn = this.host.querySelector('[data-action="run-ai-battle"]');

    if (!deckAId || !deckBId) return;
    if (deckAId === deckBId) {
      if (msgEl) {
        msgEl.className = 'menu-msg error';
        msgEl.textContent = 'Choisissez deux decks différents.';
      }
      return;
    }

    const deckA = getDeckById(deckAId);
    const deckB = getDeckById(deckBId);
    if (!deckA || !deckB) return;

    this.aiDifficulty = aiDifficulty;
    saveAiDifficulty(aiDifficulty);
    this.aiBattleRunning = true;
    if (runBtn) runBtn.disabled = true;
    if (msgEl) {
      msgEl.className = 'menu-msg';
      msgEl.textContent = 'Simulation en cours…';
    }

    try {
      const result = await simulateAiBattle({
        deckLists: [deckEntryToCardList(deckA), deckEntryToCardList(deckB)],
        deckIds: [deckAId, deckBId],
        deckNames: [deckA.name, deckB.name],
        aiDifficulty,
      });
      this.aiBattleRunning = false;
      this.showAiBattleResult(result);
    } catch (err) {
      console.error(err);
      this.aiBattleRunning = false;
      if (runBtn) runBtn.disabled = false;
      if (msgEl) {
        msgEl.className = 'menu-msg error';
        msgEl.textContent = err.message || 'Erreur pendant la simulation.';
      }
    }
  }

  renderAiBattleDeckStats(deck) {
    const koDealt =
      deck.firstKoDealtTurn != null ? `tour ${deck.firstKoDealtTurn}` : '—';
    const koReceived =
      deck.firstKoReceivedTurn != null ? `tour ${deck.firstKoReceivedTurn}` : '—';
    const avgDealtPerTurn = getAvgDamagePerTurnForMatch(deck, 'dealt');
    const avgReceivedPerTurn = getAvgDamagePerTurnForMatch(deck, 'received');
    const topKnights =
      deck.topKnights?.length > 0
        ? `<ul class="ai-battle-knight-list">
            ${deck.topKnights
              .map(
                (k) =>
                  `<li>${this.escapeHtml(k.name)} — ${formatStatNumber(k.totalDamage)} dégâts</li>`,
              )
              .join('')}
          </ul>`
        : '<p class="menu-empty-hint">Aucun dégât d\'attaque enregistré.</p>';

    return `
      <section class="ai-battle-deck-panel">
        <h3>${this.escapeHtml(deck.name)}</h3>
        <ul class="deck-stats-metrics">
          <li><span class="deck-stats-label">Dégâts infligés</span><span class="deck-stats-value">${formatStatNumber(deck.damageDealt)}</span></li>
          <li><span class="deck-stats-label">Dégâts reçus</span><span class="deck-stats-value">${formatStatNumber(deck.damageReceived)}</span></li>
          <li><span class="deck-stats-label">Dégât moyen par tour attaquant</span><span class="deck-stats-value">${formatStatDecimal(avgDealtPerTurn)}</span></li>
          <li><span class="deck-stats-label">Dégât moyen par tour défenseur</span><span class="deck-stats-value">${formatStatDecimal(avgReceivedPerTurn)}</span></li>
          <li><span class="deck-stats-label">Tours en attaque</span><span class="deck-stats-value">${formatStatNumber(deck.turnsAsAttacker ?? 0)}</span></li>
          <li><span class="deck-stats-label">K.O. infligés</span><span class="deck-stats-value">${formatStatNumber(deck.knockOutsDealt)}</span></li>
          <li><span class="deck-stats-label">K.O. subis</span><span class="deck-stats-value">${formatStatNumber(deck.knockOutsReceived)}</span></li>
          <li><span class="deck-stats-label">1<sup>er</sup> K.O. infligé</span><span class="deck-stats-value">${koDealt}</span></li>
          <li><span class="deck-stats-label">1<sup>er</sup> K.O. subi</span><span class="deck-stats-value">${koReceived}</span></li>
          <li><span class="deck-stats-label">Récompenses prises</span><span class="deck-stats-value">${formatStatNumber(deck.prizesTaken)}</span></li>
          <li><span class="deck-stats-label">Récompenses restantes</span><span class="deck-stats-value">${formatStatNumber(deck.prizesRemaining)}</span></li>
        </ul>
        <h4 class="ai-battle-subtitle">Chevaliers les plus offensifs</h4>
        ${topKnights}
      </section>`;
  }

  renderAiBattleResult() {
    const r = this.aiBattleResult;
    if (!r) {
      this.showAiBattlePick();
      return;
    }

    const winnerBlock =
      r.winnerIndex != null
        ? `<p class="ai-battle-winner"><strong>Gagnant :</strong> ${this.escapeHtml(r.winnerName || '—')} <span class="deck-stats-sub">(${formatWinReason(r.winReason)})</span></p>`
        : `<p class="ai-battle-winner warn"><strong>Aucun gagnant</strong> — ${this.escapeHtml(formatAiBattleStatus(r.status))}</p>`;

    const deckPanels = (r.perDeck || [])
      .map((d) => this.renderAiBattleDeckStats(d))
      .join('');

    this.host.innerHTML = `
      <div class="menu-screen menu-ai-battle-result">
        <div class="menu-bar">
          <button type="button" class="btn-back" data-action="back">← Menu principal</button>
        </div>
        <h1 class="menu-title">Résultat IA Battle</h1>
        <p class="menu-subtitle">IA ${this.escapeHtml(AI_DIFFICULTY_LABELS[r.aiDifficulty] || r.aiDifficulty)} · ${formatStatNumber(r.turnCount)} tours · ${(r.elapsedMs / 1000).toFixed(1)} s</p>
        ${winnerBlock}
        <p class="menu-stats-legend">Statut : ${this.escapeHtml(formatAiBattleStatus(r.status))} · ${formatStatNumber(r.steps)} actions simulées</p>
        <div class="ai-battle-results-grid">${deckPanels}</div>
        <div class="menu-footer-actions">
          <button type="button" class="btn-menu" data-action="retry">Relancer</button>
          <button type="button" class="btn-menu primary" data-action="menu">Menu principal</button>
        </div>
      </div>
    `;

    this.host.querySelector('[data-action="back"]')?.addEventListener('click', () => this.showMain());
    this.host.querySelector('[data-action="menu"]')?.addEventListener('click', () => this.showMain());
    this.host.querySelector('[data-action="retry"]')?.addEventListener('click', () => this.showAiBattlePick());
  }

  escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  escapeAttr(s) {
    return this.escapeHtml(s).replace(/'/g, '&#39;');
  }
}
