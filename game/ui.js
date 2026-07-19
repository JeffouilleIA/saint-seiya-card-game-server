import {
  formatEvolvesFrom,
  getCardDef,
  getEvolutionRequiredToolName,
  isBaseChevalier,
  isEvolutionStage,
  isTestOnlyCard,
  requiresEvolutionTool,
} from './cards.js';
import {
  attackFxDurationMs,
  getAttackFxId,
  getFxTiming,
  poseidonTridentRoyalTiming,
  sagaExplosionGalactiqueTiming,
  hundredDragonsFxCount,
  isGoldSaintAttackFx,
  isMeleeAttack,
  isSignatureAttackFx,
  medusaFxTotalSec,
  medusaWhiteStartSec,
  stadiumFxDurationMs,
} from './attackFx.js';
import { RULES, formatCoinFlipResult } from './rules.js';
import { repairFrenchDisplayText } from './text-encoding.js';

const KNIGHT_STATUS_MARKERS = {
  poisoned: { label: 'PSN', title: 'Empoisonné', icon: '☠' },
  paralyzed: { label: 'PRZ', title: 'Paralysé', icon: '⚡' },
  confused: { label: 'CNF', title: 'Confus', icon: '🌀' },
  frozen: { label: 'GEL', title: 'Gelé', icon: '❄' },
};

function renderKnightStatusBadges(statuses) {
  const visible = (statuses || []).filter((s) => KNIGHT_STATUS_MARKERS[s]);
  if (!visible.length) return '';
  return `<div class="status-badges" aria-label="États spéciaux">${visible
    .map((s) => {
      const m = KNIGHT_STATUS_MARKERS[s];
      return `<span class="status-badge status-${s}" title="${m.title}"><span class="status-icon" aria-hidden="true">${m.icon}</span><span class="status-label">${m.label}</span></span>`;
    })
    .join('')}</div>`;
}

export class GameUI {
  /**
   * @param {HTMLElement} root
   * @param {import('./engine.js').GameEngine} engine
   * @param {*} [audio]
   * @param {{ onReplay?: () => void, onMainMenu?: () => void, onAttackTestBackKnights?: () => void, onMatchEnd?: (info: { winner: number, gameMode: string }) => void, gameMode?: string, formatEndGame?: (state: object) => { title?: string, desc?: string, replayLabel?: string, menuLabel?: string, hideReplay?: boolean }, housesProgress?: string | { progress?: string, opponentName?: string } }} [matchCallbacks]
   */
  constructor(root, engine, audio = null, matchCallbacks = {}) {
    this.root = root;
    this.engine = engine;
    this.audio = audio ?? (typeof window !== 'undefined' ? window.gameAudio : null);
    this.onReplay = matchCallbacks.onReplay || (() => {});
    this.onMainMenu = matchCallbacks.onMainMenu || (() => {});
    this.onAttackTestBackKnights = matchCallbacks.onAttackTestBackKnights || (() => {});
    this.onMatchEnd = matchCallbacks.onMatchEnd || null;
    this.formatEndGame = matchCallbacks.formatEndGame || null;
    this.gameMode = matchCallbacks.gameMode || engine.gameMode || 'ai';
    this.onlineSeat = matchCallbacks.onlineSeat ?? 0;
    this.onlineHost = matchCallbacks.onlineHost ?? true;
    this.onlineRelay = matchCallbacks.onlineRelay || null;
    this.selectedHandIndex = null;
    this.mode = null;
    this.bannerTimer = null;
    this.revealQueue = [];
    this.revealPlaying = false;
    this.endGameShownFor = null;
    this.buildDOM();
    this.applyUiTimingVars();
    this.bindEngine();
    this.setHousesProgress(matchCallbacks.housesProgress || '');
  }

  setHousesProgress(info) {
    const bar = this.els.housesRunBar;
    const progressEl = this.els.housesProgress;
    const opponentEl = this.els.housesOpponent;
    if (!bar || !progressEl || !opponentEl) return;

    let progress = '';
    let opponentName = '';
    if (typeof info === 'string') {
      const label = info.trim();
      if (label) {
        const sep = ' — ';
        const idx = label.indexOf(sep);
        if (idx >= 0) {
          progress = label.slice(0, idx).trim();
          opponentName = label.slice(idx + sep.length).trim();
        } else {
          progress = label;
        }
      }
    } else if (info) {
      progress = (info.progress || '').trim();
      opponentName = (info.opponentName || '').trim();
    }

    if (!progress && !opponentName) {
      bar.classList.add('hidden');
      progressEl.textContent = '';
      opponentEl.textContent = '';
      return;
    }

    progressEl.textContent = progress;
    opponentEl.textContent = opponentName;
    opponentEl.classList.toggle('hidden', !opponentName);
    bar.classList.remove('hidden');
  }

  isLocal2p() {
    const mode = this.gameMode || this.engine?.gameMode;
    return mode === 'local2p' || mode === 'combat-1000-jours';
  }

  isOnline2p() {
    const mode = this.gameMode || this.engine?.gameMode;
    return mode === 'online2p';
  }

  isSharedHuman2p() {
    return this.isLocal2p() || this.isOnline2p();
  }

  relayOnlineAction(action) {
    if (!this.isOnline2p() || this.onlineHost) return false;
    this.onlineRelay?.(action);
    return true;
  }

  canOnlineGuestAct(state = this.engine.state) {
    if (!this.isOnline2p() || this.onlineHost) return true;
    const acting = this.getActingPlayer(state);
    return acting === this.onlineSeat;
  }

  isAttackTestMode() {
    return this.gameMode === 'attack-test' || this.engine.isAttackTestMode;
  }

  getViewSeat(state = this.engine.state) {
    if (this.isOnline2p()) {
      return this.onlineSeat ?? 0;
    }
    if (!this.isLocal2p()) return 0;
    const pending = state.pending;
    const pendingOwner = pending?.chooserPlayerIndex ?? pending?.playerIndex;
    if (pending != null && pendingOwner != null) {
      const interactive = [
        'chooseActive',
        'promoteActive',
        'searchDeck',
        'discardForAttack',
        'discardForTalent',
        'discardEnergyFromHandForTalent',
        'teleportPickSide',
        'moveEnergy',
        'pickOpponentBenchActive',
        'pickOwnBenchActive',
        'pickHealAlly',
        'pickBenchForDeckEnergy',
        'pickBenchForEnergyRecover',
        'pickKnightForDiscardEnergyAttach',
        'pickDamageOpponentKnight',
        'pickSilenceOpponentKnight',
        'pickRecoverFromDiscard',
        'lookTopDeck',
        'lookTopPickOne',
        'voluntarySacrificePick',
        'distributeDamage',
        'recoverDiscard',
        'attachEnergyFromHand',
        'attachEnergyFromDiscard',
        'discardHandKnight',
        'optionalDiscardHandDraw',
        'revealOpponentHand',
        'pickDisableOpponentAttack',
        'optionalDiscardEnergyForAttack',
        'transferEnergyTalent',
        'pickMeleeBonusAlly',
        'accelerationEnergieDiscard',
        'accelerationEnergieAttach',
        'missionGigasPlaceKnight',
        'pickCopyBenchAttack',
        'pickCopyOpponentAttack',
        'pickKanonSanctuary',
        'pickIoAnimal',
        'pickIoBigTornadoStatus',
        'pickBenchSelfAttack',
        'sacrificeBenchForAttack',
        'charonSwapBench',
        'transferEnergyToHades',
        'discardHandSilenceOpponentTalent',
        'pickHealAllyNextTurn',
        'cerbereBenchBonus',
        'athenaExclamationPick',
        'destructionOutilDiscard',
        'optionalDiscardNamedCardsForAttack',
        'pickHuitiemeSensTransfer',
        'donDeVie',
      ];
      if (interactive.includes(pending.type)) {
        return pendingOwner;
      }
    }
    return state.turn;
  }

  getPendingOwner(state = this.engine.state) {
    const pending = state.pending;
    if (!pending) return null;
    return pending.chooserPlayerIndex ?? pending.playerIndex ?? null;
  }

  canHumanActOnPending(state = this.engine.state, acting = this.getActingPlayer(state)) {
    const owner = this.getPendingOwner(state);
    return owner != null && owner === acting;
  }

  /** Affiche l'overlay de choix ; boardTarget laisse cliquer le plateau (Cerbère, répartition…). */
  showPickOverlay({ boardTarget = false, aboveFx = false } = {}) {
    if (aboveFx) this.hideAttackSplashForPick();
    this.els.overlay.classList.remove('hidden');
    this.els.overlay.classList.toggle('overlay--board-target', boardTarget);
    this.els.overlay.classList.toggle('overlay--above-fx', aboveFx);
  }

  resetPickOverlay() {
    this.els.overlay?.classList.remove('overlay--board-target', 'overlay--above-fx');
  }

  hideAttackSplashForPick() {
    const splash = this.els.attackSplash;
    if (!splash) return;
    splash.classList.add('hidden');
    splash.classList.remove('show', 'splash-phase-name', 'splash-phase-result');
  }

  isDonDeVieTargetClickable(state, acting, knight) {
    const pending = state.pending;
    if (
      pending?.type !== 'donDeVie' ||
      pending.playerIndex !== acting ||
      !knight ||
      (pending.phase !== 'damageTarget' && pending.phase !== 'healTarget')
    ) {
      return false;
    }
    return pending.options?.some((o) => o.instanceId === knight.instanceId) ?? false;
  }

  isPendingOptionKnight(state, acting, knight, type, phases = null) {
    const pending = state.pending;
    if (pending?.type !== type || pending.playerIndex !== acting || !knight) return false;
    if (phases && !phases.includes(pending.phase)) return false;
    return pending.options?.some((o) => o.instanceId === knight.instanceId) ?? false;
  }

  isKanonSanctuaryTargetClickable(state, acting, zone, knight) {
    const pending = state.pending;
    if (pending?.type !== 'pickKanonSanctuary' || pending.playerIndex !== acting || !knight) {
      return false;
    }
    if (!pending.phase) return false;
    const target = zone === 'active' ? 'active' : zone;
    const player = state.players[acting];
    if (pending.phase === 'attach') {
      return !!this.engine.effects.getKanonMarinaAtTarget(player, target);
    }
    if (pending.phase === 'moveFrom') {
      const marina = this.engine.effects.getKanonMarinaAtTarget(player, target);
      return !!marina?.energies?.length;
    }
    if (pending.phase === 'moveTo') {
      if (target === pending.fromTarget) return false;
      return !!this.engine.effects.getKanonMarinaAtTarget(player, target);
    }
    return false;
  }

  getActingPlayer(state = this.engine.state) {
    return this.getViewSeat(state);
  }

  isBottomPlayer(enginePlayerIndex, state = this.engine.state) {
    return enginePlayerIndex === this.getViewSeat(state);
  }

  applyUiTimingVars() {
    const u = RULES.ui ?? {};
    const sec = (ms, fallback) => `${(ms ?? fallback) / 1000}s`;
    const root = document.documentElement;
    root.style.setProperty('--card-transition', sec(u.cardTransitionMs, 420));
    root.style.setProperty('--banner-transition', sec(u.bannerTransitionMs, 280));
  }

  buildDOM() {
    this.root.innerHTML = `
      <div id="game">
        <div id="attack-test-bar" class="attack-test-bar hidden" role="navigation" aria-label="Mode test">
          <span class="attack-test-label">Mode test — animations d'attaque</span>
          <button type="button" class="btn btn-test-sim-hit hidden" id="btn-test-sim-hit" title="Après Mur de Cristal : fin de tour, puis simuler une attaque reçue">
            Simuler attaque reçue (−80)
          </button>
          <button type="button" class="btn" id="btn-test-back-knights">← Chevaliers</button>
          <button type="button" class="btn" id="btn-test-back-menu">Menu principal</button>
        </div>

        <header class="top-bar">
          <div class="pile opp-deck opp-deck-masked" data-pile="opp-deck" aria-label="Pioche adversaire"></div>
          <div class="prizes opp-prizes" id="opp-prizes"></div>
          <div class="banner" id="banner">
            <div id="houses-run-bar" class="houses-run-bar hidden" aria-live="polite">
              <span id="houses-progress" class="houses-progress"></span>
              <strong id="houses-opponent" class="houses-opponent"></strong>
            </div>
            <span id="banner-text">Chevalier TCG — V1</span>
          </div>
          <div class="prizes player-prizes" id="player-prizes"></div>
          <div class="pile player-deck" data-pile="player-deck"></div>
        </header>

        <div class="board-middle">
          <aside id="stadium-zone" class="stadium-zone" aria-label="Stade en jeu">
            <span class="stadium-zone-label">Stade</span>
            <div class="stadium-zone-card" id="stadium-zone-card"></div>
          </aside>
          <div class="board-fields">
            <section class="field opponent-field">
              <div class="bench-row" id="opp-bench"></div>
              <div class="active-row">
                <div class="active-slot" id="opp-active"></div>
              </div>
              <div class="discard opp-discard" id="opp-discard"></div>
            </section>

            <section class="field player-field">
              <div class="discard player-discard" id="player-discard"></div>
              <div class="active-row">
                <div class="active-slot" id="player-active"></div>
              </div>
              <div class="bench-row" id="player-bench"></div>
            </section>
          </div>
        </div>

        <section class="controls" id="controls">
          <button type="button" id="btn-sound" class="btn btn-sound" title="Activer ou couper les effets sonores">Son</button>
          <button type="button" id="btn-end-turn" class="btn">Fin de tour</button>
          <button type="button" id="btn-retreat" class="btn" disabled>Retraite</button>
          <button type="button" id="btn-cancel" class="btn btn-cancel hidden">Annuler</button>
          <div class="attack-bar" id="attack-bar"></div>
        </section>

        <section class="hand-zone">
          <div class="hand-fan" id="player-hand"></div>
        </section>

        <div class="overlay hidden" id="overlay">
          <div class="modal" id="modal"></div>
        </div>

        <div id="attack-splash" class="attack-splash hidden" aria-live="polite">
          <div class="splash-inner">
            <div class="splash-attack-name"></div>
            <div class="splash-attack-desc hidden"></div>
            <div class="splash-damage"></div>
          </div>
        </div>

        <div id="turn-start-banner" class="turn-start-banner hidden" aria-live="polite">
          <div class="turn-start-banner-inner"></div>
        </div>

        <div id="coin-flip-overlay" class="coin-flip-overlay hidden" aria-live="polite" aria-atomic="true">
          <div class="coin-flip-overlay-inner">
            <div class="coin-flip-announce">Lancer de pièce</div>
            <div class="coin-flip-reason"></div>
            <div class="coin-flip-coin" aria-hidden="true">🪙</div>
            <div class="coin-flip-result"></div>
          </div>
        </div>

        <div id="card-reveal" class="card-reveal hidden" aria-live="polite">
          <div class="card-reveal-backdrop"></div>
          <div class="card-reveal-slot"></div>
        </div>

        <div id="heal-splash" class="heal-splash hidden" aria-live="polite"></div>
        <div id="energy-fx" class="energy-fx hidden" aria-hidden="true"></div>
        <div id="attack-fx-layer" class="attack-fx-layer" aria-hidden="true"></div>

        <div id="endgame-overlay" class="endgame-overlay hidden" role="dialog" aria-modal="true" aria-labelledby="endgame-title">
          <div class="endgame-modal" id="endgame-modal">
            <h2 id="endgame-title"></h2>
            <p id="endgame-desc"></p>
            <div class="endgame-actions">
              <button type="button" class="btn primary" id="btn-replay">Rejouer</button>
              <button type="button" class="btn" id="btn-main-menu">Menu principal</button>
            </div>
          </div>
        </div>
      </div>
    `;

    this.els = {
      banner: this.root.querySelector('#banner-text'),
      bannerWrap: this.root.querySelector('#banner'),
      housesRunBar: this.root.querySelector('#houses-run-bar'),
      housesProgress: this.root.querySelector('#houses-progress'),
      housesOpponent: this.root.querySelector('#houses-opponent'),
      oppPrizes: this.root.querySelector('#opp-prizes'),
      playerPrizes: this.root.querySelector('#player-prizes'),
      oppBench: this.root.querySelector('#opp-bench'),
      playerBench: this.root.querySelector('#player-bench'),
      oppActive: this.root.querySelector('#opp-active'),
      playerActive: this.root.querySelector('#player-active'),
      oppDiscard: this.root.querySelector('#opp-discard'),
      playerDiscard: this.root.querySelector('#player-discard'),
      hand: this.root.querySelector('#player-hand'),
      handZone: this.root.querySelector('.hand-zone'),
      attackBar: this.root.querySelector('#attack-bar'),
      btnSound: this.root.querySelector('#btn-sound'),
      btnEndTurn: this.root.querySelector('#btn-end-turn'),
      btnRetreat: this.root.querySelector('#btn-retreat'),
      btnCancel: this.root.querySelector('#btn-cancel'),
      overlay: this.root.querySelector('#overlay'),
      modal: this.root.querySelector('#modal'),
      oppDeck: this.root.querySelector('.opp-deck'),
      playerDeck: this.root.querySelector('.player-deck'),
      attackSplash: this.root.querySelector('#attack-splash'),
      turnStartBanner: this.root.querySelector('#turn-start-banner'),
      turnStartBannerInner: this.root.querySelector('.turn-start-banner-inner'),
      coinFlipOverlay: this.root.querySelector('#coin-flip-overlay'),
      coinFlipReason: this.root.querySelector('.coin-flip-reason'),
      coinFlipResult: this.root.querySelector('.coin-flip-result'),
      splashName: this.root.querySelector('.splash-attack-name'),
      splashDesc: this.root.querySelector('.splash-attack-desc'),
      splashDamage: this.root.querySelector('.splash-damage'),
      game: this.root.querySelector('#game'),
      stadiumZone: this.root.querySelector('#stadium-zone'),
      stadiumZoneCard: this.root.querySelector('#stadium-zone-card'),
      playerField: this.root.querySelector('.player-field'),
      oppField: this.root.querySelector('.opponent-field'),
      cardReveal: this.root.querySelector('#card-reveal'),
      cardRevealSlot: this.root.querySelector('.card-reveal-slot'),
      healSplash: this.root.querySelector('#heal-splash'),
      energyFx: this.root.querySelector('#energy-fx'),
      attackFxLayer: this.root.querySelector('#attack-fx-layer'),
      endgameOverlay: this.root.querySelector('#endgame-overlay'),
      endgameModal: this.root.querySelector('#endgame-modal'),
      endgameTitle: this.root.querySelector('#endgame-title'),
      endgameDesc: this.root.querySelector('#endgame-desc'),
      btnReplay: this.root.querySelector('#btn-replay'),
      btnMainMenu: this.root.querySelector('#btn-main-menu'),
      attackTestBar: this.root.querySelector('#attack-test-bar'),
      btnTestBackKnights: this.root.querySelector('#btn-test-back-knights'),
      btnTestBackMenu: this.root.querySelector('#btn-test-back-menu'),
      btnTestSimHit: this.root.querySelector('#btn-test-sim-hit'),
    };

    this.els.btnReplay?.addEventListener('click', () => this.onReplay());
    this.els.btnMainMenu?.addEventListener('click', () => this.onMainMenu());
    this.els.btnTestBackKnights?.addEventListener('click', () => this.onAttackTestBackKnights());
    this.els.btnTestBackMenu?.addEventListener('click', () => this.onMainMenu());
    this.els.btnTestSimHit?.addEventListener('click', () => {
      this.engine.simulateAttackTestIncomingHit(80);
    });

    this.els.btnEndTurn.addEventListener('click', () => {
      const acting = this.getActingPlayer();
      if (this.engine.state.turn === acting && !this.engine.state.winner) {
        if (this.relayOnlineAction({ type: 'endTurn' })) return;
        this.engine.endTurn();
      }
    });

    this.els.btnRetreat.addEventListener('click', () => {
      const acting = this.getActingPlayer();
      if (this.engine.canRetreat(acting)) {
        this.setMode('retreat');
        this.setTargeting(true);
        this.showBanner('Choisissez un chevalier de banc pour la retraite.');
      }
    });

    this.els.btnCancel?.addEventListener('click', () => this.cancelSelection());

    this.updateSoundButton();
    this.els.btnSound?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.audio?.unlock();
      const muted = this.audio?.toggleMute() ?? false;
      this.updateSoundButton(muted);
    });

    const unlockAudio = () => {
      this.audio?.unlock();
    };
    this.els.game?.addEventListener('click', unlockAudio, { once: false });
    this.root.addEventListener(
      'click',
      () => {
        unlockAudio();
      },
      { once: true, capture: true },
    );

    this.bindCardMegaZoom();
  }

  bindCardMegaZoom() {
    const host = this.els.game;
    if (!host || host.dataset.megaZoomBound) return;
    host.dataset.megaZoomBound = '1';
    const delay = RULES.ui?.cardMegaZoomDelayMs ?? 2000;
    const leaveGraceMs = RULES.ui?.cardMegaZoomLeaveGraceMs ?? 320;

    host.addEventListener('mouseover', (e) => {
      const card = e.target.closest('.card');
      if (!card || !host.contains(card) || !this.isCardMegaZoomEligible(card)) return;
      this.cancelCardMegaZoomLeave();
      if (this._megaZoomActiveCard === card) return;
      if (this._megaZoomTarget === card && this._megaZoomTimer) return;
      this.clearCardMegaZoom();
      this._megaZoomTarget = card;
      this._megaZoomTimer = setTimeout(() => this.activateCardMegaZoom(card), delay);
    });

    host.addEventListener('mouseout', (e) => {
      if (this._megaZoomSuppressLeave) return;
      const active = this._megaZoomActiveCard;
      const fromCard = e.target.closest('.card');
      if (!fromCard) return;
      const to = e.relatedTarget;
      if (to && fromCard.contains(to)) return;
      if (active) {
        if (fromCard !== active && !active.contains(e.target)) return;
        if (to && active.contains(to)) return;
        this.scheduleCardMegaZoomLeave(leaveGraceMs);
        return;
      }
      if (fromCard !== this._megaZoomTarget) return;
      const toCard = to?.closest?.('.card');
      if (toCard && host.contains(toCard) && this.isCardMegaZoomEligible(toCard)) return;
      this.clearCardMegaZoom();
    });
  }

  ensureCardMegaZoomLayer() {
    const host = this.els.game;
    if (!host) return null;
    let layer = host.querySelector('#card-mega-zoom-layer');
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'card-mega-zoom-layer';
      layer.className = 'card-mega-zoom-layer';
      layer.setAttribute('aria-hidden', 'true');
      host.appendChild(layer);
    }
    return layer;
  }

  cancelCardMegaZoomLeave() {
    clearTimeout(this._megaZoomLeaveTimer);
    this._megaZoomLeaveTimer = null;
  }

  scheduleCardMegaZoomLeave(ms) {
    this.cancelCardMegaZoomLeave();
    this._megaZoomLeaveTimer = setTimeout(() => this.clearCardMegaZoom(), ms);
  }

  isCardMegaZoomEligible(card) {
    if (!card || card.classList.contains('card-empty')) return false;
    if (card.classList.contains('stadium-mini')) return false;
    if (card.closest('.card-reveal-slot, .draw-reveal-card, .knight-tool-hover-preview')) return false;
    return true;
  }

  activateCardMegaZoom(card) {
    if (!card?.isConnected || !this.isCardMegaZoomEligible(card)) return;
    if (this._megaZoomActiveCard === card && card.classList.contains('card-mega-zoom-active')) return;
    if (this._megaZoomActiveCard && this._megaZoomActiveCard !== card) {
      this.clearCardMegaZoom({ keepTarget: true });
    }

    const layer = this.ensureCardMegaZoomLayer();
    if (!layer) return;

    this._megaZoomTimer = null;
    this._megaZoomTarget = card;
    this.cancelCardMegaZoomLeave();
    clearTimeout(this._megaZoomSuppressTimer);
    this._megaZoomSuppressLeave = true;

    const rect = card.getBoundingClientRect();
    const handSize = card.classList.contains('hand-size');
    const finalW = Math.min(
      handSize ? 460 : 520,
      window.innerWidth * 0.78,
      Math.max(360, rect.width * 4.2),
    );
    let leftActive = rect.left + rect.width / 2 - finalW / 2;
    leftActive = Math.max(8, Math.min(leftActive, window.innerWidth - finalW - 8));
    let topActive = Math.max(8, Math.min(rect.top - 12, window.innerHeight - 56));

    const parent = card.parentElement;
    let placeholder = null;
    if (parent && parent !== layer) {
      placeholder = document.createElement('span');
      placeholder.className = 'card-mega-zoom-placeholder';
      placeholder.setAttribute('aria-hidden', 'true');
      placeholder.style.width = `${rect.width}px`;
      placeholder.style.height = `${rect.height}px`;
      parent.insertBefore(placeholder, card);
      this._megaZoomAnchor = { parent, next: card.nextSibling, placeholder };
    } else {
      this._megaZoomAnchor = null;
    }

    card.closest('.hand-card')?.classList.add('hand-card-mega-zoom');
    layer.appendChild(card);

    card.classList.add('card-mega-zoom');
    card.style.setProperty('--mega-left', `${rect.left}px`);
    card.style.setProperty('--mega-top', `${rect.top}px`);
    card.style.setProperty('--mega-width', `${rect.width}px`);
    card.style.setProperty('--mega-left-active', `${leftActive}px`);
    card.style.setProperty('--mega-top-active', `${topActive}px`);
    card.style.setProperty('--mega-final-w', `${finalW}px`);

    this._megaZoomActiveCard = card;

    const suppressLeaveMs = RULES.ui?.cardMegaZoomSuppressLeaveMs ?? 480;
    requestAnimationFrame(() => {
      if (!card.isConnected) {
        this.clearCardMegaZoom();
        return;
      }
      card.classList.add('card-mega-zoom-active');
      this.clampCardMegaZoomViewport(card);
      this._megaZoomSuppressTimer = setTimeout(() => {
        this._megaZoomSuppressLeave = false;
      }, suppressLeaveMs);
    });
  }

  clampCardMegaZoomViewport(card) {
    const rect = card.getBoundingClientRect();
    if (rect.bottom <= window.innerHeight - 8) return;
    const top = Math.max(8, window.innerHeight - rect.height - 8);
    card.style.setProperty('--mega-top-active', `${top}px`);
  }

  clearCardMegaZoom(opts = {}) {
    clearTimeout(this._megaZoomTimer);
    this._megaZoomTimer = null;
    clearTimeout(this._megaZoomSuppressTimer);
    this._megaZoomSuppressTimer = null;
    this.cancelCardMegaZoomLeave();
    if (!opts.keepTarget) this._megaZoomTarget = null;
    this._megaZoomSuppressLeave = false;

    const card = this._megaZoomActiveCard || this.els.game?.querySelector('.card.card-mega-zoom');
    if (!card) {
      this._megaZoomAnchor = null;
      return;
    }

    card.classList.remove('card-mega-zoom-active', 'card-mega-zoom');
    for (const prop of [
      '--mega-left',
      '--mega-top',
      '--mega-width',
      '--mega-left-active',
      '--mega-top-active',
      '--mega-final-w',
    ]) {
      card.style.removeProperty(prop);
    }
    card.closest('.hand-card')?.classList.remove('hand-card-mega-zoom');

    const anchor = this._megaZoomAnchor;
    const canRestore = !opts.discard && anchor?.parent?.isConnected;
    if (canRestore) {
      anchor.parent.insertBefore(card, anchor.next);
    } else if (card.isConnected) {
      card.remove();
    }
    anchor?.placeholder?.remove();
    this._megaZoomAnchor = null;
    this._megaZoomActiveCard = null;
  }

  /** Drop mega-zoom nodes before board/hand re-render (avoids fixed cards stuck on screen). */
  resetCardMegaZoomForRender() {
    this.clearCardMegaZoom({ discard: true });
    const host = this.els.game;
    if (!host) return;
    host.querySelectorAll('.card-mega-zoom-placeholder').forEach((node) => node.remove());
    host.querySelector('#card-mega-zoom-layer')?.querySelectorAll('.card').forEach((node) => node.remove());
  }

  updateSoundButton(muted = this.audio?.isMuted()) {
    const btn = this.els.btnSound;
    if (!btn) return;
    const off = !!muted;
    btn.textContent = off ? 'Son (off)' : 'Son';
    btn.classList.toggle('muted', off);
    btn.setAttribute('aria-pressed', off ? 'true' : 'false');
  }

  bindEngine() {
    this.engine.onFeedback = (msg, type) => {
      this.showBanner(msg, type);
      this.playFeedbackSound(type);
    };
    this.engine.onStateChange = (state) => this.render(state);
    if (this.engine.state) this.render(this.engine.state);
    this.engine.onAnimation = (type, data) => {
      this.playAnimSound(type, data);
      this.playAnim(type, data);
    };
  }

  playFeedbackSound(type) {
    const a = this.audio;
    if (!a) return;
    if (type === 'coin') a.playCoin();
    else if (type === 'turn') a.playTurn();
    else if (type === 'win') a.playWin();
  }

  playAnimSound(type, data = {}) {
    const a = this.audio;
    if (!a) return;
    switch (type) {
      case 'attackHit': {
        const fxId = getAttackFxId(data.attackerCardId, data.attackName);
        const isAiorPlasmaAttack = fxId === 'aior-plasma' || /plasma/i.test(String(data.attackName ?? ''));
        const isAiorFireballAttack = fxId === 'aior-fireball';
        const isHyogaDiamondDustAttack =
          fxId === 'hyoga-diamond-dust' ||
          /poussi[eè]re.*diamant|poussi\s*re.*diamant/i.test(String(data.attackName ?? ''));
        const isShiryuColereDragonAttack =
          fxId === 'dragon-wrath' ||
          (/col[eè]re.*dragon|col\s*re.*dragon|fureur.*dragon/i.test(String(data.attackName ?? '')) &&
            /^shiryu/i.test(String(data.attackerCardId ?? '')));
        const isDocratesMeteoresHerculeAttack =
          fxId === 'docrates-meteores-hercule' ||
          /m[eé]t[eé]ore.*hercule|hercule.*m[eé]t[eé]ore/i.test(String(data.attackName ?? ''));
        const isMiloScarletNeedleAttack =
          fxId === 'milo-scarlet-needle' ||
          (/aiguille.*[eé]carlate/i.test(String(data.attackName ?? '')) &&
            /^milo/i.test(String(data.attackerCardId ?? '')));
        const isMiloAntaresAttack =
          fxId === 'milo-antares' ||
          (/antar[eè]s/i.test(String(data.attackName ?? '')) &&
            /^milo/i.test(String(data.attackerCardId ?? '')));
        const isHyogaDawnThunderAttack =
          fxId === 'hyoga-dawn-thunder' ||
          (/tonnerre de l['']?aube/i.test(String(data.attackName ?? '')) &&
            /^hyoga/i.test(String(data.attackerCardId ?? '')));
        const isGreatHornAttack =
          fxId === 'aldebaran-great-horn' ||
          /corne.*taureau|great\s*horn|grand\s*horn/i.test(String(data.attackName ?? ''));
        const isShinaThunderClawAttack =
          fxId === 'shina-thunder-claw' ||
          (/griffes du tonnerre|thunder\s*claw/i.test(String(data.attackName ?? '')) &&
            /^shina/i.test(String(data.attackerCardId ?? '')));
        const isIchiComboGriffeAttack =
          fxId === 'ichi-combo-griffe' ||
          (/combo griffes/i.test(String(data.attackName ?? '')) &&
            /^bronze_ichi/i.test(String(data.attackerCardId ?? '')));
        const isShuraExcaliburAttack =
          fxId === 'shura-excalibur' ||
          (/excalibur/i.test(String(data.attackName ?? '')) &&
            /^shura/i.test(String(data.attackerCardId ?? '')));
        const isMuSpiralStellaireAttack =
          fxId === 'mu-spiral-stellaire' ||
          (/spirale stellaire/i.test(String(data.attackName ?? '')) &&
            /^mu/i.test(String(data.attackerCardId ?? '')));
        const isKagahoAnkhSacrificielleAttack =
          fxId === 'kagaho-ankh-sacrificielle' ||
          (/ankh sacrificielle/i.test(String(data.attackName ?? '')) &&
            /^kagaho/i.test(String(data.attackerCardId ?? '')));
        const isMistyTourbillonLezardAttack =
          fxId === 'misty-tourbillon-lezard' ||
          (/tourbillon.*l[eé]zard|l[eé]zard.*tourbillon/i.test(String(data.attackName ?? '')) &&
            /^misty/i.test(String(data.attackerCardId ?? '')));
        const isAndromedeChaineSerpentAttack =
          fxId === 'andromede-chaine-serpent' ||
          (/cha\s*ne\s*serpent|cha[iîê].*serpent|serpent.*cha[iîê]/i.test(
            String(data.attackName ?? ''),
          ) &&
            /^andromede/i.test(String(data.attackerCardId ?? '')));
        const isShakkaTresorDuCielAttack =
          fxId === 'shakka-tresor-du-ciel' ||
          (/tr[eé]sors du ciel/i.test(String(data.attackName ?? '')) &&
            /^(shakka|shaka)/i.test(String(data.attackerCardId ?? '')));
        const isSagaExplosionGalactiqueAttack =
          fxId === 'saga-explosion-galactique' ||
          (/explosion galactique/i.test(String(data.attackName ?? '')) &&
            /^saga/i.test(String(data.attackerCardId ?? '')));
        const isPoseidonTridentRoyalAttack =
          fxId === 'poseidon-trident-royal' ||
          (/trident royal/i.test(String(data.attackName ?? '')) &&
            /^poseidon/i.test(String(data.attackerCardId ?? '')));
        const isPhoenixHoyokuAttack = fxId === 'phoenix-hoyoku-tensho';
        // Hard-guard plasma: never let default hit SFX (punch/beam) run first.
        if (isAiorPlasmaAttack) {
          const pt = getFxTiming('aior-plasma');
          const totalSec = (pt.durationMs ?? 2500) / 1000;
          a.playAiorPlasmaFile?.(Math.min(4, Math.max(2.2, totalSec)));
        }
        if (isHyogaDiamondDustAttack) {
          const ht = getFxTiming('hyoga-diamond-dust');
          const playSec = ht.audioPlaySec ?? 5;
          a.playHyogaDiamondDust?.(playSec);
        }
        if (isShiryuColereDragonAttack) {
          const dt = getFxTiming('dragon-wrath');
          const playSec = dt.audioPlaySec ?? 3;
          a.playShiryuColereDragon?.(playSec);
        }
        // Météores d'Hercule: audio from MeteorHercule.mp4 overlay (MP3 not layered).
        // Milo signature clips are started at the real FX start (runFx) to guarantee t=0 sync.
        if (isAiorFireballAttack) {
          const ft = getFxTiming('aior-fireball');
          const impactMs = (ft.prepMs ?? 450) + (ft.flightMs ?? 950);
          clearTimeout(this._aiorFireballSfxTimer);
          this._aiorFireballSfxTimer = setTimeout(() => {
            a.playFireballExplosion?.();
          }, impactMs);
        }
        const suppressDefaultHitSfx =
          (isAiorPlasmaAttack && !!a.isAiorPlasmaHitSfxSuppressed?.()) ||
          (isHyogaDiamondDustAttack && !!a.isHyogaDiamondDustHitSfxSuppressed?.()) ||
          (isShiryuColereDragonAttack && !!a.isShiryuColereDragonHitSfxSuppressed?.()) ||
          isDocratesMeteoresHerculeAttack ||
          isMiloScarletNeedleAttack ||
          isMiloAntaresAttack ||
          (isMiloAntaresAttack && !!a.isMiloAntaresHitSfxSuppressed?.()) ||
          isHyogaDawnThunderAttack ||
          isGreatHornAttack ||
          isShinaThunderClawAttack ||
          isIchiComboGriffeAttack ||
          isShuraExcaliburAttack ||
          isMuSpiralStellaireAttack ||
          isKagahoAnkhSacrificielleAttack ||
          isMistyTourbillonLezardAttack ||
          isAndromedeChaineSerpentAttack ||
          isShakkaTresorDuCielAttack ||
          isSagaExplosionGalactiqueAttack ||
          isPoseidonTridentRoyalAttack ||
          isPhoenixHoyokuAttack;
        if (
          fxId === 'pegasus-meteors' ||
          fxId === 'black-meteors' ||
          fxId === 'sagittarius-atomic-thunder' ||
          fxId === 'eagle-meteors'
        ) {
          const t = getFxTiming(fxId);
          const meteorCount = t.count ?? 42;
          a.playPegasusMeteors?.(meteorCount, {
            meteorStartSec: t.meteorStartSec ?? 3,
            staggerSec: t.staggerSec ?? 0.0603,
            fallSec: t.fallSec ?? 0.14,
            ...(t.audioPlaySec != null ? { audioPlaySec: t.audioPlaySec } : {}),
          });
        } else if (fxId === 'dragon-wrath') {
          // Colère du Dragon clip started above via hard guard.
        } else if (fxId === 'docrates-meteores-hercule') {
          // MeteorHercule.mp4 carries attack audio; default hit SFX suppressed above.
        } else if (fxId === 'milo-scarlet-needle') {
          // Aiguille Écarlate clip started above via hard guard.
          if (data.deferDamage) {
            const mn = getFxTiming('milo-scarlet-needle');
            const totalMs = mn.durationMs ?? 3900;
            const hitDmg = data.pendingDamage ?? data.damage ?? 0;
            if (hitDmg > 0) {
              setTimeout(() => a.playDamage(), totalMs);
            }
          }
        } else if (fxId === 'milo-antares') {
          // Antarès clip started above via hard guard.
        } else if (fxId === 'hyoga-dawn-thunder') {
          // Tonnerre de l'aube clip started at FX t=0 via _playSignatureAttackAudioAtFxStart.
        } else if (fxId === 'aldebaran-great-horn') {
          // CorneTaureau.mp4 audio via fx-shura-greathorn-video (unmuted, seek at videoStartSec).
        } else if (fxId === 'shina-thunder-claw') {
          // ThunderClaw.mp4 audio via fx-shina-thunder-claw-video (unmuted).
          if (data.deferDamage) {
            const st = getFxTiming('shina-thunder-claw');
            const impactAt = st.impactAtMs ?? 4200;
            const hitDmg = data.pendingDamage ?? data.damage ?? 0;
            if (hitDmg > 0) {
              setTimeout(() => a.playDamage(), impactAt);
            }
          }
        } else if (fxId === 'ichi-combo-griffe') {
          // KataCobra.mp4 audio via fx-ichi-combo-griffe-video (unmuted).
          if (data.deferDamage) {
            const icg = getFxTiming('ichi-combo-griffe');
            const impactAt = icg.impactAtMs ?? 7250;
            const hitDmg = data.pendingDamage ?? data.damage ?? 0;
            if (hitDmg > 0) {
              setTimeout(() => a.playDamage(), impactAt);
            }
          }
        } else if (fxId === 'shura-excalibur') {
          // Shura2.mp4 audio via fx-shura-excalibur-video (unmuted).
          if (data.deferDamage) {
            const ex = getFxTiming('shura-excalibur');
            const impactAt = ex.impactAtMs ?? 1324;
            const hitDmg = data.pendingDamage ?? data.damage ?? 0;
            if (hitDmg > 0) {
              setTimeout(() => a.playDamage(), impactAt);
            }
          }
        } else if (fxId === 'mu-spiral-stellaire') {
          // SpiraleStellaire.mp4 audio via fx-mu-spiral-stellaire-video (unmuted).
          if (data.deferDamage) {
            const ms = getFxTiming('mu-spiral-stellaire');
            const impactAt = ms.impactAtMs ?? 4200;
            const hitDmg = data.pendingDamage ?? data.damage ?? 0;
            if (hitDmg > 0) {
              setTimeout(() => a.playDamage(), impactAt);
            }
          }
        } else if (fxId === 'kagaho-ankh-sacrificielle') {
          // Kagaho1.mp4 audio via fx-kagaho-ankh-sacrificielle-video (unmuted).
          if (data.deferDamage) {
            const kas = getFxTiming('kagaho-ankh-sacrificielle');
            const impactAt = kas.impactAtMs ?? 7320;
            const hitDmg = data.pendingDamage ?? data.damage ?? 0;
            if (hitDmg > 0) {
              setTimeout(() => a.playDamage(), impactAt);
            }
          }
        } else if (fxId === 'misty-tourbillon-lezard') {
          // Misty1.mp4 audio via fx-misty-tourbillon-lezard-video (unmuted).
          if (data.deferDamage) {
            const mtl = getFxTiming('misty-tourbillon-lezard');
            const impactAt = mtl.impactAtMs ?? 5040;
            const hitDmg = data.pendingDamage ?? data.damage ?? 0;
            if (hitDmg > 0) {
              setTimeout(() => a.playDamage(), impactAt);
            }
          }
        } else if (fxId === 'andromede-chaine-serpent') {
          // AndroNoir1.mp4 audio via fx-andromede-chaine-serpent-video (unmuted).
          if (data.deferDamage) {
            const acs = getFxTiming('andromede-chaine-serpent');
            const impactAt = acs.impactAtMs ?? 4255;
            const hitDmg = data.pendingDamage ?? data.damage ?? 0;
            if (hitDmg > 0) {
              setTimeout(() => a.playDamage(), impactAt);
            }
          }
        } else if (fxId === 'shakka-tresor-du-ciel') {
          // Shakka1.mp4 audio via fx-shakka-tresor-du-ciel-video (unmuted).
          if (data.deferDamage) {
            const skc = getFxTiming('shakka-tresor-du-ciel');
            const impactAt = skc.impactAtMs ?? 10832;
            const hitDmg = data.pendingDamage ?? data.damage ?? 0;
            if (hitDmg > 0) {
              setTimeout(() => a.playDamage(), impactAt);
            }
          }
        } else if (fxId === 'saga-explosion-galactique') {
          // Saga1.mp4 audio via fx-saga-explosion-galactique-video (unmuted).
          if (data.deferDamage) {
            const seg = getFxTiming('saga-explosion-galactique');
            const impactAt = seg.impactAtMs ?? 7947;
            const hitDmg = data.pendingDamage ?? data.damage ?? 0;
            if (hitDmg > 0) {
              setTimeout(() => a.playDamage(), impactAt);
            }
          }
        } else if (fxId === 'poseidon-trident-royal') {
          // Trident.mp4 / TridentCourt.mp4 audio via fx-poseidon-trident-royal-video (unmuted).
          if (data.deferDamage) {
            const ptr = poseidonTridentRoyalTiming(
              getFxTiming('poseidon-trident-royal'),
              data.attackLethal !== false,
            );
            const impactAt = ptr.impactAtMs ?? 4880;
            const hitDmg = data.pendingDamage ?? data.previewDamage ?? data.damage ?? 0;
            if (hitDmg > 0) {
              setTimeout(() => a.playDamage(), impactAt);
            }
          }
        } else if (fxId === 'phoenix-hoyoku-tensho' && data.deferDamage) {
          const pt = getFxTiming('phoenix-hoyoku-tensho');
          const concentrationMs = pt.concentrationMs ?? 5000;
          const stormMs = pt.stormMs ?? pt.burstMs ?? 10000;
          const fadeOutMs = Math.max(1000, pt.fadeOutMs ?? 1500);
          const totalMs = pt.durationMs ?? concentrationMs + stormMs + fadeOutMs;
          const hitDmg = data.pendingDamage ?? data.damage ?? 0;
          if (hitDmg > 0) {
            setTimeout(() => a.playDamage(), Math.max(0, totalMs));
          }
        } else if (fxId === 'aior-plasma') {
          // Already started above via hard plasma guard.
        } else if (fxId === 'hyoga-diamond-dust') {
          if (data.deferDamage) {
            const ht = getFxTiming('hyoga-diamond-dust');
            const p1 = ht.phase1Ms ?? 600;
            const p2 = ht.phase2Ms ?? 700;
            const p3 = ht.phase3Ms ?? 1700;
            const p4 = ht.phase4Ms ?? 500;
            const dmgMs = p1 + p2 + p3 + p4 * 0.25;
            const hitDmg = data.pendingDamage ?? data.damage ?? 0;
            if (hitDmg > 0) {
              setTimeout(() => a.playDamage(), dmgMs);
            }
          }
        } else if (fxId === 'dragon-wrath' && data.deferDamage) {
          const dt = getFxTiming('dragon-wrath');
          const p1 = dt.phase1Ms ?? 700;
          const p2 = dt.phase2Ms ?? 800;
          const p3 = dt.phase3Ms ?? 1000;
          const p4 = dt.phase4Ms ?? 400;
          const dmgMs = p1 + p2 + p3 + p4 * 0.28;
          const hitDmg = data.pendingDamage ?? data.damage ?? 0;
          if (hitDmg > 0) {
            setTimeout(() => a.playDamage(), dmgMs);
          }
        } else if (fxId === 'docrates-meteores-hercule' && data.deferDamage) {
          const dm = getFxTiming('docrates-meteores-hercule');
          const p1 = dm.phase1Ms ?? 12000;
          const p2 = dm.phase2Ms ?? 620;
          const p3 = dm.phase3Ms ?? 700;
          const p4 = dm.phase4Ms ?? 780;
          const dmgMs = p1 + p2 + p3 + Math.floor(p4 * 0.82);
          const hitDmg = data.pendingDamage ?? data.damage ?? 0;
          if (hitDmg > 0) {
            setTimeout(() => a.playDamage(), dmgMs);
          }
        } else if (fxId === 'aior-fireball') {
          // Fireball uses impact-timed explosion SFX, so skip start-hit SFX.
        } else if (fxId === 'medusa-shield') {
          const mt = getFxTiming('medusa-shield');
          const revealSec = mt.revealSec ?? 2.5;
          const whiteFlash = mt.whiteFlashSec ?? 0.35;
          const totalSec = mt.totalSec ?? medusaFxTotalSec(mt);
          a.playMedusaShield?.({
            revealSec,
            totalSec,
            eyeFlashStartSec: mt.eyeFlashStartSec ?? revealSec * 0.74,
            eyeFlashSec: mt.eyeFlashSec ?? 0.65,
            whiteFlashStartSec: medusaWhiteStartSec(mt),
            whiteFlashSec: whiteFlash,
          });
          if (data.deferDamage) {
            const hitDmg = data.pendingDamage ?? data.damage ?? 0;
            if (hitDmg > 0) {
              const dmgMs = totalSec * 0.88 * 1000;
              setTimeout(() => a.playDamage(), dmgMs);
            }
          }
        } else {
          if (!suppressDefaultHitSfx) {
            const melee = isMeleeAttack(data.attackerCardId, data.attackName);
            if (melee) a.playPunch();
            else a.playBeamRay();
          }
        }
        if (!data.deferDamage) {
          const hitDmg = data.pendingDamage ?? data.damage ?? 0;
          if (
            hitDmg > 0 &&
            !isGreatHornAttack &&
            !isShinaThunderClawAttack &&
            !isMuSpiralStellaireAttack &&
            !isKagahoAnkhSacrificielleAttack &&
            !isMiloAntaresAttack &&
            !isMiloScarletNeedleAttack
          ) {
            a.playDamage();
          }
        }
        break;
      }
      case 'drawReveal':
        a.playDraw();
        break;
      case 'prizeTake':
      case 'prizeReveal':
        a.playDraw();
        a.playPrizeChime();
        break;
      case 'turnStartBanner':
        a.playTurn();
        break;
      case 'coinFlip':
        a.playCoin();
        break;
      case 'attachEnergy':
        a.playMagicEnergy();
        break;
      case 'heal':
        a.playHeal();
        break;
      case 'ko':
        a.playKO();
        break;
      case 'prize':
        a.playPrizeChime();
        break;
      case 'damage':
        if (!data.skipSound) a.playDamage();
        break;
      case 'playCard':
      case 'supporter':
      case 'objet':
      case 'retreat':
        a.playCardPlay();
        break;
      case 'evolution':
        a.playPromote();
        break;
      case 'stadium':
        a.playCardPlay();
        break;
      default:
        break;
    }
  }

  showBanner(text, type = 'info') {
    this.els.banner.textContent = repairFrenchDisplayText(text);
    this.els.bannerWrap.dataset.type = type;
    this.els.bannerWrap.classList.remove('pulse');
    void this.els.bannerWrap.offsetWidth;
    this.els.bannerWrap.classList.add('pulse');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(
      () => this.els.bannerWrap.classList.remove('pulse'),
      RULES.ui?.bannerPulseMs ?? 1000
    );
  }

  playAnim(type, data = {}) {
    if (type === 'attackHit') {
      this.playAttackSequence(data);
      return;
    }
    if (type === 'attackResult') {
      void this.showAttackResultSplash(
        data.attackName,
        data.label,
        data.resultSummary ?? '',
        data.damage ?? 0,
      ).then(() => {
        this.engine?.notifyAttackResultComplete?.();
      });
      return;
    }
    if (type === 'drawReveal' || type === 'prizeTake' || type === 'prizeReveal') {
      this.queueDrawReveal(data);
      return;
    }
    if (type === 'attachEnergy') {
      this.playAttachEnergyAnim(data);
      return;
    }
    if (type === 'heal') {
      this.playHealAnim(data);
      return;
    }
    if (type === 'turnStartBanner') {
      this.showTurnStartBanner(data.playerIndex ?? 0);
      return;
    }
    if (type === 'coinFlip') {
      void this.queueCoinFlipOverlay(data).then(() => {
        this.engine?.notifyCoinFlipComplete?.();
      });
      return;
    }
    if (type === 'stadiumEffect') {
      this.playStadiumEffectAnim(data);
      return;
    }
    if (type === 'outil' && data.fx === 'athena_blood') {
      this.playAthenaBloodAnim(data);
      return;
    }
    if (type === 'damage') {
      this.playDamageAnim(data);
      return;
    }
    if (type === 'murCrystalDefense') {
      this.playMurCrystalDefenseAnim(data);
      return;
    }
    if (type === 'ko') {
      this.playKoAnim(data);
      return;
    }
    document.body.dataset.anim = type;
    setTimeout(() => {
      document.body.dataset.anim = '';
    }, data.duration ?? RULES.ui?.genericAnimMs ?? 750);
  }

  queueDrawReveal(data) {
    this.revealQueue.push(data);
    if (!this.revealPlaying) this.pumpDrawRevealQueue();
  }

  pumpDrawRevealQueue() {
    const next = this.revealQueue.shift();
    if (!next) {
      this.revealPlaying = false;
      return;
    }
    this.revealPlaying = true;
    const burst = !!next.burst || this.revealQueue.length > 0;
    this.showDrawReveal(next, () => {
      const gapMs = this.revealQueue.length
        ? burst
          ? next.burst
            ? this.drawBurstGapMs(next.playerIndex ?? 0)
            : (RULES.ui?.drawQueueBurstGapMs ?? RULES.ui?.drawQueueGapMs ?? 55)
          : (RULES.ui?.drawQueueGapMs ?? 120)
        : 0;
      setTimeout(() => this.pumpDrawRevealQueue(), gapMs);
    }, { burst });
  }

  drawBurstGapMs(playerIndex) {
    return playerIndex === 1
      ? (RULES.ui?.drawBurstAiGapMs ?? 40)
      : (RULES.ui?.drawBurstGapMs ?? 50);
  }

  showDrawReveal(data, onDone, opts = {}) {
    const cardId = typeof data === 'string' ? data : data?.cardId;
    const playerIndex = typeof data === 'object' && data != null ? (data.playerIndex ?? 0) : 0;
    if (!cardId || !this.els.cardReveal || !this.els.cardRevealSlot) {
      onDone?.();
      return;
    }
    const hideFace =
      this.gameMode === 'ai' ? playerIndex === 1 : !this.isBottomPlayer(playerIndex);
    const burst = !!opts.burst || !!data?.burst;
    let centerMs;
    let flyMs;
    if (burst && data?.perCardMs > 0) {
      const totalMs = data.perCardMs;
      centerMs = Math.max(40, Math.round(totalMs * 0.28));
      flyMs = Math.max(40, totalMs - centerMs);
    } else {
      centerMs = burst
        ? hideFace
          ? (RULES.ui?.drawQueueBurstAiCenterMs ?? 140)
          : (RULES.ui?.drawQueueBurstCenterMs ?? 200)
        : hideFace
          ? (RULES.ui?.drawRevealAiCenterMs ?? 220)
          : (RULES.ui?.drawRevealCenterMs ?? 380);
      flyMs = burst
        ? hideFace
          ? (RULES.ui?.drawQueueBurstAiFlyMs ?? 280)
          : (RULES.ui?.drawQueueBurstFlyMs ?? 380)
        : hideFace
          ? (RULES.ui?.drawRevealAiFlyMs ?? 650)
          : (RULES.ui?.drawRevealFlyMs ?? 850);
    }
    const totalMs = centerMs + flyMs;
    const scale = RULES.ui?.cardDrawRevealScale ?? 3;

    this.els.cardRevealSlot.innerHTML = '';
    const card = hideFace
      ? this.createCardBackElement()
      : this.createCardElement(cardId, null, false);
    card.classList.add('draw-reveal-card', 'draw-reveal-center');
    card.style.setProperty('--reveal-scale', String(scale));
    card.style.setProperty('--draw-center-ms', `${centerMs}ms`);
    card.style.setProperty('--draw-fly-ms', `${flyMs}ms`);
    this.els.cardRevealSlot.appendChild(card);

    this.els.cardReveal.classList.remove('hidden');
    this.els.cardReveal.classList.add('show');
    clearTimeout(this.drawRevealFlyTimer);
    clearTimeout(this.drawRevealTimer);

    this.drawRevealFlyTimer = setTimeout(() => {
      this.els.cardReveal.classList.add('draw-reveal-flying');
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const flew = this.applyDrawRevealFlyOffsets(card, playerIndex);
          if (!flew) {
            card.classList.remove('draw-reveal-center');
            card.classList.add(
              this.isBottomPlayer(playerIndex)
                ? 'draw-reveal-fly-to-player'
                : 'draw-reveal-fly-to-opponent'
            );
          }
        });
      });
    }, centerMs);

    this.drawRevealTimer = setTimeout(() => {
      this.els.cardReveal.classList.remove('show', 'draw-reveal-flying');
      this.els.cardReveal.classList.add('hidden');
      this.els.cardRevealSlot.innerHTML = '';
      onDone?.();
    }, totalMs);
  }

  getDrawRevealTargetEl(playerIndex) {
    if (this.isBottomPlayer(playerIndex)) {
      return this.els.handZone || this.els.hand?.closest('.hand-zone') || this.els.hand;
    }
    return this.els.oppDeck || this.root.querySelector('.opp-deck');
  }

  applyDrawRevealFlyOffsets(card, playerIndex) {
    const targetEl = this.getDrawRevealTargetEl(playerIndex);
    if (!targetEl || !card) return false;

    const frozen = getComputedStyle(card).transform;
    if (frozen && frozen !== 'none') {
      card.style.transform = frozen;
    }
    card.classList.remove('draw-reveal-center');
    void card.offsetWidth;

    const cardRect = card.getBoundingClientRect();
    const targetRect = targetEl.getBoundingClientRect();
    if (cardRect.width < 1 || targetRect.width < 1) return false;

    const cardCx = cardRect.left + cardRect.width / 2;
    const cardCy = cardRect.top + cardRect.height / 2;
    const targetCx = targetRect.left + targetRect.width / 2;
    const targetCy = targetRect.top + targetRect.height / 2;

    const dx = targetCx - cardCx;
    const dy = targetCy - cardCy;

    const rootStyle = getComputedStyle(document.documentElement);
    const baseW = parseFloat(rootStyle.getPropertyValue('--card-w')) || 148;
    const handW = parseFloat(rootStyle.getPropertyValue('--hand-card-w')) || 120;
    const endW = this.isBottomPlayer(playerIndex) ? handW : targetRect.width * 0.92;
    const flyScaleStart = cardRect.width / baseW;
    const flyScaleEnd = Math.max(0.12, Math.min(1.2, endW / cardRect.width));

    card.style.removeProperty('transform');
    card.style.setProperty('--fly-dx', `${dx}px`);
    card.style.setProperty('--fly-dy', `${dy}px`);
    card.style.setProperty('--fly-scale-start', String(flyScaleStart));
    card.style.setProperty('--fly-scale-end', String(flyScaleEnd));
    card.classList.add('draw-reveal-fly-dynamic');
    return true;
  }

  findKnightWrapByInstanceId(instanceId) {
    if (!instanceId || !this.els.game) return null;
    return this.els.game.querySelector(`[data-instance-id="${instanceId}"]`);
  }

  playDamageAnim(data = {}) {
    if (data.skipShake) return;
    const wrap = this.findKnightWrapByInstanceId(data.knightId);
    const card = wrap?.querySelector('.card') || wrap;
    if (!card) return;
    card.classList.add('damage-hit');
    const ms = RULES.ui?.damageFxMs ?? 520;
    setTimeout(() => card.classList.remove('damage-hit'), ms);
  }

  playKoAnim(data = {}) {
    if (data.fieldRemoved) {
      this.showBanner(`${repairFrenchDisplayText(getCardDef(data.cardId)?.name || 'Chevalier')} — KO !`, 'ko');
      return;
    }
    const wrap = this.findKnightWrapByInstanceId(data.knightId ?? data.instanceId);
    const card = wrap?.querySelector('.card') || wrap;
    if (!card) return;
    card.classList.add('ko-hit');
    const ms = RULES.ui?.koFxMs ?? RULES.ui?.genericAnimMs ?? 1550;
    clearTimeout(this._koFxTimer);
    this._koFxTimer = setTimeout(() => card.classList.remove('ko-hit'), ms);
  }

  playMurCrystalDefenseAnim(data = {}) {
    const wrap = this.findKnightWrapByInstanceId(data.knightInstanceId);
    const card = wrap?.querySelector('.card') || wrap;
    if (!card) return;
    const isFace = data.coin === RULES.coin.heads;
    card.classList.add(isFace ? 'mur-crystal-block' : 'mur-crystal-reduce');
    this.audio?.playCoin?.();
    const ms = RULES.ui?.damageFxMs ?? 520;
    setTimeout(() => card.classList.remove('mur-crystal-block', 'mur-crystal-reduce'), ms + 200);
  }

  getKnightSlotEl(target, playerIndex = 0) {
    const isPlayer = this.isBottomPlayer(playerIndex);
    if (target === 'active') {
      return isPlayer ? this.els.playerActive : this.els.oppActive;
    }
    if (typeof target === 'number') {
      const bench = isPlayer ? this.els.playerBench : this.els.oppBench;
      return bench?.children[target] || null;
    }
    return null;
  }

  playAttachEnergyAnim(data) {
    requestAnimationFrame(() => requestAnimationFrame(() => this.runAttachEnergyAnim(data)));
  }

  runAttachEnergyAnim(data) {
    const { cardId, target, playerIndex = 0, fromDeck } = data;
    const slot = this.getKnightSlotEl(target, playerIndex);
    slot?.classList.add('energy-attach-burst');
    const wrap = slot?.querySelector('.knight-wrap') || slot?.querySelector('.card')?.parentElement || slot;
    wrap?.classList.add('energy-attach-burst');

    if (this.els.energyFx) {
      const def = getCardDef(cardId);
      this.els.energyFx.textContent = fromDeck ? `⚡ ${def?.name || 'Énergie'} (deck)` : `⚡ ${def?.name || 'Énergie'}`;
      this.els.energyFx.classList.remove('hidden');
      this.els.energyFx.classList.add('show');
    }

    this.els.game?.classList.add('energy-play');
    clearTimeout(this.energyFxTimer);
    this.energyFxTimer = setTimeout(() => {
      slot?.classList.remove('energy-attach-burst');
      wrap?.classList.remove('energy-attach-burst');
      this.els.energyFx?.classList.remove('show');
      this.els.energyFx?.classList.add('hidden');
      this.els.game?.classList.remove('energy-play');
    }, RULES.ui?.attachEnergyFxMs ?? 950);
  }

  playHealAnim(data) {
    requestAnimationFrame(() => requestAnimationFrame(() => this.runHealAnim(data)));
  }

  playStadiumEffectAnim(data) {
    const { effectId = '', steps = [], duration = 1000 } = data;
    const layer = this.els.attackFxLayer;
    if (!layer || effectId !== 'elysion_judgement') {
      document.body.dataset.anim = 'stadium';
      setTimeout(() => {
        document.body.dataset.anim = '';
      }, duration);
      return;
    }

    const stepMarkup = (steps.length ? steps : [
      'heavenly_light',
      'white_particles_fall',
      'gold_wave_crosses_field',
      'damage_flash',
    ])
      .map((step) => `<span class="fx-elysion-step fx-elysion-${step}"></span>`)
      .join('');

    layer.innerHTML = `<div class="fx-elysion-judgement">${stepMarkup}</div>`;
    layer.className = 'attack-fx-layer show fx-elysion-judgement';
    layer.setAttribute('aria-hidden', 'false');
    this.els.game?.classList.add('elysion-judgement-play');

    const durationMs = stadiumFxDurationMs(effectId, duration);
    clearTimeout(this._stadiumFxTimer);
    this._stadiumFxTimer = setTimeout(() => {
      layer.className = 'attack-fx-layer';
      layer.innerHTML = '';
      layer.setAttribute('aria-hidden', 'true');
      this.els.game?.classList.remove('elysion-judgement-play');
    }, durationMs);
  }

  playAthenaBloodAnim(data) {
    const { steps = [], duration = 3000, target, playerIndex = 0 } = data;
    const layer = this.els.attackFxLayer;
    const slot = this.getKnightSlotEl(target, playerIndex);

    const stepList = steps.length
      ? steps
      : [
          'blood_drop_falls',
          'golden_explosion',
          'light_wings_appear',
          'hp_increase_effect',
          'golden_aura_persistent',
        ];
    const stepMarkup = stepList
      .map((step) => `<span class="fx-athena-step fx-athena-${step}"></span>`)
      .join('');

    if (layer) {
      layer.innerHTML = `<div class="fx-athena-blood">${stepMarkup}</div>`;
      layer.className = 'attack-fx-layer show fx-athena-blood';
      layer.setAttribute('aria-hidden', 'false');
    }

    slot?.classList.add('athena-blood-target');
    this.els.game?.classList.add('athena-blood-play');

    const durationMs = stadiumFxDurationMs('athena_blood', duration);
    clearTimeout(this._athenaBloodFxTimer);
    this._athenaBloodFxTimer = setTimeout(() => {
      if (layer) {
        layer.className = 'attack-fx-layer';
        layer.innerHTML = '';
        layer.setAttribute('aria-hidden', 'true');
      }
      slot?.classList.remove('athena-blood-target');
      this.els.game?.classList.remove('athena-blood-play');
    }, durationMs);
  }

  runHealAnim(data) {
    const { amount, target, playerIndex = 0, cardId } = data;
    const slot = this.getKnightSlotEl(target, playerIndex);
    slot?.classList.add('heal-pulse');
    const wrap = slot?.querySelector('.knight-wrap') || slot;
    wrap?.classList.add('heal-pulse');

    if (this.els.healSplash) {
      const name = getCardDef(cardId)?.name || 'Chevalier';
      this.els.healSplash.textContent = `+${amount} PV — ${name}`;
      this.els.healSplash.classList.remove('hidden');
      this.els.healSplash.classList.add('show');
    }

    this.els.game?.classList.add('heal-play');
    clearTimeout(this.healFxTimer);
    this.healFxTimer = setTimeout(() => {
      slot?.classList.remove('heal-pulse');
      wrap?.classList.remove('heal-pulse');
      this.els.healSplash?.classList.remove('show');
      this.els.healSplash?.classList.add('hidden');
      this.els.game?.classList.remove('heal-play');
    }, RULES.ui?.healFxMs ?? 950);
  }

  playAttackSequence(data) {
    const {
      attackName,
      damage,
      label,
      description = '',
      playerIndex = 0,
      attackerCardId,
      headsCount = 0,
      coin = null,
      deferDamage = false,
      visualOnly = false,
      resultSummary = '',
      discardedEnergyCount = 0,
      previewDamage,
      attackLethal: attackLethalIn,
    } = data;
    let splashDamage = data.pendingDamage ?? previewDamage ?? damage;
    let splashResults = resultSummary;

    const isPlayer = this.isBottomPlayer(playerIndex);
    const attackerField = isPlayer ? this.els.playerField : this.els.oppField;
    const attackerSlot = isPlayer ? this.els.playerActive : this.els.oppActive;
    const defenderSlot = isPlayer ? this.els.oppActive : this.els.playerActive;
    const fxId = getAttackFxId(attackerCardId, attackName);

    let attackLethal = attackLethalIn;
    if (attackLethal == null && fxId === 'poseidon-trident-royal') {
      const oppActive = this.engine?.state?.players?.[1 - playerIndex]?.active;
      const dmgPreview = previewDamage ?? data.pendingDamage ?? damage ?? 0;
      if (oppActive && dmgPreview > 0) {
        attackLethal = dmgPreview >= oppActive.currentHp;
      }
    }

    if (fxId === 'aior-fireball') {
      defenderSlot?.querySelector('.card')?.classList.remove('damage-hit');
    }

    const runFx = () => {
      this._playSignatureAttackAudioAtFxStart(fxId, data);
      const fxDone = this.playThemedAttackFx(fxId, {
        isPlayer,
        headsCount,
        coin,
        damage,
        defenderSlot,
        attackerSlot,
        discardedEnergyCount,
        attackLethal,
      });

      this.els.game?.classList.add('battle-attack');
      if (this.els.game) this.els.game.dataset.attackFx = fxId;
      if (fxId === 'aior-plasma') {
        attackerSlot?.classList.add('aior-attacker-charge');
        defenderSlot?.classList.add('defender-plasma-barrage');
      } else if (fxId === 'hyoga-diamond-dust') {
        attackerSlot?.classList.add('hyoga-attacker-charge');
        defenderSlot?.classList.add('defender-hyoga-storm');
        const ht = getFxTiming('hyoga-diamond-dust');
        const p1 = ht.phase1Ms ?? 600;
        const p2 = ht.phase2Ms ?? 700;
        const p3 = ht.phase3Ms ?? 1700;
        const p4 = ht.phase4Ms ?? 500;
        const totalMs = ht.durationMs ?? p1 + p2 + p3 + p4;
        const encaseAt = p1 + p2 + p3 - 180;
        const shakeAt = p1 + p2 + Math.floor(p3 * 0.78);
        this.els.game?.style.setProperty('--hyoga-total', `${totalMs / 1000}s`);
        clearTimeout(this._hyogaDiamondDustEncaseTimer);
        clearTimeout(this._hyogaDiamondDustShakeTimer);
        this._hyogaDiamondDustEncaseTimer = setTimeout(() => {
          defenderSlot?.classList.remove('defender-hyoga-storm');
          defenderSlot?.classList.add('defender-hyoga-encased');
        }, encaseAt);
        this._hyogaDiamondDustShakeTimer = setTimeout(() => {
          this.els.game?.classList.add('hyoga-board-shake');
        }, shakeAt);
      } else if (fxId === 'dragon-wrath') {
        attackerSlot?.classList.add('shiryu-attacker-charge');
        const dt = getFxTiming('dragon-wrath');
        const p1 = dt.phase1Ms ?? 700;
        const p2 = dt.phase2Ms ?? 800;
        const p3 = dt.phase3Ms ?? 1000;
        const p3Strike = dt.phase3StrikeMs ?? Math.round(p3 * 0.52);
        const impactAt = p1 + p2 + Math.floor(p3Strike * 0.92);
        clearTimeout(this._dragonWrathShakeTimer);
        clearTimeout(this._dragonWrathHitTimer);
        this._dragonWrathShakeTimer = setTimeout(() => {
          this.els.game?.classList.add('dragon-wrath-board-shake');
        }, impactAt);
        this._dragonWrathHitTimer = setTimeout(() => {
          defenderSlot?.classList.add('defender-hit');
        }, impactAt);
      } else if (fxId === 'docrates-meteores-hercule') {
        attackerSlot?.classList.add('docrates-attacker-charge');
        const dm = getFxTiming('docrates-meteores-hercule');
        const p1 = dm.phase1Ms ?? 12000;
        const p2 = dm.phase2Ms ?? 620;
        const impactAt = p1 + p2 + 48;
        clearTimeout(this._docratesMeteoresShakeTimer);
        clearTimeout(this._docratesMeteoresHitTimer);
        this._docratesMeteoresShakeTimer = setTimeout(() => {
          this.els.game?.classList.add('docrates-meteores-board-shake');
        }, impactAt);
        this._docratesMeteoresHitTimer = setTimeout(() => {
          defenderSlot?.classList.add('defender-hit');
        }, impactAt);
      } else if (fxId === 'milo-scarlet-needle') {
        attackerSlot?.classList.add('milo-attacker-glow');
        const mn = getFxTiming('milo-scarlet-needle');
        const glowMs = mn.phase1GlowMs ?? 2000;
        const fadeOutMs = mn.fadeOutMs ?? 1000;
        const totalMs = mn.durationMs ?? 3900;
        const fadeStartMs = Math.max(0, totalMs - fadeOutMs);
        this.els.game?.style.setProperty('--milo-glow', `${glowMs / 1000}s`);
        this.els.game?.style.setProperty('--milo-needle-total', `${totalMs / 1000}s`);
        this.els.game?.style.setProperty('--milo-fade-at', `${fadeStartMs / 1000}s`);
        this.els.game?.style.setProperty('--milo-fade-out', `${fadeOutMs / 1000}s`);
      } else if (fxId === 'milo-antares') {
        const ma = getFxTiming('milo-antares');
        const impactAt = ma.impactAtMs ?? ma.windupMs ?? 950;
        const hitDmg = splashDamage ?? damage ?? 0;
        clearTimeout(this._miloAntaresShakeTimer);
        clearTimeout(this._miloAntaresImpactSfxTimer);
        this._miloAntaresShakeTimer = setTimeout(() => {
          this.els.game?.classList.add('milo-antares-board-shake');
          const card = defenderSlot?.querySelector('.card');
          if (!card) return;
          card.classList.add('damage-hit');
          const ms = Math.min(RULES.ui?.damageFxMs ?? 520, 380);
          setTimeout(() => card.classList.remove('damage-hit'), ms);
        }, impactAt);
        if (hitDmg > 0) {
          this._miloAntaresImpactSfxTimer = setTimeout(() => {
            this.audio?.playDamage?.();
          }, impactAt);
        }
      } else if (fxId === 'hyoga-dawn-thunder') {
        const ht = getFxTiming('hyoga-dawn-thunder');
        const impactAt = 550;
        clearTimeout(this._hyogaDawnThunderShakeTimer);
        this._hyogaDawnThunderShakeTimer = setTimeout(() => {
          this.els.game?.classList.add('hyoga-dawn-thunder-board-shake');
          defenderSlot?.classList.add('defender-hit');
        }, impactAt);
      } else if (fxId === 'shura-excalibur') {
        const ex = getFxTiming('shura-excalibur');
        const impactAt = ex.impactAtMs ?? 1324;
        clearTimeout(this._shuraExcaliburImpactTimer);
        clearTimeout(this._shuraExcaliburShakeTimer);
        this._shuraExcaliburShakeTimer = setTimeout(() => {
          this.els.game?.classList.add('shura-excalibur-board-shake');
        }, Math.max(0, impactAt - 48));
        this._shuraExcaliburImpactTimer = setTimeout(() => {
          defenderSlot?.classList.add('defender-hit');
          const card = defenderSlot?.querySelector('.card');
          if (card) {
            card.classList.add('damage-hit');
            const ms = Math.min(RULES.ui?.damageFxMs ?? 520, 380);
            setTimeout(() => card.classList.remove('damage-hit'), ms);
          }
        }, impactAt);
      } else if (fxId === 'shura-capricorn-leap') {
        const leap = getFxTiming('shura-capricorn-leap');
        const impactAt = leap.impactAtMs ?? 1400;
        clearTimeout(this._shuraLeapImpactTimer);
        this._shuraLeapImpactTimer = setTimeout(() => {
          defenderSlot?.classList.add('defender-hit');
          const card = defenderSlot?.querySelector('.card');
          if (card) {
            card.classList.add('damage-hit');
            const ms = Math.min(RULES.ui?.damageFxMs ?? 520, 380);
            setTimeout(() => card.classList.remove('damage-hit'), ms);
          }
        }, impactAt);
      } else if (fxId === 'aldebaran-great-horn') {
        const gh = getFxTiming('aldebaran-great-horn');
        const glowMs = gh.glowMs ?? 4000;
        const chargeMs = gh.chargeMs ?? 1700;
        const impactAt =
          gh.impactAtMs ?? glowMs + Math.round(chargeMs * (gh.chargeImpactRatio ?? 0.72));
        attackerSlot?.classList.add('greathorn-attacker-glow');
        clearTimeout(this._greathornChargeTimer);
        clearTimeout(this._greathornImpactTimer);
        clearTimeout(this._greathornShakeTimer);
        this._greathornChargeTimer = setTimeout(() => {
          attackerSlot?.classList.remove('greathorn-attacker-glow');
          attackerSlot?.classList.add('greathorn-attacker-charge');
        }, glowMs);
        this._greathornShakeTimer = setTimeout(() => {
          this.els.game?.classList.add('greathorn-board-shake');
        }, Math.max(0, impactAt - 48));
        this._greathornImpactDone = false;
        this._greathornImpactTimer = setTimeout(() => {
          if (this._greathornImpactDone) return;
          this._greathornImpactDone = true;
          const ghCard = attackerSlot?.querySelector('.card');
          if (ghCard) {
            ghCard.style.visibility = 'hidden';
            ghCard.style.opacity = '0';
          }
          defenderSlot?.classList.add('defender-hit');
          const card = defenderSlot?.querySelector('.card');
          if (card) {
            card.classList.add('damage-hit');
            const ms = Math.min(RULES.ui?.damageFxMs ?? 520, 380);
            setTimeout(() => card.classList.remove('damage-hit'), ms);
          }
          const hitDmg = splashDamage ?? damage ?? 0;
          if (hitDmg > 0) this.audio?.playPunch?.();
        }, impactAt);
      } else if (fxId === 'shina-thunder-claw') {
        const st = getFxTiming('shina-thunder-claw');
        const impactAt = st.impactAtMs ?? 4200;
        clearTimeout(this._shinaThunderClawImpactTimer);
        clearTimeout(this._shinaThunderClawShakeTimer);
        this._shinaThunderClawShakeTimer = setTimeout(() => {
          this.els.game?.classList.add('shina-thunder-claw-board-shake');
        }, Math.max(0, impactAt - 48));
        this._shinaThunderClawImpactTimer = setTimeout(() => {
          defenderSlot?.classList.add('defender-hit');
          const card = defenderSlot?.querySelector('.card');
          if (card) {
            card.classList.add('damage-hit');
            const ms = Math.min(RULES.ui?.damageFxMs ?? 520, 380);
            setTimeout(() => card.classList.remove('damage-hit'), ms);
          }
        }, impactAt);
      } else if (fxId === 'ichi-combo-griffe') {
        const icg = getFxTiming('ichi-combo-griffe');
        const impactAt = icg.impactAtMs ?? 7250;
        clearTimeout(this._ichiComboGriffeImpactTimer);
        clearTimeout(this._ichiComboGriffeShakeTimer);
        this._ichiComboGriffeShakeTimer = setTimeout(() => {
          this.els.game?.classList.add('ichi-combo-griffe-board-shake');
        }, Math.max(0, impactAt - 48));
        this._ichiComboGriffeImpactTimer = setTimeout(() => {
          defenderSlot?.classList.add('defender-hit');
          const card = defenderSlot?.querySelector('.card');
          if (card) {
            card.classList.add('damage-hit');
            const ms = Math.min(RULES.ui?.damageFxMs ?? 520, 380);
            setTimeout(() => card.classList.remove('damage-hit'), ms);
          }
        }, impactAt);
      } else if (fxId === 'mu-spiral-stellaire') {
        const ms = getFxTiming('mu-spiral-stellaire');
        const impactAt = ms.impactAtMs ?? 4200;
        clearTimeout(this._muSpiralStellaireImpactTimer);
        clearTimeout(this._muSpiralStellaireShakeTimer);
        this._muSpiralStellaireShakeTimer = setTimeout(() => {
          this.els.game?.classList.add('mu-spiral-stellaire-board-shake');
        }, Math.max(0, impactAt - 48));
        this._muSpiralStellaireImpactTimer = setTimeout(() => {
          defenderSlot?.classList.add('defender-hit');
          const card = defenderSlot?.querySelector('.card');
          if (card) {
            card.classList.add('damage-hit');
            const dmgMs = Math.min(RULES.ui?.damageFxMs ?? 520, 380);
            setTimeout(() => card.classList.remove('damage-hit'), dmgMs);
          }
        }, impactAt);
      } else if (fxId === 'kagaho-ankh-sacrificielle') {
        const kas = getFxTiming('kagaho-ankh-sacrificielle');
        const impactAt = kas.impactAtMs ?? 7320;
        clearTimeout(this._kagahoAnkhSacrificielleImpactTimer);
        clearTimeout(this._kagahoAnkhSacrificielleShakeTimer);
        this._kagahoAnkhSacrificielleShakeTimer = setTimeout(() => {
          this.els.game?.classList.add('kagaho-ankh-sacrificielle-board-shake');
        }, Math.max(0, impactAt - 48));
        this._kagahoAnkhSacrificielleImpactTimer = setTimeout(() => {
          defenderSlot?.classList.add('defender-hit');
          const card = defenderSlot?.querySelector('.card');
          if (card) {
            card.classList.add('damage-hit');
            const dmgMs = Math.min(RULES.ui?.damageFxMs ?? 520, 380);
            setTimeout(() => card.classList.remove('damage-hit'), dmgMs);
          }
        }, impactAt);
      } else if (fxId === 'misty-tourbillon-lezard') {
        const mtl = getFxTiming('misty-tourbillon-lezard');
        const impactAt = mtl.impactAtMs ?? 5040;
        clearTimeout(this._mistyTourbillonLezardImpactTimer);
        clearTimeout(this._mistyTourbillonLezardShakeTimer);
        this._mistyTourbillonLezardShakeTimer = setTimeout(() => {
          this.els.game?.classList.add('misty-tourbillon-lezard-board-shake');
        }, Math.max(0, impactAt - 48));
        this._mistyTourbillonLezardImpactTimer = setTimeout(() => {
          defenderSlot?.classList.add('defender-hit');
          const card = defenderSlot?.querySelector('.card');
          if (card) {
            card.classList.add('damage-hit');
            const dmgMs = Math.min(RULES.ui?.damageFxMs ?? 520, 380);
            setTimeout(() => card.classList.remove('damage-hit'), dmgMs);
          }
        }, impactAt);
      } else if (fxId === 'andromede-chaine-serpent') {
        const acs = getFxTiming('andromede-chaine-serpent');
        const impactAt = acs.impactAtMs ?? 4255;
        clearTimeout(this._andromedeChaineSerpentImpactTimer);
        clearTimeout(this._andromedeChaineSerpentShakeTimer);
        this._andromedeChaineSerpentShakeTimer = setTimeout(() => {
          this.els.game?.classList.add('andromede-chaine-serpent-board-shake');
        }, Math.max(0, impactAt - 48));
        this._andromedeChaineSerpentImpactTimer = setTimeout(() => {
          defenderSlot?.classList.add('defender-hit');
          const card = defenderSlot?.querySelector('.card');
          if (card) {
            card.classList.add('damage-hit');
            const dmgMs = Math.min(RULES.ui?.damageFxMs ?? 520, 380);
            setTimeout(() => card.classList.remove('damage-hit'), dmgMs);
          }
        }, impactAt);
      } else if (fxId === 'shakka-tresor-du-ciel') {
        const skc = getFxTiming('shakka-tresor-du-ciel');
        const impactAt = skc.impactAtMs ?? 10832;
        clearTimeout(this._shakkaTresorDuCielImpactTimer);
        clearTimeout(this._shakkaTresorDuCielShakeTimer);
        this._shakkaTresorDuCielShakeTimer = setTimeout(() => {
          this.els.game?.classList.add('shakka-tresor-du-ciel-board-shake');
        }, Math.max(0, impactAt - 48));
        this._shakkaTresorDuCielImpactTimer = setTimeout(() => {
          defenderSlot?.classList.add('defender-hit');
          const card = defenderSlot?.querySelector('.card');
          if (card) {
            card.classList.add('damage-hit');
            const dmgMs = Math.min(RULES.ui?.damageFxMs ?? 520, 380);
            setTimeout(() => card.classList.remove('damage-hit'), dmgMs);
          }
        }, impactAt);
      } else if (fxId === 'saga-explosion-galactique') {
        const seg = getFxTiming('saga-explosion-galactique');
        const impactAt = seg.impactAtMs ?? 7947;
        clearTimeout(this._sagaExplosionGalactiqueImpactTimer);
        clearTimeout(this._sagaExplosionGalactiqueShakeTimer);
        this._sagaExplosionGalactiqueShakeTimer = setTimeout(() => {
          this.els.game?.classList.add('saga-explosion-galactique-board-shake');
        }, Math.max(0, impactAt - 48));
        this._sagaExplosionGalactiqueImpactTimer = setTimeout(() => {
          defenderSlot?.classList.add('defender-hit');
          const card = defenderSlot?.querySelector('.card');
          if (card) {
            card.classList.add('damage-hit');
            const dmgMs = Math.min(RULES.ui?.damageFxMs ?? 520, 380);
            setTimeout(() => card.classList.remove('damage-hit'), dmgMs);
          }
        }, impactAt);
      } else if (fxId === 'poseidon-trident-royal') {
        const ptr = poseidonTridentRoyalTiming(
          getFxTiming('poseidon-trident-royal'),
          attackLethal !== false,
        );
        const impactAt = ptr.impactAtMs ?? 4880;
        clearTimeout(this._poseidonTridentRoyalImpactTimer);
        clearTimeout(this._poseidonTridentRoyalShakeTimer);
        this._poseidonTridentRoyalShakeTimer = setTimeout(() => {
          this.els.game?.classList.add('poseidon-trident-royal-board-shake');
        }, Math.max(0, impactAt - 48));
        this._poseidonTridentRoyalImpactTimer = setTimeout(() => {
          defenderSlot?.classList.add('defender-hit');
          const card = defenderSlot?.querySelector('.card');
          if (card) {
            card.classList.add('damage-hit');
            const dmgMs = Math.min(RULES.ui?.damageFxMs ?? 520, 380);
            setTimeout(() => card.classList.remove('damage-hit'), dmgMs);
          }
        }, impactAt);
      } else if (fxId === 'phoenix-hoyoku-tensho') {
        const pt = getFxTiming('phoenix-hoyoku-tensho');
        const concentrationMs = pt.concentrationMs ?? 5000;
        const stormMs = pt.stormMs ?? pt.burstMs ?? 10000;
        const fadeOutMs = Math.max(1000, pt.fadeOutMs ?? 1500);
        const totalMs = pt.durationMs ?? concentrationMs + stormMs + fadeOutMs;
        const auraWindowMs = Math.min(
          totalMs - Math.max(220, Math.floor(fadeOutMs * 0.3)),
          concentrationMs + Math.floor(stormMs * 0.52),
        );
        const phoenixImpactMs = Math.max(0, totalMs - Math.min(220, Math.floor(fadeOutMs * 0.22)));
        attackerSlot?.classList.add('phoenix-attacker-concentrate');
        if (this.els.game) {
          this.els.game.style.setProperty('--phoenix-total', `${totalMs / 1000}s`);
          this.els.game.style.setProperty('--phoenix-concentration', `${concentrationMs / 1000}s`);
          this.els.game.style.setProperty('--phoenix-aura-window', `${Math.max(0, auraWindowMs) / 1000}s`);
          this.els.game.style.setProperty('--phoenix-fade-out', `${fadeOutMs / 1000}s`);
          this.els.game.style.setProperty(
            '--phoenix-fade-at',
            `${Math.max(0, totalMs - fadeOutMs) / 1000}s`,
          );
        }
        this._schedulePhoenixStormShakePulses({
          concentrationMs,
          stormMs,
          phoenixImpactMs,
          defenderSlot,
        });
        this._phoenixFinalHitTimer = setTimeout(() => {
          defenderSlot?.classList.add('defender-hit');
          const card = defenderSlot?.querySelector('.card');
          if (card) {
            card.classList.add('damage-hit');
            const ms = Math.min(RULES.ui?.damageFxMs ?? 520, 380);
            setTimeout(() => card.classList.remove('damage-hit'), ms);
          }
        }, phoenixImpactMs);
      } else if (
        !isSignatureAttackFx(fxId) &&
        fxId !== 'aior-fireball' &&
        fxId !== 'milo-scarlet-needle' &&
        fxId !== 'milo-antares'
      ) {
        attackerField?.classList.add('attacker-lunge');
        defenderSlot?.classList.add('defender-hit');
      }

      const isHeads = coin === RULES.coin.heads || coin === 'heads';
      if (fxId === 'crow-feathers' && isHeads) {
        defenderSlot?.classList.add('defender-paralyzed-fx');
      }
      if (fxId === 'cobra-bite' && isHeads) {
        defenderSlot?.classList.add('defender-poison-fx');
      }
      if (fxId === 'clones' && isHeads) {
        defenderSlot?.classList.add('defender-shield-fx');
      }
      if (fxId === 'music-wave' || fxId === 'hyoga-diamond-dust') {
        defenderSlot?.classList.add('defender-frozen-fx');
      }
      if (fxId === 'hyoga-dawn-thunder') {
        defenderSlot?.classList.add('defender-paralyzed-fx');
      }
      if (fxId === 'shakka-tresor-du-ciel' || fxId === 'saga-five-senses') {
        defenderSlot?.classList.add('defender-paralyzed-fx');
      }
      if (fxId === 'pope-diabolic-ray') {
        defenderSlot?.classList.add('defender-confused-fx');
      }
      if (fxId === 'pegasus-meteors') {
        attackerSlot?.classList.add('pegasus-attacker-shimmer');
      }
      if (fxId === 'black-meteors') {
        attackerSlot?.classList.add('black-meteors-attacker-shimmer');
      }
      if (fxId === 'sagittarius-atomic-thunder') {
        attackerSlot?.classList.add('sagittarius-atomic-thunder-attacker-shimmer');
      }
      if (fxId === 'eagle-meteors') {
        attackerSlot?.classList.add('eagle-meteors-attacker-shimmer');
      }

      return fxDone.then(async () => {
        try {
        clearTimeout(this._aiorPlasmaFinaleTimer);
        clearTimeout(this._aiorFireballImpactTimer);
        clearTimeout(this._aiorFireballSfxTimer);
        clearTimeout(this._hyogaDiamondDustEncaseTimer);
        clearTimeout(this._hyogaDiamondDustShakeTimer);
        clearTimeout(this._dragonWrathShakeTimer);
        clearTimeout(this._dragonWrathHitTimer);
        clearTimeout(this._docratesMeteoresShakeTimer);
        clearTimeout(this._docratesMeteoresHitTimer);
        clearTimeout(this._docratesMeteoresVideoTimer);
        clearTimeout(this._miloAntaresShakeTimer);
        clearTimeout(this._miloAntaresImpactSfxTimer);
        clearTimeout(this._shuraLeapImpactTimer);
        clearTimeout(this._shuraExcaliburVideoTimer);
        clearTimeout(this._shuraExcaliburImpactTimer);
        clearTimeout(this._shuraExcaliburShakeTimer);
        clearTimeout(this._greathornChargeTimer);
        clearTimeout(this._greathornImpactTimer);
        clearTimeout(this._greathornShakeTimer);
        this._greathornImpactDone = false;
        clearTimeout(this._greathornVideoTimer);
        clearTimeout(this._shinaThunderClawVideoTimer);
        clearTimeout(this._shinaThunderClawImpactTimer);
        clearTimeout(this._shinaThunderClawShakeTimer);
        clearTimeout(this._ichiComboGriffeVideoTimer);
        clearTimeout(this._ichiComboGriffeImpactTimer);
        clearTimeout(this._ichiComboGriffeShakeTimer);
        clearTimeout(this._phoenixVideoTimer);
        clearTimeout(this._muSpiralStellaireVideoTimer);
        clearTimeout(this._muSpiralStellaireVideoFadeTimer);
        clearTimeout(this._muSpiralStellaireImpactTimer);
        clearTimeout(this._muSpiralStellaireShakeTimer);
        clearTimeout(this._kagahoAnkhSacrificielleVideoTimer);
        clearTimeout(this._kagahoAnkhSacrificielleImpactTimer);
        clearTimeout(this._kagahoAnkhSacrificielleShakeTimer);
        clearTimeout(this._mistyTourbillonLezardVideoTimer);
        clearTimeout(this._mistyTourbillonLezardImpactTimer);
        clearTimeout(this._mistyTourbillonLezardShakeTimer);
        clearTimeout(this._andromedeChaineSerpentVideoTimer);
        clearTimeout(this._andromedeChaineSerpentImpactTimer);
        clearTimeout(this._andromedeChaineSerpentShakeTimer);
        clearTimeout(this._shakkaTresorDuCielVideoTimer);
        clearTimeout(this._shakkaTresorDuCielImpactTimer);
        clearTimeout(this._shakkaTresorDuCielShakeTimer);
        clearTimeout(this._sagaExplosionGalactiqueVideoTimer);
        clearTimeout(this._sagaExplosionGalactiqueVideoFadeTimer);
        clearTimeout(this._sagaExplosionGalactiqueTeardownTimer);
        clearTimeout(this._sagaExplosionGalactiqueImpactTimer);
        clearTimeout(this._sagaExplosionGalactiqueShakeTimer);
        clearTimeout(this._poseidonTridentRoyalVideoTimer);
        clearTimeout(this._poseidonTridentRoyalImpactTimer);
        clearTimeout(this._poseidonTridentRoyalShakeTimer);
        clearTimeout(this._phoenixFinalHitTimer);
        this._clearPhoenixStormShakeTimers();
        this._clearDocratesMeteoresShakeTimers();
        attackerField?.classList.remove('attacker-lunge');
        attackerSlot?.classList.remove(
          'pegasus-attacker-shimmer',
          'black-meteors-attacker-shimmer',
          'sagittarius-atomic-thunder-attacker-shimmer',
          'eagle-meteors-attacker-shimmer',
          'aior-attacker-charge',
          'hyoga-attacker-charge',
          'shiryu-attacker-charge',
          'docrates-attacker-charge',
          'phoenix-attacker-concentrate',
          'greathorn-attacker-glow',
          'greathorn-attacker-charge',
          'milo-attacker-glow',
          'kagaho-ankh-attacker-sparkle',
        );
        attackerSlot?.style.removeProperty('--gh-dx');
        attackerSlot?.style.removeProperty('--gh-dy');
        const ghCard = attackerSlot?.querySelector('.card');
        if (ghCard) {
          ghCard.style.removeProperty('visibility');
          ghCard.style.removeProperty('opacity');
        }
        defenderSlot?.classList.remove(
          'defender-hit',
          'defender-paralyzed-fx',
          'defender-poison-fx',
          'defender-frozen-fx',
          'defender-shield-fx',
          'defender-confused-fx',
          'defender-plasma-barrage',
          'defender-plasma-final',
          'defender-fireball-impact',
          'defender-hyoga-storm',
          'defender-phoenix-storm-shake',
          'defender-hyoga-encased',
        );
        this.els.game?.classList.remove(
          'battle-attack',
          'hyoga-board-shake',
          'dragon-wrath-board-shake',
          'docrates-meteores-board-shake',
          'milo-antares-board-shake',
          'hyoga-dawn-thunder-board-shake',
          'greathorn-board-shake',
          'shina-thunder-claw-board-shake',
          'ichi-combo-griffe-board-shake',
          'shura-excalibur-board-shake',
          'mu-spiral-stellaire-board-shake',
          'kagaho-ankh-sacrificielle-board-shake',
          'misty-tourbillon-lezard-board-shake',
          'andromede-chaine-serpent-board-shake',
          'shakka-tresor-du-ciel-board-shake',
          'saga-explosion-galactique-board-shake',
          'poseidon-trident-royal-board-shake',
        );
        if (this.els.game) {
          delete this.els.game.dataset.attackFx;
          this.els.game.style.removeProperty('--hyoga-total');
          this.els.game.style.removeProperty('--gh-total');
          this.els.game.style.removeProperty('--gh-glow');
          this.els.game.style.removeProperty('--gh-charge');
          this.els.game.style.removeProperty('--gh-video-fade-at');
          this.els.game.style.removeProperty('--gh-video-fade');
          this.els.game.style.removeProperty('--stc-total');
          this.els.game.style.removeProperty('--stc-video-opacity');
          this.els.game.style.removeProperty('--stc-video-fade-at');
          this.els.game.style.removeProperty('--stc-video-fade');
          this.els.game.style.removeProperty('--stc-video-fade-in');
          this.els.game.style.removeProperty('--icg-total');
          this.els.game.style.removeProperty('--icg-video-opacity');
          this.els.game.style.removeProperty('--icg-video-fade-at');
          this.els.game.style.removeProperty('--icg-video-fade');
          this.els.game.style.removeProperty('--icg-video-fade-in');
          this.els.game.style.removeProperty('--sxe-total');
          this.els.game.style.removeProperty('--sxe-video-opacity');
          this.els.game.style.removeProperty('--sxe-video-fade-at');
          this.els.game.style.removeProperty('--sxe-video-fade');
          this.els.game.style.removeProperty('--sxe-video-fade-in');
          this.els.game.style.removeProperty('--mss-total');
          this.els.game.style.removeProperty('--mss-video-opacity');
          this.els.game.style.removeProperty('--mss-video-fade-at');
          this.els.game.style.removeProperty('--mss-video-fade');
          this.els.game.style.removeProperty('--mss-video-fade-in');
          this.els.game.style.removeProperty('--mss-flash-at');
          this.els.game.style.removeProperty('--mss-flash-fade');
          this.els.game.style.removeProperty('--kas-total');
          this.els.game.style.removeProperty('--kas-video-opacity');
          this.els.game.style.removeProperty('--kas-video-fade-at');
          this.els.game.style.removeProperty('--kas-video-fade');
          this.els.game.style.removeProperty('--kas-video-fade-in');
          this.els.game.style.removeProperty('--kas-sparkle-dur');
          this.els.game.style.removeProperty('--mtl-total');
          this.els.game.style.removeProperty('--mtl-video-opacity');
          this.els.game.style.removeProperty('--mtl-video-fade-at');
          this.els.game.style.removeProperty('--mtl-video-fade');
          this.els.game.style.removeProperty('--mtl-video-fade-in');
          this.els.game.style.removeProperty('--acs-total');
          this.els.game.style.removeProperty('--acs-video-opacity');
          this.els.game.style.removeProperty('--acs-video-fade-at');
          this.els.game.style.removeProperty('--acs-video-fade');
          this.els.game.style.removeProperty('--acs-video-fade-in');
          this.els.game.style.removeProperty('--ptr-total');
          this.els.game.style.removeProperty('--ptr-video-opacity');
          this.els.game.style.removeProperty('--ptr-video-fade-at');
          this.els.game.style.removeProperty('--ptr-video-fade');
          this.els.game.style.removeProperty('--ptr-video-fade-in');
          this._removeSagaExplosionGalactiqueGameVars(this.els.game);
          this.els.game.style.removeProperty('--milo-glow');
          this.els.game.style.removeProperty('--milo-needle-total');
          this.els.game.style.removeProperty('--milo-fade-at');
          this.els.game.style.removeProperty('--milo-fade-out');
          this.els.game.style.removeProperty('--phoenix-total');
          this.els.game.style.removeProperty('--phoenix-concentration');
          this.els.game.style.removeProperty('--phoenix-aura-window');
          this.els.game.style.removeProperty('--phoenix-fade-at');
          this.els.game.style.removeProperty('--phoenix-fade-out');
        }
        this.clearAttackFx();

        if (!visualOnly) {
          await this.showAttackResultSplash(
            attackName,
            label,
            splashResults,
            splashDamage,
          );
        }
      } finally {
        if (visualOnly) {
          this.engine?.notifyAttackFxVisualComplete?.();
        } else {
          this.engine?.notifyAttackResultComplete?.();
        }
      }
      });
    };

    this.showAttackNameSplash(attackName, label, description, () => {
      void runFx();
    });
  }

  _themedAttackFxDurationMs(fxId, opts = {}) {
    return attackFxDurationMs(fxId, RULES.ui?.attackFxMs ?? 2800, opts);
  }

  _playSignatureAttackAudioAtFxStart(fxId, data = {}) {
    const a = this.audio;
    if (!a) return;
    if (fxId === 'milo-scarlet-needle') {
      const mn = getFxTiming('milo-scarlet-needle');
      const playSec = mn.audioPlaySec ?? 3.35;
      const startSec = mn.audioStartSec ?? 9;
      console.info('[fx-audio] start milo-scarlet-needle at fx t=0', { startSec, playSec });
      a.playMiloScarletNeedle?.(playSec, { startSec });
      return;
    }
    if (fxId === 'milo-antares') {
      const ma = getFxTiming('milo-antares');
      const playSec = ma.audioPlaySec ?? 2.8;
      const startSec = ma.audioStartSec ?? 12.5;
      console.info('[fx-audio] start milo-antares at fx t=0', { startSec, playSec });
      a.playMiloAntares?.(playSec, { startSec });
      return;
    }
    if (fxId === 'hyoga-dawn-thunder') {
      const ht = getFxTiming('hyoga-dawn-thunder');
      const playSec = ht.audioPlaySec ?? 2.9;
      const startSec = ht.audioStartSec ?? 0;
      console.info('[fx-audio] start hyoga-dawn-thunder at fx t=0', { startSec, playSec });
      a.playHyogaDawnThunder?.(playSec, { startSec });
      return;
    }
  }

  playThemedAttackFx(fxId, opts) {
    const layer = this.els.attackFxLayer;
    if (!layer) return Promise.resolve();
    layer.innerHTML = this.buildAttackFxHtml(fxId, opts);
    // Hoist MP4 overlays to #attack-fx-layer so inset:0 covers the full board (not inline at bottom).
    for (const video of layer.querySelectorAll('.fx-scene > video')) {
      layer.insertBefore(video, layer.firstChild);
    }
    layer.className = `attack-fx-layer show fx-${fxId} ${opts.isPlayer ? 'fx-from-player' : 'fx-from-opponent'}`;
    layer.setAttribute('aria-hidden', 'false');
    if (fxId === 'aldebaran-great-horn') this._initGreatHornFx(layer, opts);
    if (fxId === 'shina-thunder-claw') this._initShinaThunderClawFx(layer, opts);
    if (fxId === 'ichi-combo-griffe') this._initIchiComboGriffeFx(layer, opts);
    if (fxId === 'phoenix-hoyoku-tensho') this._initPhoenixHoyokuFx(layer, opts);
    if (fxId === 'mu-spiral-stellaire') this._initMuSpiralStellaireFx(layer, opts);
    if (fxId === 'kagaho-ankh-sacrificielle') this._initKagahoAnkhSacrificielleFx(layer, opts);
    if (fxId === 'misty-tourbillon-lezard') this._initMistyTourbillonLezardFx(layer, opts);
    if (fxId === 'andromede-chaine-serpent') this._initAndromedeChaineSerpentFx(layer, opts);
    if (fxId === 'shakka-tresor-du-ciel') this._initShakkaTresorDuCielFx(layer, opts);
    if (fxId === 'poseidon-trident-royal') this._initPoseidonTridentRoyalFx(layer, opts);
    if (fxId === 'docrates-meteores-hercule') this._initDocratesMeteoresVideoFx(layer, opts);
    if (fxId === 'pegasus-meteors') this._syncPegasusMeteorFxStart(layer);
    if (fxId === 'black-meteors') this._syncBlackMeteorFxStart(layer);
    if (fxId === 'sagittarius-atomic-thunder') this._syncSagittariusAtomicThunderFxStart(layer);
    if (fxId === 'eagle-meteors') this._syncEagleMeteorFxStart(layer);
    if (fxId === 'aior-plasma') this._initAiorPlasmaFx(layer, opts);
    if (fxId === 'hyoga-diamond-dust') this._initHyogaDiamondDustFx(layer, opts);
    if (fxId === 'dragon-wrath') this._initDragonWrathFx(layer, opts);
    if (fxId === 'docrates-meteores-hercule') this._initDocratesMeteoresFx(layer, opts);
    if (fxId === 'aior-fireball') this._initAiorFireballFx(layer, opts);
    if (fxId === 'saga-explosion-galactique') this._initSagaExplosionFx(layer, opts);
    if (fxId === 'saga-dimension') this._initSagaDimensionFx(layer, opts);
    if (fxId === 'milo-scarlet-needle') this._initMiloNeedleFx(layer, opts);
    if (fxId === 'milo-antares') this._initMiloAntaresFx(layer, opts);
    if (fxId === 'aioros-golden-arrow') this._initAiorosArrowFx(layer, opts);
    if (fxId === 'hyoga-dawn-thunder') {
      this._initAiorosThunderFx(layer, opts, fxId);
    }
    if (fxId === 'shura-excalibur') this._initShuraExcaliburFx(layer, opts);
    if (fxId === 'mu-crystal-wall') this._initMuCrystalWallFx(layer, opts);
    if (fxId === 'mu-death-star') this._initMuDeathStarFx(layer, opts);
    this._ensureAttackFxVideosPlaying(layer, fxId, opts);
    const durationMs =
      isSignatureAttackFx(fxId) || isGoldSaintAttackFx(fxId)
        ? this._themedAttackFxDurationMs(fxId, opts)
        : (RULES.ui?.attackFxMs ?? 1250);
    return new Promise((resolve) => {
      clearTimeout(this._attackFxEndTimer);
      this._attackFxEndTimer = setTimeout(resolve, durationMs);
    });
  }

  _ensureAttackFxVideosPlaying(layer, fxId, opts = {}) {
    const videos = layer?.querySelectorAll?.('video') || [];
    for (const video of videos) {
      video.playsInline = true;
      video.preload = 'auto';
      const isGreatHornVideo =
        fxId === 'aldebaran-great-horn' && video.classList.contains('fx-shura-greathorn-video');
      const isShinaThunderClawVideo =
        fxId === 'shina-thunder-claw' && video.classList.contains('fx-shina-thunder-claw-video');
      const isIchiComboGriffeVideo =
        fxId === 'ichi-combo-griffe' && video.classList.contains('fx-ichi-combo-griffe-video');
      const isShuraExcaliburVideo =
        fxId === 'shura-excalibur' && video.classList.contains('fx-shura-excalibur-video');
      const isMuSpiralStellaireVideo =
        fxId === 'mu-spiral-stellaire' && video.classList.contains('fx-mu-spiral-stellaire-video');
      const isKagahoAnkhSacrificielleVideo =
        fxId === 'kagaho-ankh-sacrificielle' &&
        video.classList.contains('fx-kagaho-ankh-sacrificielle-video');
      const isMistyTourbillonLezardVideo =
        fxId === 'misty-tourbillon-lezard' &&
        video.classList.contains('fx-misty-tourbillon-lezard-video');
      const isAndromedeChaineSerpentVideo =
        fxId === 'andromede-chaine-serpent' &&
        video.classList.contains('fx-andromede-chaine-serpent-video');
      const isShakkaTresorDuCielVideo =
        fxId === 'shakka-tresor-du-ciel' &&
        video.classList.contains('fx-shakka-tresor-du-ciel-video');
      const isSagaExplosionGalactiqueVideo =
        fxId === 'saga-explosion-galactique' &&
        video.classList.contains('fx-saga-explosion-galactique-video');
      const isPoseidonTridentRoyalVideo =
        fxId === 'poseidon-trident-royal' &&
        video.classList.contains('fx-poseidon-trident-royal-video');
      const isDocratesMeteoresVideo =
        fxId === 'docrates-meteores-hercule' &&
        video.classList.contains('fx-docrates-meteores-hercule-video');
      const isPhoenixVideo =
        fxId === 'phoenix-hoyoku-tensho' && video.classList.contains('fx-phoenix-hoyoku-video');
      if (
        isGreatHornVideo ||
        isShinaThunderClawVideo ||
        isIchiComboGriffeVideo ||
        isShuraExcaliburVideo ||
        isMuSpiralStellaireVideo ||
        isKagahoAnkhSacrificielleVideo ||
        isMistyTourbillonLezardVideo ||
        isAndromedeChaineSerpentVideo ||
        isShakkaTresorDuCielVideo ||
        isSagaExplosionGalactiqueVideo ||
        isPoseidonTridentRoyalVideo ||
        isDocratesMeteoresVideo ||
        isPhoenixVideo
      ) {
        if (isDocratesMeteoresVideo) {
          const dm = getFxTiming('docrates-meteores-hercule');
          video.volume = dm.videoVolume ?? 0.9;
          video.muted = false;
        } else if (isMuSpiralStellaireVideo) {
          const ms = getFxTiming('mu-spiral-stellaire');
          video.volume = ms.videoVolume ?? 0.28;
          video.muted = false;
        } else if (isShuraExcaliburVideo) {
          const ex = getFxTiming('shura-excalibur');
          video.volume = ex.videoVolume ?? 0.35;
          video.muted = false;
        } else if (isKagahoAnkhSacrificielleVideo) {
          const kas = getFxTiming('kagaho-ankh-sacrificielle');
          video.volume = kas.videoVolume ?? 0.35;
          video.muted = false;
        } else if (isMistyTourbillonLezardVideo) {
          const mtl = getFxTiming('misty-tourbillon-lezard');
          video.volume = mtl.videoVolume ?? 0.35;
          video.muted = false;
        } else if (isAndromedeChaineSerpentVideo) {
          const acs = getFxTiming('andromede-chaine-serpent');
          video.volume = acs.videoVolume ?? 0.35;
          video.muted = false;
        } else if (isShakkaTresorDuCielVideo) {
          const skc = getFxTiming('shakka-tresor-du-ciel');
          video.volume = skc.videoVolume ?? 0.35;
          video.muted = false;
        } else if (isSagaExplosionGalactiqueVideo) {
          const seg = getFxTiming('saga-explosion-galactique');
          video.volume = seg.videoVolume ?? 0.35;
          video.muted = false;
        } else if (isPoseidonTridentRoyalVideo) {
          const ptr = poseidonTridentRoyalTiming(
            getFxTiming('poseidon-trident-royal'),
            opts?.attackLethal !== false,
          );
          video.volume = ptr.videoVolume ?? 0.35;
          video.muted = false;
        } else if (isIchiComboGriffeVideo) {
          const icg = getFxTiming('ichi-combo-griffe');
          video.volume = icg.videoVolume ?? 0.35;
          video.muted = false;
        } else {
          video.volume = 1;
          video.muted = false;
        }
        if (!video.dataset.fxErrorBound) {
          video.dataset.fxErrorBound = '1';
          video.addEventListener(
            'error',
            () => {
              console.warn('[attack-fx] video load error', {
                fxId,
                src: video.currentSrc || video.src,
              });
            },
            { once: true },
          );
        }
        if (
          isGreatHornVideo ||
          isShinaThunderClawVideo ||
          isShuraExcaliburVideo ||
          isMuSpiralStellaireVideo ||
          isKagahoAnkhSacrificielleVideo ||
          isMistyTourbillonLezardVideo ||
          isAndromedeChaineSerpentVideo ||
          isShakkaTresorDuCielVideo ||
          isSagaExplosionGalactiqueVideo ||
          isPoseidonTridentRoyalVideo ||
          isDocratesMeteoresVideo
        ) {
          continue;
        }
      }
      video.muted = true;
      if (!video.dataset.fxErrorBound) {
        video.dataset.fxErrorBound = '1';
        video.addEventListener(
          'error',
          () => {
            console.warn('[attack-fx] video load error', { fxId, src: video.currentSrc || video.src });
          },
          { once: true },
        );
      }
      const startSec = Number.parseFloat(video.dataset.startSec || '0') || 0;
      const safeSeekSec = isGreatHornVideo ? Math.max(0, startSec || 3) : Math.max(0, startSec);
      const delayPlayMs = Number.parseInt(video.dataset.delayPlayMs || '0', 10) || 0;
      if (isGreatHornVideo && delayPlayMs > 0) {
        video.pause();
        try {
          video.currentTime = safeSeekSec;
        } catch {
          /* metadata not ready — _initGreatHornFx retries play */
        }
        continue;
      }
      this._startAttackFxVideo(video, {
        fxId,
        seekSec: safeSeekSec,
        delayPlayMs,
        allowGestureRetry: isGreatHornVideo || isShinaThunderClawVideo || isIchiComboGriffeVideo || isMuSpiralStellaireVideo || isPhoenixVideo,
        muteUntilSeeked: isPhoenixVideo,
      });
    }
  }

  /** MP4 overlay FX: keep video audio in sync (init, ensure, gesture retry). */
  _syncOverlayFxVideoAudio(video, fxId) {
    if (!video || !fxId) return false;
    const overlayFx = [
      ['kagaho-ankh-sacrificielle', 'fx-kagaho-ankh-sacrificielle-video'],
      ['misty-tourbillon-lezard', 'fx-misty-tourbillon-lezard-video'],
      ['andromede-chaine-serpent', 'fx-andromede-chaine-serpent-video'],
      ['shakka-tresor-du-ciel', 'fx-shakka-tresor-du-ciel-video'],
      ['saga-explosion-galactique', 'fx-saga-explosion-galactique-video'],
      ['poseidon-trident-royal', 'fx-poseidon-trident-royal-video'],
      ['shura-excalibur', 'fx-shura-excalibur-video'],
      ['mu-spiral-stellaire', 'fx-mu-spiral-stellaire-video'],
      ['shina-thunder-claw', 'fx-shina-thunder-claw-video', 1],
      ['ichi-combo-griffe', 'fx-ichi-combo-griffe-video'],
      ['docrates-meteores-hercule', 'fx-docrates-meteores-hercule-video', 0.9],
    ];
    for (const [id, cls, defaultVol] of overlayFx) {
      if (fxId !== id || !video.classList.contains(cls)) continue;
      const t = getFxTiming(id);
      video.volume = t.videoVolume ?? defaultVol ?? 0.35;
      video.muted = false;
      return true;
    }
    return false;
  }

  _startAttackFxVideo(
    video,
    { fxId, seekSec = 0, delayPlayMs = 0, allowGestureRetry = false, muteUntilSeeked = false } = {},
  ) {
    if (!video) return;
    let started = false;
    const applySeek = () => {
      if (!(seekSec > 0)) return;
      let target = seekSec;
      if (Number.isFinite(video.duration) && video.duration > 0) {
        target = Math.min(target, Math.max(0, video.duration - 0.05));
      }
      try {
        video.currentTime = target;
      } catch {
        /* ignore seek errors until metadata is ready */
      }
    };

    const unmuteAfterSeek = () => {
      if (!muteUntilSeeked) return;
      video.muted = false;
      if (video.volume < 1) video.volume = 1;
    };

    const playNow = () => {
      if (started) return;
      started = true;
      this._syncOverlayFxVideoAudio(video, fxId);
      if (muteUntilSeeked) {
        video.muted = true;
        const beginPlayback = () => {
          video.muted = true;
          const unmuteOnPlaying = () => {
            unmuteAfterSeek();
          };
          video.addEventListener('playing', unmuteOnPlaying, { once: true });
          const playPromise = video.play?.();
          if (playPromise?.catch) {
            playPromise.catch((err) => {
              video.removeEventListener('playing', unmuteOnPlaying);
              console.warn('[attack-fx] video autoplay blocked', {
                fxId,
                src: video.currentSrc || video.src,
                err,
              });
              if (allowGestureRetry) {
                this._queueFxVideoGestureRetry(video, fxId, seekSec, { muteUntilSeeked, delayPlayMs });
              }
            });
          }
        };
        if (seekSec > 0) {
          let seekHandled = false;
          const onSeeked = () => {
            if (seekHandled) return;
            seekHandled = true;
            beginPlayback();
          };
          video.addEventListener('seeked', onSeeked, { once: true });
          setTimeout(() => {
            if (!seekHandled) onSeeked();
          }, 320);
          return;
        }
        beginPlayback();
        return;
      }
      const playPromise = video.play?.();
      if (playPromise?.catch) {
        playPromise.catch((err) => {
          console.warn('[attack-fx] video autoplay blocked', { fxId, src: video.currentSrc || video.src, err });
          if (allowGestureRetry) this._queueFxVideoGestureRetry(video, fxId, seekSec, { delayPlayMs });
        });
      }
    };

    const playWithOffset = () => {
      const waitMs = Math.max(0, Number.isFinite(delayPlayMs) ? delayPlayMs : 0);
      if (waitMs <= 0) {
        playNow();
        return;
      }
      setTimeout(() => {
        playNow();
      }, waitMs);
    };

    if (video.readyState >= 1) {
      applySeek();
      playWithOffset();
      return;
    }

    const onMetadata = () => {
      applySeek();
      playWithOffset();
    };
    video.addEventListener('loadedmetadata', onMetadata, { once: true });

    const fallbackTimer = setTimeout(() => {
      if (video.readyState >= 1) return;
      playNow();
    }, 280);
    if (!video.dataset.fxSeekFallbackBound) {
      video.dataset.fxSeekFallbackBound = '1';
      video.addEventListener(
        'loadedmetadata',
        () => {
          clearTimeout(fallbackTimer);
          delete video.dataset.fxSeekFallbackBound;
        },
        { once: true },
      );
    }
  }

  _queueFxVideoGestureRetry(video, fxId, seekSec = 0, opts = {}) {
    if (!video || video.dataset.fxGestureRetryBound) return;
    const root = this.root || document;
    if (!root?.addEventListener) return;
    video.dataset.fxGestureRetryBound = '1';
    let retried = false;
    const retry = () => {
      if (retried) return;
      retried = true;
      delete video.dataset.fxGestureRetryBound;
      this._startAttackFxVideo(video, { fxId, seekSec, allowGestureRetry: false, ...opts });
    };
    root.addEventListener('click', retry, { once: true, capture: true });
    root.addEventListener(
      'touchstart',
      () => {
        retry();
      },
      { once: true, capture: true },
    );
  }

  _clearFxVideoRetryMarkers(layer) {
    const videos = layer?.querySelectorAll?.('video') || [];
    for (const video of videos) {
      delete video.dataset.fxGestureRetryBound;
      delete video.dataset.fxSeekFallbackBound;
    }
  }

  /** Random point on viewport edge (top/right/bottom/left + corners). */
  _randomPlasmaEdgePoint(width, height) {
    const r = Math.random();
    if (r < 0.17) return { x: Math.random() * width, y: 0 };
    if (r < 0.34) return { x: width, y: Math.random() * height };
    if (r < 0.51) return { x: Math.random() * width, y: height };
    if (r < 0.68) return { x: 0, y: Math.random() * height };
    const corners = [
      [0, 0],
      [width, 0],
      [0, height],
      [width, height],
    ];
    const [x, y] = corners[Math.floor(Math.random() * corners.length)];
    return { x, y };
  }

  /** Active knight card center in attack-fx-layer coordinates (px). */
  _cardCenterInAttackFxLayer(slot, layer) {
    const layerRect = layer.getBoundingClientRect();
    if (layerRect.width < 1 || layerRect.height < 1) {
      return { x: layerRect.width / 2, y: layerRect.height * 0.42 };
    }
    const card = slot?.querySelector('.card') ?? slot;
    const rect = card?.getBoundingClientRect();
    if (!rect) {
      return { x: layerRect.width / 2, y: layerRect.height * 0.42 };
    }
    return {
      x: rect.left + rect.width / 2 - layerRect.left,
      y: rect.top + rect.height / 2 - layerRect.top,
    };
  }

  /** Defender card center in attack-fx-layer coordinates (finale flash only). */
  _plasmaTargetCenter(defenderSlot, layer) {
    const layerRect = layer.getBoundingClientRect();
    if (layerRect.width < 1 || layerRect.height < 1) {
      return { x: layerRect.width / 2, y: layerRect.height * 0.38 };
    }
    const card = defenderSlot?.querySelector('.card') ?? defenderSlot;
    const rect = card?.getBoundingClientRect();
    if (!rect) {
      return { x: layerRect.width / 2, y: layerRect.height * 0.38 };
    }
    return {
      x: rect.left + rect.width / 2 - layerRect.left,
      y: rect.top + rect.height / 2 - layerRect.top,
    };
  }

  /** Battlefield rectangle for plasma strike targets (layer-local px). */
  _plasmaBattlefieldRect(defenderSlot, layer) {
    const layerRect = layer.getBoundingClientRect();
    const w = layerRect.width;
    const h = layerRect.height;
    let x0 = w * 0.08;
    let y0 = h * 0.1;
    let x1 = w * 0.92;
    let y1 = h * 0.78;

    const card = defenderSlot?.querySelector('.card') ?? defenderSlot;
    const rect = card?.getBoundingClientRect();
    if (rect) {
      const pad = Math.max(56, Math.min(rect.width, rect.height) * 1.1);
      const cx0 = rect.left - layerRect.left - pad;
      const cy0 = rect.top - layerRect.top - pad;
      const cx1 = rect.right - layerRect.left + pad;
      const cy1 = rect.bottom - layerRect.top + pad;
      x0 = Math.min(x0, cx0);
      y0 = Math.min(y0, cy0);
      x1 = Math.max(x1, cx1);
      y1 = Math.max(y1, cy1);
    }

    return { x0, y0, x1, y1, w, h };
  }

  /** Per-ray strike point: spread across battlefield or through-screen for crosshatch. */
  _randomPlasmaStrikePoint(battlefield, start) {
    const { x0, y0, x1, y1, w, h } = battlefield;
    const inner = () => ({
      x: x0 + Math.random() * (x1 - x0),
      y: y0 + Math.random() * (y1 - y0),
    });

    if (!start || Math.random() >= 0.38) return inner();

    const { x: sx, y: sy } = start;
    const margin = 3;
    const onTop = sy <= margin;
    const onBottom = sy >= h - margin;
    const onLeft = sx <= margin;
    const onRight = sx >= w - margin;

    if (onTop) return { x: x0 + Math.random() * (x1 - x0), y: y1 };
    if (onBottom) return { x: x0 + Math.random() * (x1 - x0), y: y0 };
    if (onLeft) return { x: x1, y: y0 + Math.random() * (y1 - y0) };
    if (onRight) return { x: x0, y: y0 + Math.random() * (y1 - y0) };

    const corners = [
      { x: x1, y: y1 },
      { x: x0, y: y1 },
      { x: x1, y: y0 },
      { x: x0, y: y0 },
    ];
    return corners[Math.floor(Math.random() * corners.length)];
  }

  /** Plasma foudroyant — golden rays from edges, crosshatching the battlefield. */
  _initAiorPlasmaFx(layer, { defenderSlot = null } = {}) {
    const t = getFxTiming('aior-plasma');
    const prepMs = t.prepMs ?? 300;
    const burstMs = t.burstMs ?? 1500;
    const rayCount = t.rayCount ?? 40;
    const rayMin = t.rayMinMs ?? 55;
    const rayMax = t.rayMaxMs ?? 130;

    const field = layer.querySelector('.fx-aior-plasma-field');
    if (!field) return;

    const layerRect = layer.getBoundingClientRect();
    const battlefield = this._plasmaBattlefieldRect(defenderSlot, layer);
    const { x: fx, y: fy } = this._plasmaTargetCenter(defenderSlot, layer);
    field.style.setProperty('--plasma-tx', `${fx}px`);
    field.style.setProperty('--plasma-ty', `${fy}px`);

    const finaleStart = prepMs + burstMs;
    clearTimeout(this._aiorPlasmaFinaleTimer);
    if (defenderSlot) {
      this._aiorPlasmaFinaleTimer = setTimeout(() => {
        defenderSlot.classList.add('defender-plasma-final');
        defenderSlot.classList.remove('defender-plasma-barrage');
      }, finaleStart);
    }

    for (let i = 0; i < rayCount; i++) {
      const start = this._randomPlasmaEdgePoint(layerRect.width, layerRect.height);
      const { x: sx, y: sy } = start;
      const { x: tx, y: ty } = this._randomPlasmaStrikePoint(battlefield, start);
      const dx = tx - sx;
      const dy = ty - sy;
      const length = Math.hypot(dx, dy);
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      const delay = prepMs + Math.random() * burstMs * 0.94;
      const dur = rayMin + Math.random() * (rayMax - rayMin);
      const thickness = 1.2 + Math.random() * 2.2;

      const ray = document.createElement('span');
      ray.className = 'fx-aior-plasma-ray';
      ray.style.left = `${sx}px`;
      ray.style.top = `${sy}px`;
      ray.style.width = `${length}px`;
      ray.style.setProperty('--ray-angle', `${angle}deg`);
      ray.style.setProperty('--ray-h', `${thickness}px`);
      ray.style.setProperty('--ray-delay', `${delay}ms`);
      ray.style.setProperty('--ray-dur', `${dur}ms`);
      field.appendChild(ray);

      const impact = document.createElement('span');
      impact.className = 'fx-aior-plasma-impact';
      const scatter = 5 + Math.random() * 7;
      impact.style.left = `${tx + (Math.random() - 0.5) * scatter * 2}px`;
      impact.style.top = `${ty + (Math.random() - 0.5) * scatter * 2}px`;
      impact.style.setProperty('--ray-delay', `${delay + dur * 0.72}ms`);
      field.appendChild(impact);
    }
  }

  /** Poussière de Diamant — 4-phase ice storm (aura → wave → crush → freeze). */
  _initHyogaDiamondDustFx(layer, { attackerSlot = null, defenderSlot = null } = {}) {
    const t = getFxTiming('hyoga-diamond-dust');
    const p1Ms = t.phase1Ms ?? 600;
    const p2Ms = t.phase2Ms ?? 700;
    const p3Ms = t.phase3Ms ?? 1700;
    const totalMs = t.durationMs ?? p1Ms + p2Ms + p3Ms + (t.phase4Ms ?? 500);
    const p2Start = p1Ms;
    const p3Start = p1Ms + p2Ms;
    const auraCount = t.auraCount ?? 48;
    const waveCount = t.waveCount ?? 95;
    const stormCount = t.stormCount ?? 320;

    const field = layer.querySelector('.fx-hyoga-diamond-field');
    const particlesEl = field?.querySelector('.fx-hyoga-particles');
    if (!field || !particlesEl) return;

    this._applyFxCardAnchors(field, layer, { attackerSlot, defenderSlot });
    const start = this._cardCenterInAttackFxLayer(attackerSlot, layer);
    const end = this._cardCenterInAttackFxLayer(defenderSlot, layer);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const beamLen = Math.hypot(dx, dy) || 1;
    const beamAngle = (Math.atan2(dy, dx) * 180) / Math.PI;

    field.style.setProperty('--hyoga-total', `${totalMs / 1000}s`);
    field.style.setProperty('--hyoga-p1', `${p1Ms / 1000}s`);
    field.style.setProperty('--hyoga-p2', `${p2Ms / 1000}s`);
    field.style.setProperty('--hyoga-p3', `${p3Ms / 1000}s`);
    field.style.setProperty('--hyoga-p2-at', `${p2Start / 1000}s`);
    field.style.setProperty('--hyoga-p3-at', `${p3Start / 1000}s`);
    field.style.setProperty('--hyoga-encase-at', `${(p3Start + p3Ms * 0.82) / 1000}s`);
    field.style.setProperty('--hyoga-p4-at', `${(p3Start + p3Ms) / 1000}s`);
    field.style.setProperty('--hyoga-beam-len', `${beamLen}px`);
    field.style.setProperty('--hyoga-beam-angle', `${beamAngle}deg`);
    field.style.setProperty('--hyoga-sx', `${start.x}px`);
    field.style.setProperty('--hyoga-sy', `${start.y}px`);
    field.style.setProperty('--hyoga-tx', `${end.x}px`);
    field.style.setProperty('--hyoga-ty', `${end.y}px`);

    const spawnParticle = (kind, delayMs, durMs, px, py, moveX, moveY, sizePx) => {
      const el = document.createElement('span');
      el.className = `fx-hyoga-particle fx-hyoga-particle--${kind}`;
      el.style.left = `${px}px`;
      el.style.top = `${py}px`;
      el.style.setProperty('--hyoga-delay', `${delayMs}ms`);
      el.style.setProperty('--hyoga-dur', `${durMs}ms`);
      el.style.setProperty('--hyoga-mx', `${moveX}px`);
      el.style.setProperty('--hyoga-my', `${moveY}px`);
      el.style.setProperty('--hyoga-size', `${sizePx}px`);
      particlesEl.appendChild(el);
    };

    const rand = (a, b) => a + Math.random() * (b - a);
    const alongPath = (tNorm) => ({
      x: start.x + dx * tNorm + rand(-28, 28),
      y: start.y + dy * tNorm + rand(-22, 22),
    });

    const kinds = ['flake', 'crystal', 'dust', 'trail'];
    for (let i = 0; i < auraCount; i++) {
      const ang = Math.random() * Math.PI * 2;
      const rad = 18 + Math.random() * 52;
      const px = start.x + Math.cos(ang) * rad;
      const py = start.y + Math.sin(ang) * rad;
      const kind = kinds[i % kinds.length];
      spawnParticle(
        kind,
        Math.random() * p1Ms * 0.92,
        280 + Math.random() * 420,
        px,
        py,
        Math.cos(ang) * rand(8, 22),
        Math.sin(ang) * rand(8, 22),
        kind === 'crystal' ? rand(5, 11) : rand(2, 6),
      );
    }

    for (let i = 0; i < waveCount; i++) {
      const tNorm = 0.08 + Math.random() * 0.42;
      const { x, y } = alongPath(tNorm);
      const kind = kinds[(i + 1) % kinds.length];
      const delay = p2Start + Math.random() * p2Ms * 0.96;
      const toward = 0.55 + Math.random() * 0.45;
      spawnParticle(
        kind,
        delay,
        320 + Math.random() * 520,
        x,
        y,
        dx * toward * rand(0.12, 0.28) + rand(-18, 18),
        dy * toward * rand(0.12, 0.28) + rand(-14, 14),
        kind === 'crystal' ? rand(4, 10) : rand(2, 7),
      );
    }

    for (let i = 0; i < stormCount; i++) {
      const tNorm = 0.2 + Math.random() * 0.82;
      const spread = rand(-42, 42);
      const perpX = (-dy / beamLen) * spread;
      const perpY = (dx / beamLen) * spread;
      const { x, y } = alongPath(tNorm);
      const kind = kinds[i % kinds.length];
      const delay = p3Start + Math.random() * p3Ms * 0.98;
      const rush = rand(0.35, 0.85);
      spawnParticle(
        kind,
        delay,
        260 + Math.random() * 680,
        x + perpX,
        y + perpY,
        dx * rush * rand(0.08, 0.22) + rand(-12, 12),
        dy * rush * rand(0.08, 0.22) + rand(-10, 10),
        kind === 'crystal' ? rand(3, 12) : rand(1.5, 6),
      );
    }
  }

  /** Shiryu — Colère du Dragon (4-phase serpent dragon: charge → coil → strike → fade). */
  _initDragonWrathFx(layer, { attackerSlot = null, defenderSlot = null } = {}) {
    const t = getFxTiming('dragon-wrath');
    const p1Ms = t.phase1Ms ?? 700;
    const p2Ms = t.phase2Ms ?? 800;
    const p3Ms = t.phase3Ms ?? 1000;
    const p3StrikeMs = t.phase3StrikeMs ?? Math.round(p3Ms * 0.52);
    const p4Ms = t.phase4Ms ?? 400;
    const totalMs = t.durationMs ?? p1Ms + p2Ms + p3Ms + p4Ms;
    const p2Start = p1Ms;
    const p3Start = p1Ms + p2Ms;
    const p4Start = p3Start + p3Ms;
    const orbitCount = t.orbitCount ?? 26;
    const lingerCount = t.lingerCount ?? 20;

    const field = layer.querySelector('.fx-dragon-wrath-field');
    const orbitEl = field?.querySelector('.fx-dragon-orbit-particles');
    const bodyEl = field?.querySelector('.fx-dragon-body-segments');
    const lingerEl = field?.querySelector('.fx-dragon-linger-particles');
    const serpentWrap = field?.querySelector('.fx-dragon-serpent-wrap');
    const headSvg = field?.querySelector('.fx-dragon-head-svg');
    if (!field || !orbitEl || !bodyEl || !serpentWrap) return;

    this._applyFxCardAnchors(field, layer, { attackerSlot, defenderSlot });
    const start = this._cardCenterInAttackFxLayer(attackerSlot, layer);
    const end = this._cardCenterInAttackFxLayer(defenderSlot, layer);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const beamLen = Math.hypot(dx, dy) || 1;
    const beamAngle = (Math.atan2(dy, dx) * 180) / Math.PI;

    field.style.setProperty('--dw-total', `${totalMs / 1000}s`);
    field.style.setProperty('--dw-p1', `${p1Ms / 1000}s`);
    field.style.setProperty('--dw-p2', `${p2Ms / 1000}s`);
    field.style.setProperty('--dw-p3', `${p3Ms / 1000}s`);
    field.style.setProperty('--dw-p3-strike', `${p3StrikeMs / 1000}s`);
    field.style.setProperty('--dw-p4', `${p4Ms / 1000}s`);
    field.style.setProperty('--dw-p2-at', `${p2Start / 1000}s`);
    field.style.setProperty('--dw-p3-at', `${p3Start / 1000}s`);
    field.style.setProperty('--dw-p4-at', `${p4Start / 1000}s`);
    field.style.setProperty('--dw-impact-at', `${(p3Start + p3StrikeMs * 0.92) / 1000}s`);
    field.style.setProperty('--dw-sx', `${start.x}px`);
    field.style.setProperty('--dw-sy', `${start.y}px`);
    field.style.setProperty('--dw-tx', `${end.x}px`);
    field.style.setProperty('--dw-ty', `${end.y}px`);
    field.style.setProperty('--dw-dx', `${dx}px`);
    field.style.setProperty('--dw-dy', `${dy}px`);
    const beamRotate = `rotate(${beamAngle}deg)`;
    field.style.setProperty('--dw-beam-angle', `${beamAngle}deg`);
    field.style.setProperty('--dw-beam-len', `${beamLen}px`);

    serpentWrap.style.left = `${start.x}px`;
    serpentWrap.style.top = `${start.y}px`;

    const strikeBeam = field.querySelector('.fx-dragon-strike-beam');
    const lightTunnel = field.querySelector('.fx-dragon-light-tunnel');
    const punchWind = field.querySelector('.fx-dragon-punch-wind');
    for (const el of [strikeBeam, lightTunnel, punchWind]) {
      if (el) el.style.transform = beamRotate;
    }

    const rand = (a, b) => a + Math.random() * (b - a);
    const coilPoints = (cx, cy, count, r0, r1, turns) => {
      const pts = [];
      for (let i = 0; i < count; i++) {
        const u = i / Math.max(1, count - 1);
        const ang = u * Math.PI * turns - Math.PI * 0.65;
        const r = r0 + (r1 - r0) * u;
        pts.push({
          x: cx + Math.cos(ang) * r,
          y: cy + Math.sin(ang) * r,
          rot: (ang * 180) / Math.PI + 90,
        });
      }
      return pts;
    };

    const segCount = 15;
    const coil = coilPoints(0, 0, segCount, 28, 86, 2.35);
    coil.forEach((pt, i) => {
      const seg = document.createElement('span');
      seg.className = 'fx-dragon-body-seg';
      seg.style.left = `${pt.x}px`;
      seg.style.top = `${pt.y}px`;
      seg.style.setProperty('--seg-rot', `${pt.rot}deg`);
      seg.style.setProperty('--seg-i', String(i));
      seg.style.setProperty('--seg-scale', `${0.72 + (i / segCount) * 0.55}`);
      bodyEl.appendChild(seg);
    });

    const headPt = coil[coil.length - 1];
    if (headSvg && headPt) {
      headSvg.style.left = `${headPt.x - 42}px`;
      headSvg.style.top = `${headPt.y - 30}px`;
      headSvg.style.transform = `rotate(${headPt.rot - 18}deg)`;
    }

    for (let i = 0; i < orbitCount; i++) {
      const ang = (i / orbitCount) * Math.PI * 2 + rand(-0.2, 0.2);
      const rad = rand(34, 72);
      const el = document.createElement('span');
      el.className = 'fx-dragon-orbit-dot';
      el.style.left = `${start.x}px`;
      el.style.top = `${start.y}px`;
      el.style.setProperty('--dw-orbit-delay', `${rand(0, p1Ms * 0.85)}ms`);
      el.style.setProperty('--dw-orbit-dur', `${rand(480, 720)}ms`);
      el.style.setProperty('--dw-orbit-r', `${rad}px`);
      el.style.setProperty('--dw-orbit-ang', `${ang}rad`);
      orbitEl.appendChild(el);
    }

    if (lingerEl) {
      for (let i = 0; i < lingerCount; i++) {
        const el = document.createElement('span');
        el.className = 'fx-dragon-linger-dot';
        const spread = rand(-48, 48);
        const perpX = (-dy / beamLen) * spread;
        const perpY = (dx / beamLen) * spread;
        el.style.left = `${end.x + perpX + rand(-22, 22)}px`;
        el.style.top = `${end.y + perpY + rand(-18, 18)}px`;
        el.style.setProperty('--dw-linger-delay', `${rand(0, p4Ms * 0.9)}ms`);
        el.style.setProperty('--dw-linger-dur', `${rand(280, 520)}ms`);
        lingerEl.appendChild(el);
      }
    }
  }

  _clearDocratesMeteoresShakeTimers() {
    for (const id of this._docratesMeteoresShakeTimers || []) {
      clearTimeout(id);
    }
    this._docratesMeteoresShakeTimers = [];
  }

  _clearPhoenixStormShakeTimers() {
    for (const id of this._phoenixStormShakeTimers || []) {
      clearTimeout(id);
    }
    this._phoenixStormShakeTimers = [];
    this._phoenixStormShakeTarget?.classList.remove('defender-phoenix-storm-shake');
    this._phoenixStormShakeTarget = null;
  }

  _pulsePhoenixStormTargetShake(slot) {
    if (!slot) return;
    slot.classList.remove('defender-phoenix-storm-shake');
    // Force reflow so every pulse visibly restarts.
    void slot.offsetWidth;
    slot.classList.add('defender-phoenix-storm-shake');
  }

  _schedulePhoenixStormShakePulses({
    concentrationMs = 0,
    stormMs = 0,
    phoenixImpactMs = 0,
    defenderSlot = null,
  } = {}) {
    this._clearPhoenixStormShakeTimers();
    if (stormMs < 900) return;

    this._phoenixStormShakeTarget = defenderSlot || null;
    const stormStartMs = Math.max(0, concentrationMs + Math.floor(stormMs * 0.03));
    const stormEndMs = Math.min(concentrationMs + stormMs - 90, phoenixImpactMs - 130);
    if (stormEndMs - stormStartMs < 260) return;

    const spanMs = stormEndMs - stormStartMs;
    const pulseCount = Math.max(5, Math.min(11, Math.round(spanMs / 1150)));
    const minSpacingMs = 150;
    const pulseDurationMs = 640;
    const pulseAt = [];
    for (let i = 0; i < pulseCount; i++) {
      const progress = (i + 1) / (pulseCount + 1);
      const jitter = (Math.random() - 0.5) * 0.14;
      const adjusted = Math.max(0.04, Math.min(0.96, progress + jitter));
      pulseAt.push(stormStartMs + Math.round(spanMs * adjusted));
    }
    pulseAt.sort((a, b) => a - b);
    for (let i = 1; i < pulseAt.length; i++) {
      if (pulseAt[i] - pulseAt[i - 1] < minSpacingMs) {
        pulseAt[i] = Math.min(stormEndMs, pulseAt[i - 1] + minSpacingMs);
      }
    }

    for (const at of pulseAt) {
      const shakeId = setTimeout(() => {
        this._pulsePhoenixStormTargetShake(this._phoenixStormShakeTarget);
      }, Math.max(0, at));
      this._phoenixStormShakeTimers.push(shakeId);

      const clearId = setTimeout(() => {
        this._phoenixStormShakeTarget?.classList.remove('defender-phoenix-storm-shake');
      }, Math.max(0, at + pulseDurationMs));
      this._phoenixStormShakeTimers.push(clearId);
    }
  }

  /** Brief card shake on active or bench slot during meteor impacts. */
  _pulseDocratesTargetShake(slot) {
    if (!slot) return;
    const card = slot.querySelector('.card');
    if (!card) return;
    card.classList.add('damage-hit');
    const ms = RULES.ui?.damageFxMs ?? 520;
    const id = setTimeout(() => card.classList.remove('damage-hit'), Math.min(ms, 380));
    this._docratesMeteoresShakeTimers.push(id);
  }

  /** Docrates — Météores d'Hercule: vidéo semi-transparente (MeteorHercule.mp4 avec son intégré). */
  _initDocratesMeteoresVideoFx(layer) {
    const t = getFxTiming('docrates-meteores-hercule');
    const totalMs = t.durationMs ?? 14100;
    const fadeMs = t.videoFadeOutMs ?? 700;
    const fadeStartMs = Math.max(0, totalMs - fadeMs);
    const opacity = t.videoOpacity ?? 0.48;
    const videoVol = t.videoVolume ?? 0.9;
    const fadeInMs = t.videoFadeInMs ?? 350;

    const game = this.els.game;
    if (game) {
      game.style.setProperty('--dm-video-total', `${totalMs / 1000}s`);
      game.style.setProperty('--dm-video-opacity', String(opacity));
      game.style.setProperty('--dm-video-fade-at', `${fadeStartMs / 1000}s`);
      game.style.setProperty('--dm-video-fade', `${fadeMs / 1000}s`);
      game.style.setProperty('--dm-video-fade-in', `${fadeInMs / 1000}s`);
    }
    layer.style.setProperty('--dm-video-opacity', String(opacity));
    layer.style.setProperty('--dm-video-fade-at', `${fadeStartMs / 1000}s`);
    layer.style.setProperty('--dm-video-fade', `${fadeMs / 1000}s`);
    layer.style.setProperty('--dm-video-fade-in', `${fadeInMs / 1000}s`);

    const video = layer.querySelector('.fx-docrates-meteores-hercule-video');
    if (!video) return;
    const startSec = t.videoStartSec ?? 0;
    video.loop = t.videoLoop === true;
    video.volume = videoVol;
    video.muted = false;
    const playFromSeek = () => {
      try {
        video.currentTime = Math.max(0, startSec);
      } catch {
        /* metadata not ready */
      }
      const p = video.play?.();
      if (p?.catch) {
        p.catch((err) => {
          console.warn('[attack-fx] MeteorHercule autoplay blocked', err);
          this._queueFxVideoGestureRetry(video, 'docrates-meteores-hercule', startSec, {
            muteUntilSeeked: false,
          });
        });
      }
    };
    if (video.readyState >= 1) playFromSeek();
    else video.addEventListener('loadedmetadata', playFromSeek, { once: true });

    clearTimeout(this._docratesMeteoresVideoTimer);
    video.classList.add('fx-docrates-meteores-hercule-video-active');
    this._docratesMeteoresVideoTimer = setTimeout(() => {
      try {
        video.pause();
      } catch {
        /* ignore */
      }
    }, totalMs);
  }

  /** Docrates — Météores d'Hercule (charge → twin projectiles → double impact → fade). */
  _initDocratesMeteoresFx(
    layer,
    { attackerSlot = null, defenderSlot = null, isPlayer = true } = {},
  ) {
    const t = getFxTiming('docrates-meteores-hercule');
    const p1Ms = t.phase1Ms ?? 12000;
    const p2Ms = t.phase2Ms ?? 620;
    const p3Ms = t.phase3Ms ?? 700;
    const p4Ms = t.phase4Ms ?? 780;
    const totalMs = t.durationMs ?? p1Ms + p2Ms + p3Ms + p4Ms;
    const spacing = t.projectileSpacingPx ?? 44;
    const benchStagger = t.benchWaveStaggerMs ?? 70;

    const field = layer.querySelector('.fx-docrates-meteores-field');
    const chargeMeteorsEl = field?.querySelector('.fx-dm-charge-meteors');
    const laneEl = field?.querySelector('.fx-dm-projectile-lane');
    const impactsEl = field?.querySelector('.fx-dm-impacts');
    const dissipateEl = field?.querySelector('.fx-dm-dissipate');
    const benchShockEl = field?.querySelector('.fx-dm-bench-shock');
    const shockEl = field?.querySelector('.fx-dm-shockwave');
    if (!field || !laneEl) return;

    this._clearDocratesMeteoresShakeTimers();
    this._applyFxCardAnchors(field, layer, { attackerSlot, defenderSlot });

    const p2Start = p1Ms;
    const p3Start = p1Ms + p2Ms;
    const p4Start = p3Start + p3Ms;
    const impactAt = p3Start + 48;
    const impactStagger = 28;

    field.style.setProperty('--dm-total', `${totalMs / 1000}s`);
    field.style.setProperty('--dm-p1', `${p1Ms / 1000}s`);
    field.style.setProperty('--dm-p2', `${p2Ms / 1000}s`);
    field.style.setProperty('--dm-p3', `${p3Ms / 1000}s`);
    field.style.setProperty('--dm-p4', `${p4Ms / 1000}s`);
    field.style.setProperty('--dm-p2-at', `${p2Start / 1000}s`);
    field.style.setProperty('--dm-p3-at', `${p3Start / 1000}s`);
    field.style.setProperty('--dm-p4-at', `${p4Start / 1000}s`);
    field.style.setProperty('--dm-impact-at', `${impactAt / 1000}s`);
    field.style.setProperty('--dm-spacing', `${spacing}px`);

    const attacker = this._cardCenterInAttackFxLayer(attackerSlot, layer);
    const defender = this._cardCenterInAttackFxLayer(defenderSlot, layer);
    field.style.setProperty('--dm-tx', `${defender.x}px`);
    field.style.setProperty('--dm-ty', `${defender.y}px`);

    const dx = defender.x - attacker.x;
    const dy = defender.y - attacker.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const px = -uy;
    const py = ux;
    const beamAngle = (Math.atan2(dy, dx) * 180) / Math.PI;
    field.style.setProperty('--dm-beam-angle', `${beamAngle}deg`);
    const launchLead = 34;
    const chargeLead = 12;

    const sides = [-0.5, 0.5];
    sides.forEach((sideMul, i) => {
      const off = sideMul * spacing;
      const chargeX = attacker.x + px * off + ux * chargeLead;
      const chargeY = attacker.y + py * off + uy * chargeLead;
      const sx = attacker.x + px * off + ux * launchLead;
      const sy = attacker.y + py * off + uy * launchLead;

      const chargePreview = chargeMeteorsEl?.children[i];
      if (chargePreview) {
        chargePreview.style.left = `${chargeX}px`;
        chargePreview.style.top = `${chargeY}px`;
        chargePreview.style.setProperty('--hp-angle', `${beamAngle}deg`);
      }
      const tx = defender.x + px * off;
      const ty = defender.y + py * off;
      const travelLen = Math.hypot(tx - sx, ty - sy);

      const trail = document.createElement('span');
      trail.className = 'hercules-projectile-trail';
      trail.style.left = `${sx}px`;
      trail.style.top = `${sy}px`;
      trail.style.setProperty('--hp-travel', `${travelLen}px`);
      trail.style.setProperty('--hp-angle', `${beamAngle}deg`);
      const vanishAt = p2Start + p2Ms - 24;
      trail.style.setProperty('--hp-flight-at', `${p2Start}ms`);
      trail.style.setProperty('--hp-flight-dur', `${p2Ms}ms`);
      trail.style.setProperty('--hp-vanish-at', `${vanishAt}ms`);
      laneEl.appendChild(trail);

      const proj = document.createElement('div');
      proj.className = 'hercules-projectile';
      proj.setAttribute('aria-hidden', 'true');
      proj.style.left = `${sx}px`;
      proj.style.top = `${sy}px`;
      proj.style.setProperty('--hp-travel', `${travelLen}px`);
      proj.style.setProperty('--hp-angle', `${beamAngle}deg`);
      proj.style.setProperty('--hp-flight-at', `${p2Start}ms`);
      proj.style.setProperty('--hp-flight-dur', `${p2Ms}ms`);
      proj.style.setProperty('--hp-vanish-at', `${vanishAt}ms`);
      laneEl.appendChild(proj);

      if (impactsEl) {
        const hitDelay = impactAt + i * impactStagger;
        const flash = document.createElement('span');
        flash.className = 'fx-dm-impact-flash';
        flash.style.left = `${tx}px`;
        flash.style.top = `${ty}px`;
        flash.style.setProperty('--dm-flash-delay', `${hitDelay}ms`);
        impactsEl.appendChild(flash);
        const ring = document.createElement('span');
        ring.className = 'fx-dm-impact-ring';
        ring.style.left = `${tx}px`;
        ring.style.top = `${ty}px`;
        ring.style.setProperty('--dm-ring-delay', `${hitDelay}ms`);
        impactsEl.appendChild(ring);
      }
    });

    if (shockEl) {
      shockEl.style.left = `${defender.x}px`;
      shockEl.style.top = `${defender.y}px`;
      shockEl.style.setProperty('--dm-shock-delay', `${impactAt}ms`);
    }

    const rand = (a, b) => a + Math.random() * (b - a);
    if (dissipateEl) {
      for (let i = 0; i < 18; i++) {
        const smoke = document.createElement('span');
        smoke.className = 'fx-dm-smoke-puff';
        smoke.style.left = `${defender.x + rand(-72, 72)}px`;
        smoke.style.top = `${defender.y + rand(-36, 28)}px`;
        smoke.style.setProperty('--dm-smoke-delay', `${p4Start + rand(0, p4Ms * 0.55)}ms`);
        smoke.style.setProperty('--dm-smoke-dx', `${rand(-36, 36)}px`);
        smoke.style.setProperty('--dm-smoke-dy', `${rand(-22, 18)}px`);
        dissipateEl.appendChild(smoke);
      }
      for (let i = 0; i < 22; i++) {
        const ember = document.createElement('span');
        ember.className = 'fx-dm-ember';
        ember.style.left = `${defender.x + rand(-64, 64)}px`;
        ember.style.top = `${defender.y + rand(-32, 24)}px`;
        ember.style.setProperty('--dm-ember-delay', `${p4Start + rand(0, p4Ms * 0.9)}ms`);
        ember.style.setProperty('--dm-ember-dx', `${rand(-52, 52)}px`);
        ember.style.setProperty('--dm-ember-dy', `${rand(-38, 16)}px`);
        dissipateEl.appendChild(ember);
      }
    }

    const benchEl = isPlayer ? this.els.oppBench : this.els.playerBench;
    const benchSlots = benchEl
      ? [...benchEl.querySelectorAll('.bench-slot')].filter((s) => s.querySelector('.card'))
      : [];
    const benchRanked = benchSlots
      .map((slot) => {
        const c = this._cardCenterInAttackFxLayer(slot, layer);
        return { slot, c, dist: Math.hypot(c.x - defender.x, c.y - defender.y) };
      })
      .sort((a, b) => a.dist - b.dist);

    benchRanked.forEach(({ slot, c }, rank) => {
      const waveDelay = impactAt + 90 + rank * benchStagger;
      if (benchShockEl) {
        const wave = document.createElement('span');
        wave.className = 'fx-dm-bench-wave';
        wave.style.left = `${c.x}px`;
        wave.style.top = `${c.y}px`;
        wave.style.setProperty('--dm-wave-delay', `${waveDelay}ms`);
        benchShockEl.appendChild(wave);
      }
      const benchShakeId = setTimeout(() => this._pulseDocratesTargetShake(slot), waveDelay + 35);
      this._docratesMeteoresShakeTimers.push(benchShakeId);
    });

    const defenderShakeId = setTimeout(() => this._pulseDocratesTargetShake(defenderSlot), impactAt);
    this._docratesMeteoresShakeTimers.push(defenderShakeId);
  }

  /** Boule de feu — single solar sphere from attacker card to defender, then burst. */
  _initAiorFireballFx(layer, { attackerSlot = null, defenderSlot = null } = {}) {
    const t = getFxTiming('aior-fireball');
    const prepMs = t.prepMs ?? 450;
    const flightMs = t.flightMs ?? 950;
    const burstMs = t.burstMs ?? 550;
    const totalMs = t.durationMs ?? prepMs + flightMs + burstMs + 450;
    const impactMs = prepMs + flightMs;

    const field = layer.querySelector('.fx-aior-fireball-field');
    if (!field) return;

    const start = this._cardCenterInAttackFxLayer(attackerSlot, layer);
    const end = this._cardCenterInAttackFxLayer(defenderSlot, layer);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const prepSec = prepMs / 1000;
    const flightSec = flightMs / 1000;
    const burstSec = burstMs / 1000;
    const totalSec = totalMs / 1000;
    const impactSec = prepSec + flightSec;

    clearTimeout(this._aiorFireballImpactTimer);
    if (defenderSlot) {
      defenderSlot.classList.remove('defender-fireball-impact');
      this._aiorFireballImpactTimer = setTimeout(() => {
        defenderSlot.classList.add('defender-fireball-impact');
      }, impactMs);
    }

    field.style.setProperty('--fb-sx', `${start.x}px`);
    field.style.setProperty('--fb-sy', `${start.y}px`);
    field.style.setProperty('--fb-tx', `${end.x}px`);
    field.style.setProperty('--fb-ty', `${end.y}px`);
    field.style.setProperty('--fb-dx', `${dx}px`);
    field.style.setProperty('--fb-dy', `${dy}px`);
    field.style.setProperty('--fb-prep', `${prepSec}s`);
    field.style.setProperty('--fb-flight', `${flightSec}s`);
    field.style.setProperty('--fb-burst', `${burstSec}s`);
    field.style.setProperty('--fb-impact-at', `${impactSec}s`);
    field.style.setProperty('--fb-total', `${totalSec}s`);
  }

  /** Set attacker/defender card centers on a themed FX field (layer-local px). */
  _applyFxCardAnchors(field, layer, { attackerSlot = null, defenderSlot = null } = {}) {
    if (!field || !layer) return;
    if (attackerSlot) {
      const a = this._cardCenterInAttackFxLayer(attackerSlot, layer);
      field.style.setProperty('--fx-atx', `${a.x}px`);
      field.style.setProperty('--fx-aty', `${a.y}px`);
    }
    if (defenderSlot) {
      const d = this._cardCenterInAttackFxLayer(defenderSlot, layer);
      field.style.setProperty('--fx-dtx', `${d.x}px`);
      field.style.setProperty('--fx-dty', `${d.y}px`);
      if (attackerSlot) {
        const a = this._cardCenterInAttackFxLayer(attackerSlot, layer);
        const dx = d.x - a.x;
        const dy = d.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        field.style.setProperty('--fx-beam-angle', `${(Math.atan2(dy, dx) * 180) / Math.PI}deg`);
        field.style.setProperty('--fx-beam-len', `${len}px`);
      }
    }
  }

  /** Bench knight centers (filled slots only) in attack-fx-layer coordinates. */
  _benchCentersInAttackFxLayer(benchEl, layer) {
    if (!benchEl || !layer) return [];
    const layerRect = layer.getBoundingClientRect();
    const out = [];
    benchEl.querySelectorAll('.bench-slot').forEach((slot) => {
      if (!slot.querySelector('.card')) return;
      const card = slot.querySelector('.card') ?? slot;
      const rect = card.getBoundingClientRect();
      if (rect.width < 1) return;
      out.push({
        x: rect.left + rect.width / 2 - layerRect.left,
        y: rect.top + rect.height / 2 - layerRect.top,
      });
    });
    return out;
  }

  _removeSagaExplosionGalactiqueGameVars(game) {
    if (!game) return;
    game.style.removeProperty('--seg-total');
    game.style.removeProperty('--seg-video-opacity');
    game.style.removeProperty('--seg-video-fade-at');
    game.style.removeProperty('--seg-video-fade');
    game.style.removeProperty('--seg-video-fade-in');
    game.style.removeProperty('--seg-flash-at');
    game.style.removeProperty('--seg-flash-fade');
  }

  _removeSagaExplosionGalactiqueLayerVars(layer) {
    if (!layer) return;
    layer.style.removeProperty('--seg-video-opacity');
    layer.style.removeProperty('--seg-video-fade-at');
    layer.style.removeProperty('--seg-video-fade');
    layer.style.removeProperty('--seg-video-fade-in');
    layer.style.removeProperty('--seg-flash-at');
    layer.style.removeProperty('--seg-flash-fade');
  }

  /** Force-clear Saga Explosion Galactique overlays if the FX end promise did not run. */
  _teardownSagaExplosionGalactiqueUi({ clearLayer = true } = {}) {
    clearTimeout(this._sagaExplosionGalactiqueVideoTimer);
    clearTimeout(this._sagaExplosionGalactiqueVideoFadeTimer);
    clearTimeout(this._sagaExplosionGalactiqueTeardownTimer);
    clearTimeout(this._sagaExplosionGalactiqueImpactTimer);
    clearTimeout(this._sagaExplosionGalactiqueShakeTimer);

    const game = this.els.game;
    if (game?.dataset.attackFx === 'saga-explosion-galactique') {
      game.classList.remove('battle-attack', 'saga-explosion-galactique-board-shake');
      delete game.dataset.attackFx;
      this._removeSagaExplosionGalactiqueGameVars(game);
    }

    const layer = this.els.attackFxLayer;
    if (!layer) return;
    this._removeSagaExplosionGalactiqueLayerVars(layer);
    for (const video of layer.querySelectorAll('.fx-saga-explosion-galactique-video')) {
      video.classList.remove('fx-saga-explosion-galactique-video-active');
      try {
        video.pause();
      } catch {
        /* ignore */
      }
    }
    if (clearLayer && layer.classList.contains('fx-saga-explosion-galactique')) {
      this.clearAttackFx();
    }
  }

  /** Saga — Explosion Galactique: vidéo semi-transparente (Saga1.mp4) + phases CSS galactiques. */
  _initSagaExplosionFx(layer, { attackerSlot = null, defenderSlot = null } = {}) {
    const t = getFxTiming('saga-explosion-galactique');
    const {
      videoEndMs,
      fadeMs,
      fadeStartMs,
      flashAtMs,
      flashFadeMs,
      fxTotalMs,
    } = sagaExplosionGalactiqueTiming(t);
    const opacity = t.videoOpacity ?? 0.32;
    const videoVol = t.videoVolume ?? 0.35;
    const fadeInMs = t.videoFadeInMs ?? 350;

    const game = this.els.game;
    if (game) {
      game.style.setProperty('--seg-total', `${fxTotalMs / 1000}s`);
      game.style.setProperty('--seg-video-opacity', String(opacity));
      game.style.setProperty('--seg-video-fade-at', `${fadeStartMs / 1000}s`);
      game.style.setProperty('--seg-video-fade', `${fadeMs / 1000}s`);
      game.style.setProperty('--seg-video-fade-in', `${fadeInMs / 1000}s`);
      game.style.setProperty('--seg-flash-at', `${flashAtMs / 1000}s`);
      game.style.setProperty('--seg-flash-fade', `${flashFadeMs / 1000}s`);
    }
    layer.style.setProperty('--seg-video-opacity', String(opacity));
    layer.style.setProperty('--seg-video-fade-at', `${fadeStartMs / 1000}s`);
    layer.style.setProperty('--seg-video-fade', `${fadeMs / 1000}s`);
    layer.style.setProperty('--seg-video-fade-in', `${fadeInMs / 1000}s`);
    layer.style.setProperty('--seg-flash-at', `${flashAtMs / 1000}s`);
    layer.style.setProperty('--seg-flash-fade', `${flashFadeMs / 1000}s`);

    const video = layer.querySelector('.fx-saga-explosion-galactique-video');
    if (video) {
      const startSec = t.videoStartSec ?? 0;
      video.volume = videoVol;
      video.muted = false;
      const playFromSeek = () => {
        try {
          video.currentTime = Math.max(0, startSec);
        } catch {
          /* metadata not ready */
        }
        const p = video.play?.();
        if (p?.catch) {
          p.catch((err) => {
            console.warn('[attack-fx] Saga1 autoplay blocked', err);
            this._queueFxVideoGestureRetry(video, 'saga-explosion-galactique', startSec, {
              muteUntilSeeked: false,
            });
          });
        }
      };
      if (video.readyState >= 1) playFromSeek();
      else video.addEventListener('loadedmetadata', playFromSeek, { once: true });

      clearTimeout(this._sagaExplosionGalactiqueVideoTimer);
      clearTimeout(this._sagaExplosionGalactiqueVideoFadeTimer);
      video.classList.remove('fx-saga-explosion-galactique-video-active');
      video.classList.add('fx-saga-explosion-galactique-video-active');
      this._sagaExplosionGalactiqueVideoFadeTimer = setTimeout(() => {
        video.classList.remove('fx-saga-explosion-galactique-video-active');
      }, fadeStartMs);
      this._sagaExplosionGalactiqueVideoTimer = setTimeout(() => {
        try {
          video.pause();
        } catch {
          /* ignore */
        }
      }, videoEndMs);
    }

    clearTimeout(this._sagaExplosionGalactiqueTeardownTimer);
    this._sagaExplosionGalactiqueTeardownTimer = setTimeout(() => {
      this._teardownSagaExplosionGalactiqueUi();
    }, fxTotalMs);

    const darken = t.darkenSec ?? 0.45;
    const charge = t.chargeSec ?? 0.85;
    const flight = t.flightSec ?? 0.65;
    const burst = t.burstSec ?? 0.85;
    const field = layer.querySelector('.fx-saga-galactic-field');
    if (!field) return;
    const a = attackerSlot ? this._cardCenterInAttackFxLayer(attackerSlot, layer) : null;
    const d = defenderSlot ? this._cardCenterInAttackFxLayer(defenderSlot, layer) : null;
    this._applyFxCardAnchors(field, layer, { attackerSlot, defenderSlot });
    if (a && d) {
      field.style.setProperty('--gal-dx', `${d.x - a.x}px`);
      field.style.setProperty('--gal-dy', `${d.y - a.y}px`);
    }
    field.style.setProperty('--gal-darken', `${darken}s`);
    field.style.setProperty('--gal-charge', `${charge}s`);
    field.style.setProperty('--gal-flight', `${flight}s`);
    field.style.setProperty('--gal-burst', `${burst}s`);
    field.style.setProperty('--gal-charge-at', `${darken}s`);
    field.style.setProperty('--gal-flight-at', `${darken + charge}s`);
    field.style.setProperty('--gal-burst-at', `${darken + charge + flight}s`);
    field.style.setProperty('--gal-total', `${fxTotalMs / 1000}s`);
  }

  _initSagaDimensionFx(layer, { defenderSlot = null } = {}) {
    const t = getFxTiming('saga-dimension');
    const portal = t.portalSec ?? 0.9;
    const suction = t.suctionSec ?? 1.1;
    const swap = t.swapSec ?? 0.7;
    const field = layer.querySelector('.fx-saga-dimension-field');
    if (!field) return;
    this._applyFxCardAnchors(field, layer, { defenderSlot });
    field.style.setProperty('--dim-portal', `${portal}s`);
    field.style.setProperty('--dim-suction', `${suction}s`);
    field.style.setProperty('--dim-swap', `${swap}s`);
    field.style.setProperty('--dim-portal-at', '0s');
    field.style.setProperty('--dim-suction-at', `${portal}s`);
    field.style.setProperty('--dim-swap-at', `${portal + suction}s`);
    field.style.setProperty('--dim-total', `${(t.durationMs ?? 2700) / 1000}s`);
  }

  _initMiloNeedleFx(layer, { defenderSlot = null } = {}) {
    const t = getFxTiming('milo-scarlet-needle');
    const field = layer.querySelector('.fx-milo-needle-field');
    if (!field) return;
    this._applyFxCardAnchors(field, layer, { defenderSlot });
    const fadeOutMs = t.fadeOutMs ?? 1000;
    const totalMs = t.durationMs ?? 3900;
    const fadeStartMs = Math.max(0, totalMs - fadeOutMs);
    const glowSec = (t.phase1GlowMs ?? 2000) / 1000;
    const stabSec = t.stabSec ?? 0.22;
    const markSec = t.markSec ?? 0.5;
    field.style.setProperty('--needle-glow', `${glowSec}s`);
    field.style.setProperty('--needle-stab', `${stabSec}s`);
    field.style.setProperty('--needle-mark', `${markSec}s`);
    field.style.setProperty('--needle-impact-at', `${glowSec + stabSec}s`);
    layer.style.setProperty('--milo-fade-at', `${fadeStartMs / 1000}s`);
    layer.style.setProperty('--milo-fade-out', `${fadeOutMs / 1000}s`);
  }

  _initMiloAntaresFx(layer, { attackerSlot = null, defenderSlot = null } = {}) {
    const t = getFxTiming('milo-antares');
    const field = layer.querySelector('.fx-milo-antares-field');
    if (!field) return;

    const applyAntaresAnchors = () => {
      this._applyFxCardAnchors(field, layer, { attackerSlot, defenderSlot });
      const impactMs = t.impactAtMs ?? t.windupMs ?? 950;
      const windupMs = t.windupMs ?? impactMs;
      const hitSec = impactMs / 1000;
      const windupSec = windupMs / 1000;
      field.style.setProperty('--gold-impact-at', `${hitSec}s`);
      field.style.setProperty('--antares-hit-at', `${hitSec}s`);
      field.style.setProperty('--antares-hit-ms', `${impactMs}`);
      field.style.setProperty('--antares-beam-at', `${windupSec}s`);
    };

    applyAntaresAnchors();
    requestAnimationFrame(() => requestAnimationFrame(applyAntaresAnchors));
  }

  _initAiorosArrowFx(layer, { attackerSlot = null, defenderSlot = null } = {}) {
    const t = getFxTiming('aioros-golden-arrow');
    const prepMs = t.prepMs ?? 500;
    const flightMs = t.flightMs ?? 900;
    const burstMs = t.burstMs ?? 500;
    const field = layer.querySelector('.fx-aioros-arrow-field');
    if (!field) return;
    const start = this._cardCenterInAttackFxLayer(attackerSlot, layer);
    const end = this._cardCenterInAttackFxLayer(defenderSlot, layer);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    const prepSec = prepMs / 1000;
    const flightSec = flightMs / 1000;
    const burstSec = burstMs / 1000;
    field.style.setProperty('--arr-sx', `${start.x}px`);
    field.style.setProperty('--arr-sy', `${start.y}px`);
    field.style.setProperty('--arr-tx', `${end.x}px`);
    field.style.setProperty('--arr-ty', `${end.y}px`);
    field.style.setProperty('--arr-dx', `${dx}px`);
    field.style.setProperty('--arr-dy', `${dy}px`);
    field.style.setProperty('--arr-angle', `${angle}deg`);
    field.style.setProperty('--arr-prep', `${prepSec}s`);
    field.style.setProperty('--arr-flight', `${flightSec}s`);
    field.style.setProperty('--arr-burst', `${burstSec}s`);
    field.style.setProperty('--arr-impact-at', `${prepSec + flightSec}s`);
    field.style.setProperty('--arr-total', `${(t.durationMs ?? 2700) / 1000}s`);
  }

  _initAiorosThunderFx(layer, { defenderSlot = null, isPlayer = true } = {}, timingId = 'aioros-atomic-thunder') {
    const t = getFxTiming(timingId);
    const boltCount = t.boltCount ?? 22;
    const staggerMs = t.staggerMs ?? 75;
    const field = layer.querySelector('.fx-aioros-thunder-field');
    if (!field) return;
    this._applyFxCardAnchors(field, layer, { defenderSlot });
    const benchEl = isPlayer ? this.els.oppBench : this.els.playerBench;
    const targets = [
      this._cardCenterInAttackFxLayer(defenderSlot, layer),
      ...this._benchCentersInAttackFxLayer(benchEl, layer),
    ];
    const impactMs = 550;
    for (let i = 0; i < boltCount; i++) {
      const target = targets[i % targets.length];
      const bolt = document.createElement('span');
      bolt.className = 'fx-aioros-thunder-bolt';
      bolt.style.left = `${target.x}px`;
      bolt.style.top = `${-20 - (i % 4) * 12}px`;
      bolt.style.setProperty('--bolt-tx', `${target.x}px`);
      bolt.style.setProperty('--bolt-ty', `${target.y}px`);
      bolt.style.setProperty('--bolt-delay', `${impactMs + i * staggerMs}ms`);
      bolt.style.setProperty('--bolt-dur', `${120 + (i % 5) * 18}ms`);
      field.appendChild(bolt);
    }
  }

  /** Aldébaran — Corne du Taureau: glow 0–4s puis charge; vidéo overlay/play dès t=0 (seek MP4 à videoStartSec). */
  _initGreatHornFx(layer, { attackerSlot = null, defenderSlot = null } = {}) {
    const t = getFxTiming('aldebaran-great-horn');
    const glowMs = t.glowMs ?? 4000;
    const chargeMs = t.chargeMs ?? 1700;
    const fadeMs = t.videoFadeMs ?? 1000;
    const totalMs = t.durationMs ?? glowMs + chargeMs + fadeMs;
    const fadeStartMs = Math.max(0, totalMs - fadeMs);
    const impactAt =
      t.impactAtMs ?? glowMs + Math.round(chargeMs * (t.chargeImpactRatio ?? 0.72));

    const game = this.els.game;
    if (game) {
      game.style.setProperty('--gh-total', `${totalMs / 1000}s`);
      game.style.setProperty('--gh-glow', `${glowMs / 1000}s`);
      game.style.setProperty('--gh-charge', `${chargeMs / 1000}s`);
      game.style.setProperty('--gh-impact-at', `${impactAt / 1000}s`);
      game.style.setProperty('--gh-video-fade-at', `${fadeStartMs / 1000}s`);
      game.style.setProperty('--gh-video-fade', `${fadeMs / 1000}s`);
    }
    layer.style.setProperty('--gh-glow', `${glowMs / 1000}s`);
    layer.style.setProperty('--gh-charge', `${chargeMs / 1000}s`);
    layer.style.setProperty('--gh-impact-at', `${impactAt / 1000}s`);
    layer.style.setProperty('--gh-video-fade-at', `${fadeStartMs / 1000}s`);
    layer.style.setProperty('--gh-video-fade', `${fadeMs / 1000}s`);

    if (attackerSlot && defenderSlot) {
      const start = this._cardCenterInAttackFxLayer(attackerSlot, layer);
      const end = this._cardCenterInAttackFxLayer(defenderSlot, layer);
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const len = Math.hypot(dx, dy) || 1;
      const travel = Math.max(40, len * 0.88);
      const chargeDx = (dx / len) * travel;
      const chargeDy = (dy / len) * travel;
      attackerSlot.style.setProperty('--gh-dx', `${chargeDx}px`);
      attackerSlot.style.setProperty('--gh-dy', `${chargeDy}px`);

      const flash = layer.querySelector('.fx-greathorn-impact-flash');
      if (flash) {
        flash.style.left = `${end.x}px`;
        flash.style.top = `${end.y}px`;
      }
    }

    const video = layer.querySelector('.fx-shura-greathorn-video');
    if (video) {
      const startSec = t.videoStartSec ?? 3;
      video.volume = 1;
      video.muted = false;
      const playFromSeek = () => {
        try {
          video.currentTime = Math.max(0, startSec);
        } catch {
          /* metadata not ready */
        }
        const p = video.play?.();
        if (p?.catch) {
          p.catch((err) => {
            console.warn('[attack-fx] CorneTaureau autoplay blocked', err);
            this._queueFxVideoGestureRetry(video, 'aldebaran-great-horn', startSec, {
              muteUntilSeeked: false,
            });
          });
        }
      };
      if (video.readyState >= 1) playFromSeek();
      else video.addEventListener('loadedmetadata', playFromSeek, { once: true });
    }
    if (!video) return;
    clearTimeout(this._greathornVideoTimer);
    video.style.setProperty('--gh-video-fade-at', `${fadeStartMs / 1000}s`);
    video.style.setProperty('--gh-video-fade', `${fadeMs / 1000}s`);
    video.classList.add('fx-greathorn-video-active');
    this._greathornVideoTimer = setTimeout(() => {
      try {
        video.pause();
      } catch {
        /* ignore */
      }
    }, totalMs);
  }

  /** Shina — Les griffes du tonnerre: vidéo semi-transparente en overlay (ThunderClaw.mp4). */
  _initShinaThunderClawFx(layer) {
    const t = getFxTiming('shina-thunder-claw');
    const totalMs = t.durationMs ?? 5800;
    const fadeMs = t.videoFadeOutMs ?? 700;
    const fadeStartMs = Math.max(0, totalMs - fadeMs);
    const opacity = t.videoOpacity ?? 0.35;
    const fadeInMs = t.videoFadeInMs ?? 350;

    const game = this.els.game;
    if (game) {
      game.style.setProperty('--stc-total', `${totalMs / 1000}s`);
      game.style.setProperty('--stc-video-opacity', String(opacity));
      game.style.setProperty('--stc-video-fade-at', `${fadeStartMs / 1000}s`);
      game.style.setProperty('--stc-video-fade', `${fadeMs / 1000}s`);
      game.style.setProperty('--stc-video-fade-in', `${fadeInMs / 1000}s`);
    }
    layer.style.setProperty('--stc-video-opacity', String(opacity));
    layer.style.setProperty('--stc-video-fade-at', `${fadeStartMs / 1000}s`);
    layer.style.setProperty('--stc-video-fade', `${fadeMs / 1000}s`);
    layer.style.setProperty('--stc-video-fade-in', `${fadeInMs / 1000}s`);

    const video = layer.querySelector('.fx-shina-thunder-claw-video');
    if (!video) return;
    const startSec = t.videoStartSec ?? 0;
    video.volume = 1;
    video.muted = false;
    const playFromSeek = () => {
      try {
        video.currentTime = Math.max(0, startSec);
      } catch {
        /* metadata not ready */
      }
      const p = video.play?.();
      if (p?.catch) {
        p.catch((err) => {
          console.warn('[attack-fx] ThunderClaw autoplay blocked', err);
          this._queueFxVideoGestureRetry(video, 'shina-thunder-claw', startSec, {
            muteUntilSeeked: false,
          });
        });
      }
    };
    if (video.readyState >= 1) playFromSeek();
    else video.addEventListener('loadedmetadata', playFromSeek, { once: true });

    clearTimeout(this._shinaThunderClawVideoTimer);
    video.classList.add('fx-shina-thunder-claw-video-active');
    this._shinaThunderClawVideoTimer = setTimeout(() => {
      try {
        video.pause();
      } catch {
        /* ignore */
      }
    }, totalMs);
  }

  /** Ichi — Combo griffes: vidéo semi-transparente en overlay (KataCobra.mp4). */
  _initIchiComboGriffeFx(layer) {
    const t = getFxTiming('ichi-combo-griffe');
    const totalMs = t.durationMs ?? 10070;
    const fadeMs = t.videoFadeOutMs ?? 700;
    const fadeStartMs = Math.max(0, totalMs - fadeMs);
    const opacity = t.videoOpacity ?? 0.35;
    const videoVol = t.videoVolume ?? 0.35;
    const fadeInMs = t.videoFadeInMs ?? 350;

    const game = this.els.game;
    if (game) {
      game.style.setProperty('--icg-total', `${totalMs / 1000}s`);
      game.style.setProperty('--icg-video-opacity', String(opacity));
      game.style.setProperty('--icg-video-fade-at', `${fadeStartMs / 1000}s`);
      game.style.setProperty('--icg-video-fade', `${fadeMs / 1000}s`);
      game.style.setProperty('--icg-video-fade-in', `${fadeInMs / 1000}s`);
    }
    layer.style.setProperty('--icg-video-opacity', String(opacity));
    layer.style.setProperty('--icg-video-fade-at', `${fadeStartMs / 1000}s`);
    layer.style.setProperty('--icg-video-fade', `${fadeMs / 1000}s`);
    layer.style.setProperty('--icg-video-fade-in', `${fadeInMs / 1000}s`);

    const video = layer.querySelector('.fx-ichi-combo-griffe-video');
    if (!video) return;
    const startSec = t.videoStartSec ?? 0;
    video.volume = videoVol;
    video.muted = false;
    const playFromSeek = () => {
      try {
        video.currentTime = Math.max(0, startSec);
      } catch {
        /* metadata not ready */
      }
      const p = video.play?.();
      if (p?.catch) {
        p.catch((err) => {
          console.warn('[attack-fx] KataCobra autoplay blocked', err);
          this._queueFxVideoGestureRetry(video, 'ichi-combo-griffe', startSec, {
            muteUntilSeeked: false,
          });
        });
      }
    };
    if (video.readyState >= 1) playFromSeek();
    else video.addEventListener('loadedmetadata', playFromSeek, { once: true });

    clearTimeout(this._ichiComboGriffeVideoTimer);
    video.classList.add('fx-ichi-combo-griffe-video-active');
    this._ichiComboGriffeVideoTimer = setTimeout(() => {
      try {
        video.pause();
      } catch {
        /* ignore */
      }
    }, totalMs);
  }

  /** Phénix — Hoyoku Tensho / Battement d'ailes: vidéo semi-transparente (BattementDailes.mp4). */
  _initPhoenixHoyokuFx(layer) {
    const pt = getFxTiming('phoenix-hoyoku-tensho');
    const concentrationMs = pt.concentrationMs ?? 5000;
    const stormMs = pt.stormMs ?? pt.burstMs ?? 10000;
    const fadeOutMs = Math.max(1000, pt.fadeOutMs ?? 1500);
    const totalMs = pt.durationMs ?? concentrationMs + stormMs + fadeOutMs;
    const videoFadeInMs = Math.max(2200, pt.videoFadeInMs ?? 4200);
    const videoStartDelayMs = Math.max(0, pt.videoStartDelayMs ?? 0);
    const videoInitialInvisibleMs = Math.max(0, pt.videoInitialInvisibleMs ?? 0);
    const videoFadeOutAdvanceMs = Math.max(0, pt.videoFadeOutAdvanceMs ?? 3000);
    const fadeAtMs = Math.max(0, totalMs - fadeOutMs);
    const videoFadeInStartMs = Math.max(videoInitialInvisibleMs, videoStartDelayMs);
    const videoFadeAtMs = Math.max(videoFadeInStartMs, fadeAtMs - videoFadeOutAdvanceMs);

    const video = layer.querySelector('.fx-phoenix-hoyoku-video');
    if (!video) return;
    video.style.setProperty('--phoenix-video-fade-in-start', `${videoFadeInStartMs / 1000}s`);
    video.style.setProperty('--phoenix-video-fade-in', `${videoFadeInMs / 1000}s`);
    video.style.setProperty('--phoenix-video-fade-at', `${videoFadeAtMs / 1000}s`);
    video.style.setProperty('--phoenix-video-fade', `${fadeOutMs / 1000}s`);
    clearTimeout(this._phoenixVideoTimer);
    video.classList.add('fx-phoenix-hoyoku-video-active');
    this._phoenixVideoTimer = setTimeout(() => {
      try {
        video.pause();
      } catch {
        /* ignore */
      }
    }, totalMs);
  }

  /** Kagaho — Ankh Sacrificielle: vidéo semi-transparente + tourbillons de flamme vers le défenseur. */
  _initKagahoAnkhSacrificielleFx(layer, { attackerSlot = null, defenderSlot = null } = {}) {
    const t = getFxTiming('kagaho-ankh-sacrificielle');
    const totalMs = t.durationMs ?? 10106;
    const fadeMs = t.videoFadeOutMs ?? 1000;
    const fadeStartMs = Math.max(0, totalMs - fadeMs);
    const opacity = t.videoOpacity ?? 0.3;
    const videoVol = t.videoVolume ?? 0.35;
    const fadeInMs = t.videoFadeInMs ?? 350;
    const whirlCount = t.flameWhirlCount ?? 8;
    const whirlStartMs = t.flameWhirlStartMs ?? 400;
    const whirlStaggerMs = t.flameWhirlStaggerMs ?? 300;
    const whirlFlightMs = t.flameWhirlFlightMs ?? 2400;

    const game = this.els.game;
    if (game) {
      game.style.setProperty('--kas-total', `${totalMs / 1000}s`);
      game.style.setProperty('--kas-sparkle-dur', `${totalMs / 1000}s`);
      game.style.setProperty('--kas-video-opacity', String(opacity));
      game.style.setProperty('--kas-video-fade-at', `${fadeStartMs / 1000}s`);
      game.style.setProperty('--kas-video-fade', `${fadeMs / 1000}s`);
      game.style.setProperty('--kas-video-fade-in', `${fadeInMs / 1000}s`);
    }

    const field = layer.querySelector('.fx-kagaho-ankh-sacrificielle-field');
    const whirlsEl = field?.querySelector('.fx-kagaho-ankh-flame-whirls');
    if (field && whirlsEl && attackerSlot && defenderSlot) {
      this._applyFxCardAnchors(field, layer, { attackerSlot, defenderSlot });
      const start = this._cardCenterInAttackFxLayer(attackerSlot, layer);
      const end = this._cardCenterInAttackFxLayer(defenderSlot, layer);
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const len = Math.hypot(dx, dy) || 1;
      const perpX = -dy / len;
      const perpY = dx / len;
      const rand = (a, b) => a + Math.random() * (b - a);

      field.style.setProperty('--kas-whirl-flight', `${whirlFlightMs / 1000}s`);
      whirlsEl.replaceChildren();
      for (let i = 0; i < whirlCount; i++) {
        const spread = rand(-38, 38);
        const el = document.createElement('span');
        el.className = 'fx-kagaho-ankh-flame-whirl';
        el.style.setProperty('--kas-whirl-sx', `${start.x + perpX * spread}px`);
        el.style.setProperty('--kas-whirl-sy', `${start.y + perpY * spread}px`);
        el.style.setProperty('--kas-whirl-dx', `${dx + rand(-22, 22)}px`);
        el.style.setProperty('--kas-whirl-dy', `${dy + rand(-18, 18)}px`);
        el.style.setProperty('--kas-whirl-delay', `${(whirlStartMs + i * whirlStaggerMs) / 1000}s`);
        el.style.setProperty('--kas-whirl-rot0', `${rand(-48, 48)}deg`);
        el.style.setProperty('--kas-whirl-rot1', `${rand(480, 840)}deg`);
        el.style.setProperty('--kas-whirl-scale', `${rand(0.72, 1.18).toFixed(2)}`);
        whirlsEl.appendChild(el);
      }
    }
    layer.style.setProperty('--kas-video-opacity', String(opacity));
    layer.style.setProperty('--kas-video-fade-at', `${fadeStartMs / 1000}s`);
    layer.style.setProperty('--kas-video-fade', `${fadeMs / 1000}s`);
    layer.style.setProperty('--kas-video-fade-in', `${fadeInMs / 1000}s`);

    const video = layer.querySelector('.fx-kagaho-ankh-sacrificielle-video');
    if (!video) return;
    const startSec = t.videoStartSec ?? 0;
    video.volume = videoVol;
    video.muted = false;
    const playFromSeek = () => {
      try {
        video.currentTime = Math.max(0, startSec);
      } catch {
        /* metadata not ready */
      }
      const p = video.play?.();
      if (p?.catch) {
        p.catch((err) => {
          console.warn('[attack-fx] Kagaho1 autoplay blocked', err);
          this._queueFxVideoGestureRetry(video, 'kagaho-ankh-sacrificielle', startSec, {
            muteUntilSeeked: false,
          });
        });
      }
    };
    if (video.readyState >= 1) playFromSeek();
    else video.addEventListener('loadedmetadata', playFromSeek, { once: true });

    clearTimeout(this._kagahoAnkhSacrificielleVideoTimer);
    video.classList.add('fx-kagaho-ankh-sacrificielle-video-active');
    this._kagahoAnkhSacrificielleVideoTimer = setTimeout(() => {
      try {
        video.pause();
      } catch {
        /* ignore */
      }
    }, totalMs);
  }

  /** Misty — Tourbillon du Lézard: vidéo semi-transparente en overlay (Misty1.mp4). */
  _initMistyTourbillonLezardFx(layer) {
    const t = getFxTiming('misty-tourbillon-lezard');
    const totalMs = t.durationMs ?? 7000;
    const fadeMs = t.videoFadeOutMs ?? 700;
    const fadeStartMs = Math.max(0, totalMs - fadeMs);
    const opacity = t.videoOpacity ?? 0.35;
    const videoVol = t.videoVolume ?? 0.35;
    const fadeInMs = t.videoFadeInMs ?? 350;

    const game = this.els.game;
    if (game) {
      game.style.setProperty('--mtl-total', `${totalMs / 1000}s`);
      game.style.setProperty('--mtl-video-opacity', String(opacity));
      game.style.setProperty('--mtl-video-fade-at', `${fadeStartMs / 1000}s`);
      game.style.setProperty('--mtl-video-fade', `${fadeMs / 1000}s`);
      game.style.setProperty('--mtl-video-fade-in', `${fadeInMs / 1000}s`);
    }
    layer.style.setProperty('--mtl-video-opacity', String(opacity));
    layer.style.setProperty('--mtl-video-fade-at', `${fadeStartMs / 1000}s`);
    layer.style.setProperty('--mtl-video-fade', `${fadeMs / 1000}s`);
    layer.style.setProperty('--mtl-video-fade-in', `${fadeInMs / 1000}s`);

    const video = layer.querySelector('.fx-misty-tourbillon-lezard-video');
    if (!video) return;
    const startSec = t.videoStartSec ?? 0;
    video.volume = videoVol;
    video.muted = false;
    const playFromSeek = () => {
      try {
        video.currentTime = Math.max(0, startSec);
      } catch {
        /* metadata not ready */
      }
      const p = video.play?.();
      if (p?.catch) {
        p.catch((err) => {
          console.warn('[attack-fx] Misty1 autoplay blocked', err);
          this._queueFxVideoGestureRetry(video, 'misty-tourbillon-lezard', startSec, {
            muteUntilSeeked: false,
          });
        });
      }
    };
    if (video.readyState >= 1) playFromSeek();
    else video.addEventListener('loadedmetadata', playFromSeek, { once: true });

    clearTimeout(this._mistyTourbillonLezardVideoTimer);
    video.classList.add('fx-misty-tourbillon-lezard-video-active');
    this._mistyTourbillonLezardVideoTimer = setTimeout(() => {
      try {
        video.pause();
      } catch {
        /* ignore */
      }
    }, totalMs);
  }

  /** Poséidon — Trident Royal: vidéo semi-transparente (Trident.mp4 lethal, TridentCourt.mp4 otherwise). */
  _initPoseidonTridentRoyalFx(layer, opts = {}) {
    const t = poseidonTridentRoyalTiming(
      getFxTiming('poseidon-trident-royal'),
      opts.attackLethal !== false,
    );
    const totalMs = t.durationMs ?? 6778;
    const fadeMs = t.videoFadeOutMs ?? 700;
    const fadeStartMs = Math.max(0, totalMs - fadeMs);
    const opacity = t.videoOpacity ?? 0.35;
    const videoVol = t.videoVolume ?? 0.35;
    const fadeInMs = t.videoFadeInMs ?? 350;

    const game = this.els.game;
    if (game) {
      game.style.setProperty('--ptr-total', `${totalMs / 1000}s`);
      game.style.setProperty('--ptr-video-opacity', String(opacity));
      game.style.setProperty('--ptr-video-fade-at', `${fadeStartMs / 1000}s`);
      game.style.setProperty('--ptr-video-fade', `${fadeMs / 1000}s`);
      game.style.setProperty('--ptr-video-fade-in', `${fadeInMs / 1000}s`);
    }
    layer.style.setProperty('--ptr-video-opacity', String(opacity));
    layer.style.setProperty('--ptr-video-fade-at', `${fadeStartMs / 1000}s`);
    layer.style.setProperty('--ptr-video-fade', `${fadeMs / 1000}s`);
    layer.style.setProperty('--ptr-video-fade-in', `${fadeInMs / 1000}s`);

    const video = layer.querySelector('.fx-poseidon-trident-royal-video');
    if (!video) return;
    const startSec = t.videoStartSec ?? 0;
    video.volume = videoVol;
    video.muted = false;
    const playFromSeek = () => {
      try {
        video.currentTime = Math.max(0, startSec);
      } catch {
        /* metadata not ready */
      }
      const p = video.play?.();
      if (p?.catch) {
        p.catch((err) => {
          console.warn('[attack-fx] Trident autoplay blocked', err);
          this._queueFxVideoGestureRetry(video, 'poseidon-trident-royal', startSec, {
            muteUntilSeeked: false,
          });
        });
      }
    };
    if (video.readyState >= 1) playFromSeek();
    else video.addEventListener('loadedmetadata', playFromSeek, { once: true });

    clearTimeout(this._poseidonTridentRoyalVideoTimer);
    video.classList.add('fx-poseidon-trident-royal-video-active');
    this._poseidonTridentRoyalVideoTimer = setTimeout(() => {
      try {
        video.pause();
      } catch {
        /* ignore */
      }
    }, totalMs);
  }

  /** Andromède Noir — Chaîne serpents: vidéo semi-transparente en overlay (AndroNoir1.mp4). */
  _initAndromedeChaineSerpentFx(layer) {
    const t = getFxTiming('andromede-chaine-serpent');
    const totalMs = t.durationMs ?? 5910;
    const fadeMs = t.videoFadeOutMs ?? 700;
    const fadeStartMs = Math.max(0, totalMs - fadeMs);
    const opacity = t.videoOpacity ?? 0.32;
    const videoVol = t.videoVolume ?? 0.35;
    const fadeInMs = t.videoFadeInMs ?? 350;

    const game = this.els.game;
    if (game) {
      game.style.setProperty('--acs-total', `${totalMs / 1000}s`);
      game.style.setProperty('--acs-video-opacity', String(opacity));
      game.style.setProperty('--acs-video-fade-at', `${fadeStartMs / 1000}s`);
      game.style.setProperty('--acs-video-fade', `${fadeMs / 1000}s`);
      game.style.setProperty('--acs-video-fade-in', `${fadeInMs / 1000}s`);
    }
    layer.style.setProperty('--acs-video-opacity', String(opacity));
    layer.style.setProperty('--acs-video-fade-at', `${fadeStartMs / 1000}s`);
    layer.style.setProperty('--acs-video-fade', `${fadeMs / 1000}s`);
    layer.style.setProperty('--acs-video-fade-in', `${fadeInMs / 1000}s`);

    const video = layer.querySelector('.fx-andromede-chaine-serpent-video');
    if (!video) return;
    const startSec = t.videoStartSec ?? 0;
    video.volume = videoVol;
    video.muted = false;
    const playFromSeek = () => {
      try {
        video.currentTime = Math.max(0, startSec);
      } catch {
        /* metadata not ready */
      }
      const p = video.play?.();
      if (p?.catch) {
        p.catch((err) => {
          console.warn('[attack-fx] AndroNoir1 autoplay blocked', err);
          this._queueFxVideoGestureRetry(video, 'andromede-chaine-serpent', startSec, {
            muteUntilSeeked: false,
          });
        });
      }
    };
    if (video.readyState >= 1) playFromSeek();
    else video.addEventListener('loadedmetadata', playFromSeek, { once: true });

    clearTimeout(this._andromedeChaineSerpentVideoTimer);
    video.classList.add('fx-andromede-chaine-serpent-video-active');
    this._andromedeChaineSerpentVideoTimer = setTimeout(() => {
      try {
        video.pause();
      } catch {
        /* ignore */
      }
    }, totalMs);
  }

  /** Shakka — Trésors du Ciel: vidéo semi-transparente en overlay (Shakka1.mp4). */
  _initShakkaTresorDuCielFx(layer) {
    const t = getFxTiming('shakka-tresor-du-ciel');
    const totalMs = t.durationMs ?? 15044;
    const fadeMs = t.videoFadeOutMs ?? 700;
    const fadeStartMs = Math.max(0, totalMs - fadeMs);
    const opacity = t.videoOpacity ?? 0.32;
    const videoVol = t.videoVolume ?? 0.35;
    const fadeInMs = t.videoFadeInMs ?? 350;

    const game = this.els.game;
    if (game) {
      game.style.setProperty('--skc-total', `${totalMs / 1000}s`);
      game.style.setProperty('--skc-video-opacity', String(opacity));
      game.style.setProperty('--skc-video-fade-at', `${fadeStartMs / 1000}s`);
      game.style.setProperty('--skc-video-fade', `${fadeMs / 1000}s`);
      game.style.setProperty('--skc-video-fade-in', `${fadeInMs / 1000}s`);
    }
    layer.style.setProperty('--skc-video-opacity', String(opacity));
    layer.style.setProperty('--skc-video-fade-at', `${fadeStartMs / 1000}s`);
    layer.style.setProperty('--skc-video-fade', `${fadeMs / 1000}s`);
    layer.style.setProperty('--skc-video-fade-in', `${fadeInMs / 1000}s`);

    const video = layer.querySelector('.fx-shakka-tresor-du-ciel-video');
    if (!video) return;
    const startSec = t.videoStartSec ?? 0;
    video.volume = videoVol;
    video.muted = false;
    const playFromSeek = () => {
      try {
        video.currentTime = Math.max(0, startSec);
      } catch {
        /* metadata not ready */
      }
      const p = video.play?.();
      if (p?.catch) {
        p.catch((err) => {
          console.warn('[attack-fx] Shakka1 autoplay blocked', err);
          this._queueFxVideoGestureRetry(video, 'shakka-tresor-du-ciel', startSec, {
            muteUntilSeeked: false,
          });
        });
      }
    };
    if (video.readyState >= 1) playFromSeek();
    else video.addEventListener('loadedmetadata', playFromSeek, { once: true });

    clearTimeout(this._shakkaTresorDuCielVideoTimer);
    video.classList.add('fx-shakka-tresor-du-ciel-video-active');
    this._shakkaTresorDuCielVideoTimer = setTimeout(() => {
      try {
        video.pause();
      } catch {
        /* ignore */
      }
    }, totalMs);
  }

  /** Shura — Excalibur: vidéo semi-transparente (Shura2.mp4) + lames CSS. */
  _initShuraExcaliburFx(layer, { attackerSlot = null, defenderSlot = null, headsCount = 0 } = {}) {
    const t = getFxTiming('shura-excalibur');
    const totalMs = t.durationMs ?? 1839;
    const fadeMs = t.videoFadeOutMs ?? 300;
    const fadeStartMs = Math.max(0, totalMs - fadeMs);
    const opacity = t.videoOpacity ?? 0.32;
    const videoVol = t.videoVolume ?? 0.35;
    const fadeInMs = t.videoFadeInMs ?? 150;

    const game = this.els.game;
    if (game) {
      game.style.setProperty('--sxe-total', `${totalMs / 1000}s`);
      game.style.setProperty('--sxe-video-opacity', String(opacity));
      game.style.setProperty('--sxe-video-fade-at', `${fadeStartMs / 1000}s`);
      game.style.setProperty('--sxe-video-fade', `${fadeMs / 1000}s`);
      game.style.setProperty('--sxe-video-fade-in', `${fadeInMs / 1000}s`);
    }
    layer.style.setProperty('--sxe-video-opacity', String(opacity));
    layer.style.setProperty('--sxe-video-fade-at', `${fadeStartMs / 1000}s`);
    layer.style.setProperty('--sxe-video-fade', `${fadeMs / 1000}s`);
    layer.style.setProperty('--sxe-video-fade-in', `${fadeInMs / 1000}s`);

    const video = layer.querySelector('.fx-shura-excalibur-video');
    if (video) {
      const startSec = t.videoStartSec ?? 0;
      video.volume = videoVol;
      video.muted = false;
      const playFromSeek = () => {
        try {
          video.currentTime = Math.max(0, startSec);
        } catch {
          /* metadata not ready */
        }
        const p = video.play?.();
        if (p?.catch) {
          p.catch((err) => {
            console.warn('[attack-fx] Shura2 autoplay blocked', err);
            this._queueFxVideoGestureRetry(video, 'shura-excalibur', startSec, {
              muteUntilSeeked: false,
            });
          });
        }
      };
      if (video.readyState >= 1) playFromSeek();
      else video.addEventListener('loadedmetadata', playFromSeek, { once: true });

      clearTimeout(this._shuraExcaliburVideoTimer);
      video.classList.add('fx-shura-excalibur-video-active');
      this._shuraExcaliburVideoTimer = setTimeout(() => {
        try {
          video.pause();
        } catch {
          /* ignore */
        }
      }, totalMs);
    }

    const field = layer.querySelector('.fx-shura-excalibur-field');
    if (!field) return;
    this._applyFxCardAnchors(field, layer, { attackerSlot, defenderSlot });
    const bonus = Math.min(5, Math.max(0, (headsCount || 1) - 1));
    field.style.setProperty('--ex-slash', `${t.slashSec ?? 0.55}s`);
    field.style.setProperty('--ex-bonus-slash', `${t.bonusSlashSec ?? 0.35}s`);
    field.style.setProperty('--ex-bonus-count', String(bonus));
    for (let i = 0; i < bonus; i++) {
      const slash = document.createElement('span');
      slash.className = 'fx-shura-blade fx-shura-blade-bonus';
      slash.style.setProperty('--ex-i', String(i));
      field.appendChild(slash);
    }
  }

  /** Mu — Spirale Stellaire: vidéo semi-transparente en overlay (SpiraleStellaire.mp4). */
  _initMuSpiralStellaireFx(layer) {
    const t = getFxTiming('mu-spiral-stellaire');
    const videoEndMs = t.durationMs ?? 5800;
    const fadeMs = t.videoFadeOutMs ?? 1600;
    const fadeStartMs = Math.max(0, videoEndMs - fadeMs);
    const flashAtMs = t.flashAtMs ?? Math.max(0, videoEndMs - 200);
    const flashFadeMs = t.flashFadeMs ?? 2000;
    const fxTotalMs = Math.max(videoEndMs, flashAtMs + flashFadeMs);
    const opacity = t.videoOpacity ?? 0.48;
    const videoVol = t.videoVolume ?? 0.28;
    const fadeInMs = t.videoFadeInMs ?? 350;

    const game = this.els.game;
    if (game) {
      game.style.setProperty('--mss-total', `${fxTotalMs / 1000}s`);
      game.style.setProperty('--mss-video-opacity', String(opacity));
      game.style.setProperty('--mss-video-fade-at', `${fadeStartMs / 1000}s`);
      game.style.setProperty('--mss-video-fade', `${fadeMs / 1000}s`);
      game.style.setProperty('--mss-video-fade-in', `${fadeInMs / 1000}s`);
      game.style.setProperty('--mss-flash-at', `${flashAtMs / 1000}s`);
      game.style.setProperty('--mss-flash-fade', `${flashFadeMs / 1000}s`);
    }
    layer.style.setProperty('--mss-video-opacity', String(opacity));
    layer.style.setProperty('--mss-video-fade-at', `${fadeStartMs / 1000}s`);
    layer.style.setProperty('--mss-video-fade', `${fadeMs / 1000}s`);
    layer.style.setProperty('--mss-video-fade-in', `${fadeInMs / 1000}s`);
    layer.style.setProperty('--mss-flash-at', `${flashAtMs / 1000}s`);
    layer.style.setProperty('--mss-flash-fade', `${flashFadeMs / 1000}s`);

    const video = layer.querySelector('.fx-mu-spiral-stellaire-video');
    if (!video) return;
    const startSec = t.videoStartSec ?? 0;
    video.volume = videoVol;
    video.muted = false;
    const playFromSeek = () => {
      try {
        video.currentTime = Math.max(0, startSec);
      } catch {
        /* metadata not ready */
      }
      const p = video.play?.();
      if (p?.catch) {
        p.catch((err) => {
          console.warn('[attack-fx] SpiraleStellaire autoplay blocked', err);
          this._queueFxVideoGestureRetry(video, 'mu-spiral-stellaire', startSec, {
            muteUntilSeeked: false,
          });
        });
      }
    };
    if (video.readyState >= 1) playFromSeek();
    else video.addEventListener('loadedmetadata', playFromSeek, { once: true });

    clearTimeout(this._muSpiralStellaireVideoTimer);
    clearTimeout(this._muSpiralStellaireVideoFadeTimer);
    video.classList.remove('fx-mu-spiral-stellaire-video-fading-out');
    video.classList.add('fx-mu-spiral-stellaire-video-active');
    this._muSpiralStellaireVideoFadeTimer = setTimeout(() => {
      video.classList.add('fx-mu-spiral-stellaire-video-fading-out');
    }, fadeStartMs);
    this._muSpiralStellaireVideoTimer = setTimeout(() => {
      try {
        video.pause();
      } catch {
        /* ignore */
      }
    }, videoEndMs);
  }

  _initMuCrystalWallFx(layer, { attackerSlot = null } = {}) {
    const t = getFxTiming('mu-crystal-wall');
    const field = layer.querySelector('.fx-mu-crystal-field');
    if (!field) return;
    this._applyFxCardAnchors(field, layer, { attackerSlot });
    field.style.setProperty('--crystal-wall', `${t.wallSec ?? 1.4}s`);
    field.style.setProperty('--crystal-shatter', `${t.shatterSec ?? 0.55}s`);
    field.style.setProperty('--crystal-total', `${(t.durationMs ?? 2600) / 1000}s`);
  }

  _initMuDeathStarFx(layer, { defenderSlot = null } = {}) {
    const t = getFxTiming('mu-death-star');
    const collapse = t.collapseSec ?? 1.1;
    const nova = t.novaSec ?? 0.85;
    const fade = t.fadeSec ?? 0.65;
    const field = layer.querySelector('.fx-mu-deathstar-field');
    if (!field) return;
    this._applyFxCardAnchors(field, layer, { defenderSlot });
    field.style.setProperty('--death-collapse', `${collapse}s`);
    field.style.setProperty('--death-nova', `${nova}s`);
    field.style.setProperty('--death-fade', `${fade}s`);
    field.style.setProperty('--death-nova-at', `${collapse}s`);
    field.style.setProperty('--death-fade-at', `${collapse + nova}s`);
    field.style.setProperty('--death-total', `${(t.durationMs ?? 3000) / 1000}s`);
  }

  /** Align meteor CSS delays with audio timeline when the clip is already playing. */
  _syncPegasusMeteorFxStart(layer) {
    const t = getFxTiming('pegasus-meteors');
    const targetSec = t.meteorStartSec ?? 3;
    const field = layer.querySelector('.fx-pegasus-field');
    const veil = layer.querySelector('.fx-pegasus-veil');
    if (!field) return;

    let startSec = targetSec;
    const el = this.audio?._meteorPegaseAudio;
    if (el && !el.paused && el.currentTime > 0 && el.currentTime < targetSec) {
      startSec = Math.max(0, targetSec - el.currentTime);
    }

    const delay = `${startSec}s`;
    field.style.setProperty('--pegasus-meteor-start', delay);
    if (veil) veil.style.animationDelay = delay;
  }

  /** Météores noirs — set CSS delays from timing (no audio sync). */
  _syncBlackMeteorFxStart(layer) {
    const t = getFxTiming('black-meteors');
    const startSec = t.meteorStartSec ?? 3;
    const field = layer.querySelector('.fx-black-meteors-field');
    const veil = layer.querySelector('.fx-black-meteors-veil');
    if (!field) return;
    const delay = `${startSec}s`;
    field.style.setProperty('--black-meteor-start', delay);
    if (veil) veil.style.animationDelay = delay;
  }

  /** Foudre atomique — golden meteors, CSS delays from timing (no audio sync). */
  _syncSagittariusAtomicThunderFxStart(layer) {
    const t = getFxTiming('sagittarius-atomic-thunder');
    const startSec = t.meteorStartSec ?? 3;
    const field = layer.querySelector('.fx-sagittarius-atomic-thunder-field');
    const veil = layer.querySelector('.fx-sagittarius-atomic-thunder-veil');
    if (!field) return;
    const delay = `${startSec}s`;
    field.style.setProperty('--gold-meteor-start', delay);
    if (veil) veil.style.animationDelay = delay;
  }

  /** Météores de l'Aigle — lighter blue meteors, CSS delays from timing (no audio sync). */
  _syncEagleMeteorFxStart(layer) {
    const t = getFxTiming('eagle-meteors');
    const startSec = t.meteorStartSec ?? 3;
    const field = layer.querySelector('.fx-eagle-meteors-field');
    const veil = layer.querySelector('.fx-eagle-meteors-veil');
    if (!field) return;
    const delay = `${startSec}s`;
    field.style.setProperty('--eagle-meteor-start', delay);
    if (veil) veil.style.animationDelay = delay;
  }

  clearAttackFx() {
    const layer = this.els.attackFxLayer;
    if (!layer) return;
    clearTimeout(this._sagaExplosionGalactiqueTeardownTimer);
    this._removeSagaExplosionGalactiqueLayerVars(layer);
    this._clearFxVideoRetryMarkers(layer);
    const videos = layer.querySelectorAll('video');
    for (const video of videos) {
      try {
        video.pause();
        video.currentTime = 0;
        video.removeAttribute('src');
        video.load();
      } catch {
        /* ignore media cleanup errors */
      }
    }
    layer.className = 'attack-fx-layer';
    layer.innerHTML = '';
    layer.setAttribute('aria-hidden', 'true');
  }

  /**
   * Impact positions in a disk on the defender active knight (diameter ≈ 2× card height).
   * @param {number} count
   * @param {HTMLElement | null} defenderSlot
   * @returns {{ x: number, y: number }[]} percentages within #attack-fx-layer
   */
  meteorImpactSpotsInCircle(count, defenderSlot, centerBias = 2.6) {
    const layer = this.els.attackFxLayer;
    if (!layer || !defenderSlot) {
      return [{ x: 50, y: 38 }];
    }
    const layerRect = layer.getBoundingClientRect();
    if (layerRect.width < 1 || layerRect.height < 1) {
      return [{ x: 50, y: 38 }];
    }
    const slotRect = defenderSlot.getBoundingClientRect();
    const card = defenderSlot.querySelector('.card');
    const cardRect = card?.getBoundingClientRect() ?? slotRect;
    const cardH = cardRect.height > 0 ? cardRect.height : 218;
    const radiusPx = cardH;
    const cx = slotRect.left + slotRect.width / 2 - layerRect.left;
    const cy = slotRect.top + slotRect.height / 2 - layerRect.top;
    const bias = Math.max(1.05, centerBias);
    const spots = [];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.pow(Math.random(), bias) * radiusPx;
      const xPx = cx + Math.cos(angle) * r;
      const yPx = cy + Math.sin(angle) * r;
      spots.push({
        x: (xPx / layerRect.width) * 100,
        y: (yPx / layerRect.height) * 100,
      });
    }
    return spots;
  }

  _fxStepMarkup(prefix, steps) {
    return steps
      .map((step) => `<span class="${prefix}-step ${prefix}-${step}"></span>`)
      .join('');
  }

  /** Phased gold-saint timing (wind-up → impact → aftermath), like pegasus/medusa. */
  _goldFxPhaseStyle(overrides = {}) {
    const windup = overrides.windup ?? 0.75;
    const impact = overrides.impact ?? 1.1;
    const after = overrides.after ?? 1.15;
    const dur = overrides.dur ?? 3;
    const impactAt = windup;
    const afterAt = windup + impact;
    return [
      `--gold-fx-dur:${dur}s`,
      `--gold-windup:${windup}s`,
      `--gold-impact:${impact}s`,
      `--gold-after:${after}s`,
      `--gold-impact-at:${impactAt}s`,
      `--gold-after-at:${afterAt}s`,
      `--gold-total:${dur}s`,
    ].join(';');
  }

  _pushGoldAnimeBase(push, theme, phaseStyle = '') {
    const style = phaseStyle ? ` style="${phaseStyle}"` : '';
    push(`<div class="attack-fx-overlay attack-fx-overlay--${theme}"${style}></div>`);
    push(`<div class="fx-anime-speedline-field"${style}>`);
    for (let i = 0; i < 14; i++) {
      push(`<span class="fx-anime-speedline" style="--i:${i}"></span>`);
    }
    push('</div>');
  }

  _pushGoldScreenFlash(push, phaseStyle, extraClass = '') {
    push(
      `<div class="fx-anime-screenflash ${extraClass}" style="${phaseStyle}" aria-hidden="true"></div>`,
    );
  }

  buildAttackFxHtml(
    fxId,
    {
      isPlayer,
      headsCount = 0,
      coin,
      damage,
      defenderSlot = null,
      attackerSlot = null,
      discardedEnergyCount = 0,
      attackLethal,
    },
  ) {
    const n = Math.max(1, Math.min(headsCount || 3, 8));
    const parts = [];
    const dur = '3s';

    const push = (html) => parts.push(html);
    const steps = (prefix, list) => push(this._fxStepMarkup(prefix, list));

    switch (fxId) {
      case 'pegasus-meteors': {
        const t = getFxTiming('pegasus-meteors');
        const count = t.count ?? 42;
        const sparksPerHit = t.sparksPerHit ?? 5;
        const ballPx = t.ballPx ?? 36;
        const centerBias = t.centerBias ?? 2.6;
        const meteorStartSec = t.meteorStartSec ?? 3;
        const staggerSec = t.staggerSec ?? 0.0603;
        const fallSec = t.fallSec ?? 0.14;
        const burstDelaySec = t.burstDelaySec ?? 0.268;
        const burstSec = t.burstSec ?? 0.509;
        const veilSec = t.veilSec ?? 1.273;
        const fieldStyle = [
          `--pegasus-ball:${ballPx}px`,
          `--pegasus-meteor-start:${meteorStartSec}s`,
          `--pegasus-stagger:${staggerSec}s`,
          `--pegasus-fall:${fallSec}s`,
          `--pegasus-burst-delay:${burstDelaySec}s`,
          `--pegasus-burst:${burstSec}s`,
          `--pegasus-veil:${veilSec}s`,
        ].join(';');
        push(`<div class="fx-pegasus-field" style="${fieldStyle}">`);
        const spots = this.meteorImpactSpotsInCircle(count, defenderSlot, centerBias);
        for (let i = 0; i < spots.length; i++) {
          const { x, y } = spots[i];
          push(
            `<span class="fx-pegasus-meteor" style="--x:${x.toFixed(1)}%;--y:${y.toFixed(1)}%;--i:${i}"></span>`,
          );
          push(
            `<span class="fx-pegasus-burst" style="--x:${x.toFixed(1)}%;--y:${y.toFixed(1)}%;--i:${i}"></span>`,
          );
          for (let s = 0; s < sparksPerHit; s++) {
            const ang = (s / sparksPerHit) * 360 + Math.random() * 48;
            const dist = 26 + Math.random() * 30;
            const rad = (ang * Math.PI) / 180;
            const dx = Math.cos(rad) * dist;
            const dy = Math.sin(rad) * dist;
            push(
              `<span class="fx-pegasus-spark" style="--x:${x.toFixed(1)}%;--y:${y.toFixed(1)}%;--i:${i};--dx:${dx.toFixed(0)}px;--dy:${dy.toFixed(0)}px"></span>`,
            );
          }
        }
        push('</div>');
        push(
          `<div class="fx-pegasus-veil" style="animation-delay:var(--pegasus-meteor-start,${meteorStartSec}s)"></div>`,
        );
        break;
      }
      case 'black-meteors': {
        const t = getFxTiming('black-meteors');
        const count = t.count ?? 42;
        const sparksPerHit = t.sparksPerHit ?? 5;
        const ballPx = t.ballPx ?? 36;
        const centerBias = t.centerBias ?? 2.6;
        const meteorStartSec = t.meteorStartSec ?? 3;
        const staggerSec = t.staggerSec ?? 0.0603;
        const fallSec = t.fallSec ?? 0.14;
        const burstDelaySec = t.burstDelaySec ?? 0.268;
        const burstSec = t.burstSec ?? 0.509;
        const veilSec = t.veilSec ?? 1.273;
        const fieldStyle = [
          `--black-meteor-ball:${ballPx}px`,
          `--black-meteor-start:${meteorStartSec}s`,
          `--black-meteor-stagger:${staggerSec}s`,
          `--black-meteor-fall:${fallSec}s`,
          `--black-meteor-burst-delay:${burstDelaySec}s`,
          `--black-meteor-burst:${burstSec}s`,
          `--black-meteor-veil:${veilSec}s`,
        ].join(';');
        push(`<div class="fx-black-meteors-field" style="${fieldStyle}">`);
        const spots = this.meteorImpactSpotsInCircle(count, defenderSlot, centerBias);
        for (let i = 0; i < spots.length; i++) {
          const { x, y } = spots[i];
          push(
            `<span class="fx-black-meteors-meteor" style="--x:${x.toFixed(1)}%;--y:${y.toFixed(1)}%;--i:${i}"></span>`,
          );
          push(
            `<span class="fx-black-meteors-burst" style="--x:${x.toFixed(1)}%;--y:${y.toFixed(1)}%;--i:${i}"></span>`,
          );
          for (let s = 0; s < sparksPerHit; s++) {
            const ang = (s / sparksPerHit) * 360 + Math.random() * 48;
            const dist = 26 + Math.random() * 30;
            const rad = (ang * Math.PI) / 180;
            const dx = Math.cos(rad) * dist;
            const dy = Math.sin(rad) * dist;
            push(
              `<span class="fx-black-meteors-spark" style="--x:${x.toFixed(1)}%;--y:${y.toFixed(1)}%;--i:${i};--dx:${dx.toFixed(0)}px;--dy:${dy.toFixed(0)}px"></span>`,
            );
          }
        }
        push('</div>');
        push(
          `<div class="fx-black-meteors-veil" style="animation-delay:var(--black-meteor-start,${meteorStartSec}s)"></div>`,
        );
        break;
      }
      case 'sagittarius-atomic-thunder': {
        const t = getFxTiming('sagittarius-atomic-thunder');
        const count = t.count ?? 42;
        const sparksPerHit = t.sparksPerHit ?? 5;
        const ballPx = t.ballPx ?? 36;
        const centerBias = t.centerBias ?? 2.6;
        const meteorStartSec = t.meteorStartSec ?? 3;
        const staggerSec = t.staggerSec ?? 0.0603;
        const fallSec = t.fallSec ?? 0.14;
        const burstDelaySec = t.burstDelaySec ?? 0.268;
        const burstSec = t.burstSec ?? 0.509;
        const veilSec = t.veilSec ?? 1.273;
        const fieldStyle = [
          `--gold-meteor-ball:${ballPx}px`,
          `--gold-meteor-start:${meteorStartSec}s`,
          `--gold-meteor-stagger:${staggerSec}s`,
          `--gold-meteor-fall:${fallSec}s`,
          `--gold-meteor-burst-delay:${burstDelaySec}s`,
          `--gold-meteor-burst:${burstSec}s`,
          `--gold-meteor-veil:${veilSec}s`,
        ].join(';');
        push(`<div class="fx-sagittarius-atomic-thunder-field" style="${fieldStyle}">`);
        const spots = this.meteorImpactSpotsInCircle(count, defenderSlot, centerBias);
        for (let i = 0; i < spots.length; i++) {
          const { x, y } = spots[i];
          push(
            `<span class="fx-sagittarius-atomic-thunder-meteor" style="--x:${x.toFixed(1)}%;--y:${y.toFixed(1)}%;--i:${i}"></span>`,
          );
          push(
            `<span class="fx-sagittarius-atomic-thunder-burst" style="--x:${x.toFixed(1)}%;--y:${y.toFixed(1)}%;--i:${i}"></span>`,
          );
          for (let s = 0; s < sparksPerHit; s++) {
            const ang = (s / sparksPerHit) * 360 + Math.random() * 48;
            const dist = 26 + Math.random() * 30;
            const rad = (ang * Math.PI) / 180;
            const dx = Math.cos(rad) * dist;
            const dy = Math.sin(rad) * dist;
            push(
              `<span class="fx-sagittarius-atomic-thunder-spark" style="--x:${x.toFixed(1)}%;--y:${y.toFixed(1)}%;--i:${i};--dx:${dx.toFixed(0)}px;--dy:${dy.toFixed(0)}px"></span>`,
            );
          }
        }
        push('</div>');
        push(
          `<div class="fx-sagittarius-atomic-thunder-veil" style="animation-delay:var(--gold-meteor-start,${meteorStartSec}s)"></div>`,
        );
        break;
      }
      case 'dragon-wrath': {
        const dt = getFxTiming('dragon-wrath');
        const p1 = (dt.phase1Ms ?? 700) / 1000;
        const p2 = (dt.phase2Ms ?? 800) / 1000;
        const p3 = (dt.phase3Ms ?? 1000) / 1000;
        const p3Strike = (dt.phase3StrikeMs ?? Math.round((dt.phase3Ms ?? 1000) * 0.52)) / 1000;
        const p4 = (dt.phase4Ms ?? 400) / 1000;
        const total = (dt.durationMs ?? 2900) / 1000;
        const p2At = p1;
        const p3At = p1 + p2;
        const p4At = p1 + p2 + p3;
        const impactAt = p3At + p3Strike * 0.92;
        const vars = [
          `--dw-total:${total}s`,
          `--dw-p1:${p1}s`,
          `--dw-p2:${p2}s`,
          `--dw-p3:${p3}s`,
          `--dw-p3-strike:${p3Strike}s`,
          `--dw-p4:${p4}s`,
          `--dw-p2-at:${p2At}s`,
          `--dw-p3-at:${p3At}s`,
          `--dw-p4-at:${p4At}s`,
          `--dw-impact-at:${impactAt}s`,
        ].join(';');
        push(`<div class="fx-dragon-wrath-field" style="${vars}">`);
        push('<div class="fx-dragon-board-darken" aria-hidden="true"></div>');
        push('<div class="fx-dragon-attacker-aura" aria-hidden="true"></div>');
        push('<div class="fx-dragon-cosmo-fist" aria-hidden="true"></div>');
        push('<div class="fx-dragon-orbit-particles" aria-hidden="true"></div>');
        push('<div class="fx-dragon-silhouette-back" aria-hidden="true"></div>');
        push('<div class="fx-dragon-light-tunnel" aria-hidden="true">');
        push('<div class="fx-dragon-tunnel-glow"></div>');
        push('<div class="fx-dragon-tunnel-core"></div>');
        push('<div class="fx-dragon-tunnel-rim"></div>');
        push('</div>');
        push('<div class="fx-dragon-serpent-wrap" aria-hidden="true">');
        push('<div class="fx-dragon-body-segments"></div>');
        push('<div class="fx-dragon-strike-beam" aria-hidden="true">');
        push('<div class="fx-dragon-strike-beam-core"></div>');
        push('<div class="fx-dragon-strike-beam-tip" aria-hidden="true"></div>');
        push('</div>');
        push(
          '<svg class="fx-dragon-head-svg" viewBox="0 0 100 72" aria-hidden="true">' +
            '<defs>' +
            '<linearGradient id="dw-head-fill" x1="0%" y1="0%" x2="100%" y2="100%">' +
            '<stop offset="0%" stop-color="#2ee86a"/><stop offset="45%" stop-color="#0db84a"/>' +
            '<stop offset="100%" stop-color="#066b2c"/></linearGradient>' +
            '<radialGradient id="dw-eye-g" cx="50%" cy="50%" r="50%">' +
            '<stop offset="0%" stop-color="#e8fff0"/><stop offset="55%" stop-color="#5cff9a"/>' +
            '<stop offset="100%" stop-color="#00c853" stop-opacity="0"/></radialGradient></defs>' +
            '<path class="fx-dragon-head-skull" d="M8 38 C18 18 42 10 68 22 C82 30 88 42 82 52 C72 64 48 68 28 62 C14 56 6 48 8 38Z" fill="url(#dw-head-fill)"/>' +
            '<path class="fx-dragon-jaw" d="M22 48 C34 58 58 60 74 50 C68 56 48 62 30 56 Z" fill="#0a5c28" opacity="0.85"/>' +
            '<ellipse class="fx-dragon-eye fx-dragon-eye-l" cx="34" cy="32" rx="7" ry="5" fill="url(#dw-eye-g)"/>' +
            '<ellipse class="fx-dragon-eye fx-dragon-eye-r" cx="54" cy="30" rx="7" ry="5" fill="url(#dw-eye-g)"/>' +
            '<path class="fx-dragon-mouth-glow" d="M38 44 Q48 54 62 46" fill="none" stroke="#7cffab" stroke-width="2.5" stroke-linecap="round"/>' +
            '</svg>',
        );
        push('</div>');
        push('<div class="fx-dragon-punch-wind" aria-hidden="true"></div>');
        push('<div class="fx-dragon-impact-burst" aria-hidden="true"></div>');
        push('<div class="fx-dragon-shockwave" aria-hidden="true"></div>');
        push('<div class="fx-dragon-impact-flash" aria-hidden="true"></div>');
        push('<div class="fx-dragon-linger-particles" aria-hidden="true"></div>');
        push('</div>');
        break;
      }
      case 'docrates-meteores-hercule': {
        const dm = getFxTiming('docrates-meteores-hercule');
        const videoStartSec = dm.videoStartSec ?? 0;
        const videoPath = dm.videoPath ?? './sons/MeteorHercule.mp4';
        const videoLoop = dm.videoLoop === true;
        const opacity = dm.videoOpacity ?? 0.48;
        const fadeInMs = dm.videoFadeInMs ?? 350;
        const fadeOutMs = dm.videoFadeOutMs ?? 700;
        const totalMs = dm.durationMs ?? 14100;
        const fadeAtMs = Math.max(0, totalMs - fadeOutMs);
        const videoStyle = [
          `--dm-video-opacity:${opacity}`,
          `--dm-video-fade-in:${fadeInMs / 1000}s`,
          `--dm-video-fade-at:${fadeAtMs / 1000}s`,
          `--dm-video-fade:${fadeOutMs / 1000}s`,
        ].join(';');
        push(
          `<video class="fx-docrates-meteores-hercule-video" style="${videoStyle}" playsinline preload="auto"${videoLoop ? ' loop' : ''} data-start-sec="${videoStartSec}" src="${videoPath}" aria-hidden="true"></video>`,
        );
        const p1 = (dm.phase1Ms ?? 12000) / 1000;
        const p2 = (dm.phase2Ms ?? 620) / 1000;
        const p3 = (dm.phase3Ms ?? 700) / 1000;
        const p4 = (dm.phase4Ms ?? 780) / 1000;
        const total = totalMs / 1000;
        const p2At = p1;
        const p3At = p1 + p2;
        const p4At = p1 + p2 + p3;
        const impactAt = p3At + 0.048;
        const vars = [
          `--dm-total:${total}s`,
          `--dm-p1:${p1}s`,
          `--dm-p2:${p2}s`,
          `--dm-p3:${p3}s`,
          `--dm-p4:${p4}s`,
          `--dm-p2-at:${p2At}s`,
          `--dm-p3-at:${p3At}s`,
          `--dm-p4-at:${p4At}s`,
          `--dm-impact-at:${impactAt}s`,
          `--dm-spacing:${dm.projectileSpacingPx ?? 44}px`,
          `--dm-beam-angle:0deg`,
        ].join(';');
        push(`<div class="fx-docrates-meteores-field" style="${vars}">`);
        push('<div class="fx-dm-board-darken" aria-hidden="true"></div>');
        push('<div class="fx-dm-attacker-aura" aria-hidden="true"></div>');
        push('<div class="fx-dm-fist-glows" aria-hidden="true">');
        push('<span class="fx-dm-fist-glow fx-dm-fist-l"></span>');
        push('<span class="fx-dm-fist-glow fx-dm-fist-r"></span>');
        push('</div>');
        push('<div class="fx-dm-charge-spheres" aria-hidden="true">');
        push('<span class="fx-dm-charge-sphere fx-dm-sphere-l"></span>');
        push('<span class="fx-dm-charge-sphere fx-dm-sphere-r"></span>');
        push('</div>');
        push('<div class="fx-dm-charge-meteors" aria-hidden="true">');
        push('<div class="hercules-projectile hercules-projectile-charge"></div>');
        push('<div class="hercules-projectile hercules-projectile-charge"></div>');
        push('</div>');
        push('<div class="fx-dm-projectile-lane" aria-hidden="true"></div>');
        push('<div class="fx-dm-impacts" aria-hidden="true"></div>');
        push('<div class="fx-dm-shockwave" aria-hidden="true"></div>');
        push('<div class="fx-dm-bench-shock" aria-hidden="true"></div>');
        push('<div class="fx-dm-dissipate" aria-hidden="true"></div>');
        push('</div>');
        break;
      }
      case 'medusa-shield': {
        const mt = getFxTiming('medusa-shield');
        const revealSec = mt.revealSec ?? 2.5;
        const eyeStart = mt.eyeFlashStartSec ?? revealSec * 0.74;
        const eyeSec = mt.eyeFlashSec ?? 0.65;
        const whiteStart = medusaWhiteStartSec(mt);
        const whiteFlash = mt.whiteFlashSec ?? 0.35;
        const totalSec = mt.totalSec ?? medusaFxTotalSec(mt);
        const img = mt.imagePath ?? 'sons/BouclierMeduse.jpg';
        const vars = [
          `--medusa-reveal:${revealSec}s`,
          `--medusa-eye-start:${eyeStart}s`,
          `--medusa-eye-flash:${eyeSec}s`,
          `--medusa-white-start:${whiteStart}s`,
          `--medusa-white-flash:${whiteFlash}s`,
          `--medusa-total:${totalSec}s`,
        ].join(';');
        push(`<div class="fx-medusa-veil" style="${vars}"></div>`);
        push(`<div class="fx-medusa-whiteout" style="${vars}" aria-hidden="true"></div>`);
        push(`<div class="fx-medusa-shield-wrap" style="${vars}">`);
        push(
          `<img class="fx-medusa-shield-img" src="${img}" alt="" draggable="false" style="${vars}" />`,
        );
        push('<span class="fx-medusa-eye fx-medusa-eye-l" aria-hidden="true"></span>');
        push('<span class="fx-medusa-eye fx-medusa-eye-r" aria-hidden="true"></span>');
        push('<div class="fx-medusa-eye-burst" aria-hidden="true"></div>');
        push('</div>');
        break;
      }
      case 'hyoga-diamond-dust': {
        const ht = getFxTiming('hyoga-diamond-dust');
        const p1 = (ht.phase1Ms ?? 600) / 1000;
        const p2 = (ht.phase2Ms ?? 700) / 1000;
        const p3 = (ht.phase3Ms ?? 1700) / 1000;
        const p4 = (ht.phase4Ms ?? 500) / 1000;
        const total = (ht.durationMs ?? 3500) / 1000;
        const p2At = p1;
        const p3At = p1 + p2;
        const p4At = p1 + p2 + p3;
        const vars = [
          `--hyoga-total:${total}s`,
          `--hyoga-p1:${p1}s`,
          `--hyoga-p2:${p2}s`,
          `--hyoga-p3:${p3}s`,
          `--hyoga-p4:${p4}s`,
          `--hyoga-p2-at:${p2At}s`,
          `--hyoga-p3-at:${p3At}s`,
          `--hyoga-p4-at:${p4At}s`,
          `--hyoga-encase-at:${p3At + p3 * 0.82}s`,
        ].join(';');
        push(`<div class="fx-hyoga-diamond-field" style="${vars}">`);
        push('<div class="fx-hyoga-board-tint" aria-hidden="true"></div>');
        push('<div class="fx-hyoga-frost-overlay" aria-hidden="true"></div>');
        push('<div class="fx-hyoga-attacker-aura" aria-hidden="true"></div>');
        push('<div class="fx-hyoga-cold-breath" aria-hidden="true"></div>');
        for (let i = 0; i < 14; i++) {
          push(`<span class="fx-hyoga-static-crystal" style="--i:${i}"></span>`);
        }
        push('<div class="fx-hyoga-arm-beam" aria-hidden="true"></div>');
        push('<div class="fx-hyoga-wave-front" aria-hidden="true"></div>');
        for (let i = 0; i < 6; i++) {
          push(`<span class="fx-hyoga-wind-gust" style="--i:${i}"></span>`);
        }
        push('<div class="fx-hyoga-storm-corridor" aria-hidden="true"></div>');
        push('<div class="fx-hyoga-particles" aria-hidden="true"></div>');
        push('<div class="fx-hyoga-ice-block" aria-hidden="true"></div>');
        push('<div class="fx-hyoga-finale-flash" aria-hidden="true"></div>');
        push('<div class="fx-hyoga-ice-crack" aria-hidden="true"></div>');
        push('</div>');
        break;
      }
      case 'eagle-meteors': {
        const t = getFxTiming('eagle-meteors');
        const count = t.count ?? 42;
        const sparksPerHit = t.sparksPerHit ?? 5;
        const ballPx = t.ballPx ?? 36;
        const centerBias = t.centerBias ?? 2.6;
        const meteorStartSec = t.meteorStartSec ?? 3;
        const staggerSec = t.staggerSec ?? 0.0603;
        const fallSec = t.fallSec ?? 0.14;
        const burstDelaySec = t.burstDelaySec ?? 0.268;
        const burstSec = t.burstSec ?? 0.509;
        const veilSec = t.veilSec ?? 1.273;
        const fieldStyle = [
          `--eagle-meteor-ball:${ballPx}px`,
          `--eagle-meteor-start:${meteorStartSec}s`,
          `--eagle-meteor-stagger:${staggerSec}s`,
          `--eagle-meteor-fall:${fallSec}s`,
          `--eagle-meteor-burst-delay:${burstDelaySec}s`,
          `--eagle-meteor-burst:${burstSec}s`,
          `--eagle-meteor-veil:${veilSec}s`,
        ].join(';');
        push(`<div class="fx-eagle-meteors-field" style="${fieldStyle}">`);
        const spots = this.meteorImpactSpotsInCircle(count, defenderSlot, centerBias);
        for (let i = 0; i < spots.length; i++) {
          const { x, y } = spots[i];
          push(
            `<span class="fx-eagle-meteors-meteor" style="--x:${x.toFixed(1)}%;--y:${y.toFixed(1)}%;--i:${i}"></span>`,
          );
          push(
            `<span class="fx-eagle-meteors-burst" style="--x:${x.toFixed(1)}%;--y:${y.toFixed(1)}%;--i:${i}"></span>`,
          );
          for (let s = 0; s < sparksPerHit; s++) {
            const ang = (s / sparksPerHit) * 360 + Math.random() * 48;
            const dist = 26 + Math.random() * 30;
            const rad = (ang * Math.PI) / 180;
            const dx = Math.cos(rad) * dist;
            const dy = Math.sin(rad) * dist;
            push(
              `<span class="fx-eagle-meteors-spark" style="--x:${x.toFixed(1)}%;--y:${y.toFixed(1)}%;--i:${i};--dx:${dx.toFixed(0)}px;--dy:${dy.toFixed(0)}px"></span>`,
            );
          }
        }
        push('</div>');
        push(
          `<div class="fx-eagle-meteors-veil" style="animation-delay:var(--eagle-meteor-start,${meteorStartSec}s)"></div>`,
        );
        break;
      }
      case 'eagle-claws':
        push('<span class="fx-claw fx-claw-1"></span><span class="fx-claw fx-claw-2"></span><span class="fx-claw fx-claw-3"></span>');
        break;
      case 'crow-swarm':
        for (let i = 0; i < 12; i++) push(`<span class="fx-crow" style="--i:${i}"></span>`);
        push('<div class="fx-swap-flash"></div>');
        break;
      case 'crow-feathers':
        for (let i = 0; i < 10; i++) push(`<span class="fx-feather" style="--i:${i}"></span>`);
        break;
      case 'chains-bind':
        push('<span class="fx-chain fx-chain-l"></span><span class="fx-chain fx-chain-r"></span><span class="fx-chain fx-chain-m"></span>');
        break;
      case 'hell-weights':
        push('<span class="fx-orb fx-orb-1"></span><span class="fx-orb fx-orb-2"></span><span class="fx-orb fx-orb-3"></span>');
        break;
      case 'spider-web-drain':
        push('<div class="fx-web-net"></div><div class="fx-heal-stream"></div>');
        break;
      case 'spider-web-cage':
        push('<div class="fx-web-cage"></div><div class="fx-energy-vanish"></div>');
        break;
      case 'fire-balls':
        push(`<span class="fx-fireball fx-fireball-1 ${headsCount >= 1 ? 'lit' : ''}"></span>`);
        push(`<span class="fx-fireball fx-fireball-2 ${headsCount >= 2 ? 'lit' : ''}"></span>`);
        break;
      case 'fire-tornado':
        push('<div class="fx-fire-tornado"></div><div class="fx-orange-veil"></div>');
        break;
      case 'arrow-ghost':
        push('<span class="fx-arrow"></span><span class="fx-arrow-trail"></span>');
        break;
      case 'arrow-rain':
        for (let i = 0; i < n; i++) push(`<span class="fx-arrow-drop" style="--i:${i}"></span>`);
        break;
      case 'whale-typhoon':
        push('<div class="fx-vortex"></div><div class="fx-wave"></div>');
        break;
      case 'whale-crush':
        push('<div class="fx-giant-shadow"></div><div class="fx-shockwave"></div>');
        break;
      case 'lotus-fists':
        for (let i = 0; i < n; i++) push(`<span class="fx-fist" style="--i:${i}"></span>`);
        break;
      case 'lotus-spin':
        push('<div class="fx-lotus-spin"></div>');
        break;
      case 'lotus-blast':
        push('<div class="fx-lotus-bloom"></div>');
        if (damage >= 80) push('<div class="fx-gold-flash"></div>');
        break;
      case 'cobra-claws':
        push('<span class="fx-lightning-claw fx-lc-1"></span><span class="fx-lightning-claw fx-lc-2"></span><span class="fx-spark-zap"></span>');
        break;
      case 'cobra-bite':
        push('<div class="fx-snake"></div>');
        break;
      case 'lizard-whirl':
        push('<div class="fx-air-vortex"></div>');
        break;
      case 'misty-tourbillon-lezard': {
        const mtl = getFxTiming('misty-tourbillon-lezard');
        const videoStartSec = mtl.videoStartSec ?? 0;
        const videoPath = mtl.videoPath ?? './sons/Misty1.mp4';
        const opacity = mtl.videoOpacity ?? 0.35;
        const fadeInMs = mtl.videoFadeInMs ?? 350;
        const fadeOutMs = mtl.videoFadeOutMs ?? 700;
        const totalMs = mtl.durationMs ?? 7000;
        const fadeAtMs = Math.max(0, totalMs - fadeOutMs);
        const style = [
          `--mtl-video-opacity:${opacity}`,
          `--mtl-video-fade-in:${fadeInMs / 1000}s`,
          `--mtl-video-fade-at:${fadeAtMs / 1000}s`,
          `--mtl-video-fade:${fadeOutMs / 1000}s`,
        ].join(';');
        push(
          `<video class="fx-misty-tourbillon-lezard-video" style="${style}" playsinline preload="auto" data-start-sec="${videoStartSec}" src="${videoPath}" aria-hidden="true"></video>`,
        );
        break;
      }
      case 'poseidon-trident-royal': {
        const ptr = poseidonTridentRoyalTiming(
          getFxTiming('poseidon-trident-royal'),
          attackLethal !== false,
        );
        const videoStartSec = ptr.videoStartSec ?? 0;
        const videoPath = ptr.videoPath ?? './sons/Trident.mp4';
        const opacity = ptr.videoOpacity ?? 0.35;
        const fadeInMs = ptr.videoFadeInMs ?? 350;
        const fadeOutMs = ptr.videoFadeOutMs ?? 700;
        const totalMs = ptr.durationMs ?? 6778;
        const fadeAtMs = Math.max(0, totalMs - fadeOutMs);
        const style = [
          `--ptr-video-opacity:${opacity}`,
          `--ptr-video-fade-in:${fadeInMs / 1000}s`,
          `--ptr-video-fade-at:${fadeAtMs / 1000}s`,
          `--ptr-video-fade:${fadeOutMs / 1000}s`,
        ].join(';');
        push(
          `<video class="fx-poseidon-trident-royal-video" style="${style}" playsinline preload="auto" data-start-sec="${videoStartSec}" src="${videoPath}" aria-hidden="true"></video>`,
        );
        break;
      }
      case 'andromede-chaine-serpent': {
        const acs = getFxTiming('andromede-chaine-serpent');
        const videoStartSec = acs.videoStartSec ?? 0;
        const videoPath = acs.videoPath ?? './sons/AndroNoir1.mp4';
        const opacity = acs.videoOpacity ?? 0.32;
        const fadeInMs = acs.videoFadeInMs ?? 350;
        const fadeOutMs = acs.videoFadeOutMs ?? 700;
        const totalMs = acs.durationMs ?? 5910;
        const fadeAtMs = Math.max(0, totalMs - fadeOutMs);
        const style = [
          `--acs-video-opacity:${opacity}`,
          `--acs-video-fade-in:${fadeInMs / 1000}s`,
          `--acs-video-fade-at:${fadeAtMs / 1000}s`,
          `--acs-video-fade:${fadeOutMs / 1000}s`,
        ].join(';');
        push(
          `<video class="fx-andromede-chaine-serpent-video" style="${style}" playsinline preload="auto" data-start-sec="${videoStartSec}" src="${videoPath}" aria-hidden="true"></video>`,
        );
        break;
      }
      case 'lizard-dodge':
        push('<span class="fx-afterimage"></span>');
        break;
      case 'telepathy':
        push('<div class="fx-mind-wave"></div><div class="fx-hand-ghost"></div>');
        break;
      case 'clones':
        push('<span class="fx-clone fx-clone-1"></span><span class="fx-clone fx-clone-2"></span><span class="fx-clone fx-clone-3"></span>');
        if (coin === 'heads') push('<div class="fx-shield-ghost"></div>');
        break;
      case 'music-notes':
        for (let i = 0; i < 6; i++) push(`<span class="fx-note" style="--i:${i}">♪</span>`);
        break;
      case 'music-beam':
        push('<div class="fx-staff-line"></div><div class="fx-energy-drop"></div>');
        break;
      case 'music-wave':
        push('<div class="fx-sound-ring fx-ring-1"></div><div class="fx-sound-ring fx-ring-2"></div><div class="fx-sound-ring fx-ring-3"></div>');
        break;
      case 'soul-cycle':
        for (let i = 0; i < 6; i++) push(`<span class="fx-soul" style="--i:${i}"></span>`);
        break;
      case 'scroll-draw':
        for (let i = 0; i < 5; i++) push(`<span class="fx-scroll" style="--i:${i}"></span>`);
        break;
      case 'disk-slash':
        push('<span class="fx-disk fx-disk-1"></span>');
        break;
      case 'disk-multi':
        for (let i = 0; i < 4; i++) push(`<span class="fx-disk" style="--i:${i}"></span>`);
        break;
      case 'stones':
        for (let i = 0; i < 5; i++) push(`<span class="fx-stone" style="--i:${i}"></span>`);
        break;
      case 'magic-search':
        push('<div class="fx-sparkle-burst"></div>');
        break;
      case 'melee-kick':
        push('<span class="fx-kick-arc"></span><span class="fx-impact-flash"></span>');
        break;
      case 'melee-punch':
        push('<span class="fx-punch-flash"></span>');
        break;
      case 'melee-heavy':
        push('<div class="fx-screen-shake"></div><span class="fx-heavy-impact"></span>');
        break;
      case 'melee-flame':
        push('<span class="fx-flame-punch"></span>');
        break;
      case 'shaka-om': {
        const ps = this._goldFxPhaseStyle({ windup: 0.9, impact: 1.2, after: 0.9 });
        this._pushGoldAnimeBase(push, 'gold', ps);
        push(`<div class="fx-gold-veil fx-gold-veil--phased" style="${ps}"></div>`);
        push(`<div class="fx-shaka-om-charge" style="${ps}"></div>`);
        push('<div class="fx-shaka-om-symbol" aria-hidden="true">ॐ</div>');
        push(`<div class="fx-shaka-om-wave" style="${ps}"></div>`);
        push(`<div class="fx-shaka-om-seal" style="${ps}"></div>`);
        this._pushGoldScreenFlash(push, ps, 'fx-anime-screenflash--gold');
        push(`<div class="fx-shaka-om-afterglow" style="${ps}"></div>`);
        break;
      }
      case 'shakka-tresor-du-ciel': {
        const skc = getFxTiming('shakka-tresor-du-ciel');
        const videoStartSec = skc.videoStartSec ?? 0;
        const videoPath = skc.videoPath ?? './sons/Shakka1.mp4';
        const opacity = skc.videoOpacity ?? 0.32;
        const fadeInMs = skc.videoFadeInMs ?? 350;
        const fadeOutMs = skc.videoFadeOutMs ?? 700;
        const totalMs = skc.durationMs ?? 15044;
        const fadeAtMs = Math.max(0, totalMs - fadeOutMs);
        const style = [
          `--skc-video-opacity:${opacity}`,
          `--skc-video-fade-in:${fadeInMs / 1000}s`,
          `--skc-video-fade-at:${fadeAtMs / 1000}s`,
          `--skc-video-fade:${fadeOutMs / 1000}s`,
        ].join(';');
        push(
          `<video class="fx-shakka-tresor-du-ciel-video" style="${style}" playsinline preload="auto" data-start-sec="${videoStartSec}" src="${videoPath}" aria-hidden="true"></video>`,
        );
        break;
      }
      case 'aior-plasma': {
        const pt = getFxTiming('aior-plasma');
        const totalSec = (pt.durationMs ?? 2500) / 1000;
        const prepSec = (pt.prepMs ?? 300) / 1000;
        const burstSec = (pt.burstMs ?? 1500) / 1000;
        const vars = [
          `--plasma-total:${totalSec}s`,
          `--plasma-prep:${prepSec}s`,
          `--plasma-burst:${burstSec}s`,
          `--plasma-finale-at:${prepSec + burstSec}s`,
        ].join(';');
        push(`<div class="fx-aior-plasma-field" style="${vars}">`);
        push('<div class="fx-aior-plasma-prep-veil" aria-hidden="true"></div>');
        push('<div class="fx-aior-plasma-finale-flash" aria-hidden="true"></div>');
        push('<div class="fx-aior-plasma-wave" aria-hidden="true"></div>');
        push('</div>');
        break;
      }
      case 'aior-fireball': {
        const ft = getFxTiming('aior-fireball');
        const totalSec = (ft.durationMs ?? 2600) / 1000;
        push(`<div class="fx-aior-fireball-field" style="--fb-total:${totalSec}s">`);
        push('<div class="fx-aior-fireball-veil" aria-hidden="true"></div>');
        push('<div class="fx-aior-fireball-charge" aria-hidden="true"></div>');
        push('<div class="fx-aior-fireball-sphere" aria-hidden="true"></div>');
        push('<div class="fx-aior-fireball-explosion" aria-hidden="true">');
        for (let i = 0; i < 8; i++) {
          push(`<span class="fx-aior-fireball-spark" style="--i:${i}"></span>`);
        }
        push('</div>');
        push('</div>');
        break;
      }
      case 'vieux-allies':
        for (let i = 0; i < 4; i++) {
          push(`<span class="fx-vieux-ally" style="--i:${i}"></span>`);
        }
        push('<div class="fx-vieux-card-to-hand"></div>');
        break;
      case 'vieux-rozan':
        push('<div class="fx-vieux-rozan-veil"></div>');
        for (let i = 0; i < 10; i++) {
          push(`<span class="fx-vieux-bolt" style="--i:${i}"></span>`);
        }
        break;
      case 'dokko-dragon-spirit':
        push('<div class="fx-dokko-dragon-veil"></div>');
        push('<div class="fx-dokko-dragon-spirit"></div>');
        push('<div class="fx-dokko-dragon-burst"></div>');
        break;
      case 'dokko-hundred-dragons': {
        const dragonN = hundredDragonsFxCount(discardedEnergyCount);
        const dt = getFxTiming('dokko-hundred-dragons');
        const swarmStart = dt.swarmStartSec ?? 0.85;
        const stagger = dt.staggerSec ?? 0.055;
        const flySec = dt.flySec ?? 0.12;
        const burstDelay = dt.burstDelaySec ?? 0.2;
        const burstSec = dt.burstSec ?? 0.45;
        const ps = this._goldFxPhaseStyle({ windup: swarmStart, impact: 1.35, after: 0.8 });
        const fieldStyle = [
          ps,
          `--dokko-swarm-start:${swarmStart}s`,
          `--dokko-stagger:${stagger}s`,
          `--dokko-fly:${flySec}s`,
          `--dokko-burst-delay:${burstDelay}s`,
          `--dokko-burst:${burstSec}s`,
        ].join(';');
        this._pushGoldAnimeBase(push, 'green', fieldStyle);
        push(`<div class="fx-dokko-swarm-veil fx-gold-veil--phased" style="${fieldStyle}"></div>`);
        push(`<div class="fx-dokko-swarm-field" style="${fieldStyle}">`);
        const spots = this.meteorImpactSpotsInCircle(dragonN, defenderSlot, 2.2);
        for (let i = 0; i < spots.length; i++) {
          const { x, y } = spots[i];
          push(
            `<span class="fx-dokko-mini-dragon" style="--x:${x.toFixed(1)}%;--y:${y.toFixed(1)}%;--i:${i}"></span>`,
          );
          push(
            `<span class="fx-dokko-swarm-burst" style="--x:${x.toFixed(1)}%;--y:${y.toFixed(1)}%;--i:${i}"></span>`,
          );
        }
        push('</div>');
        this._pushGoldScreenFlash(push, fieldStyle, 'fx-anime-screenflash--green');
        push(`<div class="fx-dokko-swarm-afterglow" style="${fieldStyle}"></div>`);
        break;
      }
      case 'milo-scarlet-needle': {
        const mt = getFxTiming('milo-scarlet-needle');
        const glowSec = (mt.phase1GlowMs ?? 2000) / 1000;
        const fadeOutMs = mt.fadeOutMs ?? 1000;
        const windupSec = 0.35 + glowSec;
        const impactSec = mt.impactSec ?? 0.55;
        const durSec = windupSec + impactSec;
        const totalMs = mt.durationMs ?? Math.round(durSec * 1000) + fadeOutMs;
        const ps = this._goldFxPhaseStyle({
          windup: windupSec,
          impact: impactSec,
          after: 0,
          dur: durSec,
        });
        this._pushGoldAnimeBase(push, 'scarlet', ps);
        push(`<div class="fx-milo-needle-field" style="${ps}">`);
        push('<div class="fx-milo-needle-veil" aria-hidden="true"></div>');
        push('<span class="fx-milo-needle-main" aria-hidden="true"></span>');
        push('<span class="fx-milo-scarlet-dot" aria-hidden="true"></span>');
        push('<div class="fx-milo-needle-flash" aria-hidden="true"></div>');
        push('</div>');
        this._pushGoldScreenFlash(push, ps, 'fx-anime-screenflash--scarlet');
        break;
      }
      case 'milo-antares': {
        const ps = this._goldFxPhaseStyle({ windup: 0.95, impact: 1.2, after: 0.85 });
        this._pushGoldAnimeBase(push, 'scarlet', ps);
        push(`<div class="fx-milo-antares-field" style="${ps}">`);
        push('<div class="fx-milo-antares-veil" aria-hidden="true"></div>');
        push('<div class="fx-milo-antares-star-behind" aria-hidden="true"></div>');
        push('<div class="fx-milo-antares-beam-line" aria-hidden="true"></div>');
        push('<div class="fx-milo-antares-impact" aria-hidden="true"></div>');
        push('</div>');
        this._pushGoldScreenFlash(push, ps, 'fx-anime-screenflash--scarlet');
        break;
      }
      case 'hyoga-dawn-thunder': {
        const ps = this._goldFxPhaseStyle({ windup: 0.55, impact: 1.55, after: 0.8 });
        this._pushGoldAnimeBase(push, 'gold', ps);
        push(`<div class="fx-aioros-thunder-field" style="${ps}">`);
        push('<div class="fx-aioros-thunder-veil" aria-hidden="true"></div>');
        push('<div class="fx-aioros-thunder-charge" aria-hidden="true"></div>');
        push('<div class="fx-aioros-thunder-core" aria-hidden="true"></div>');
        push('<div class="fx-aioros-thunder-afterglow" aria-hidden="true"></div>');
        push('</div>');
        this._pushGoldScreenFlash(push, ps, 'fx-anime-screenflash--gold');
        break;
      }
      case 'aioros-golden-arrow': {
        const ps = this._goldFxPhaseStyle({ windup: 0.5, impact: 1.35, after: 0.85 });
        this._pushGoldAnimeBase(push, 'gold', ps);
        push(`<div class="fx-aioros-arrow-field" style="${ps}">`);
        push('<div class="fx-aioros-arrow-veil" aria-hidden="true"></div>');
        push('<div class="fx-aioros-arrow-bow" aria-hidden="true"></div>');
        push('<span class="fx-aioros-arrow-projectile" aria-hidden="true"></span>');
        push('<div class="fx-aioros-arrow-trail" aria-hidden="true"></div>');
        push('<div class="fx-aioros-arrow-impact" aria-hidden="true"></div>');
        push('</div>');
        this._pushGoldScreenFlash(push, ps, 'fx-anime-screenflash--gold');
        break;
      }
      case 'shura-excalibur': {
        const ex = getFxTiming('shura-excalibur');
        const videoStartSec = ex.videoStartSec ?? 0;
        const videoPath = ex.videoPath ?? './sons/Shura2.mp4';
        const opacity = ex.videoOpacity ?? 0.32;
        const fadeInMs = ex.videoFadeInMs ?? 150;
        const fadeOutMs = ex.videoFadeOutMs ?? 300;
        const totalMs = ex.durationMs ?? 1839;
        const fadeAtMs = Math.max(0, totalMs - fadeOutMs);
        const totalSec = totalMs / 1000;
        const impactSec = (ex.impactAtMs ?? Math.round(totalMs * 0.72)) / 1000;
        const afterSec = Math.max(0.4, totalSec - impactSec - 0.55);
        const ps = this._goldFxPhaseStyle({
          dur: totalSec,
          windup: impactSec,
          impact: 0.55,
          after: afterSec,
        });
        const videoStyle = [
          `--sxe-video-opacity:${opacity}`,
          `--sxe-video-fade-in:${fadeInMs / 1000}s`,
          `--sxe-video-fade-at:${fadeAtMs / 1000}s`,
          `--sxe-video-fade:${fadeOutMs / 1000}s`,
        ].join(';');
        push(
          `<video class="fx-shura-excalibur-video" style="${videoStyle}" playsinline preload="auto" data-start-sec="${videoStartSec}" src="${videoPath}" aria-hidden="true"></video>`,
        );
        this._pushGoldAnimeBase(push, 'gold', ps);
        push(`<div class="fx-shura-excalibur-field" style="${ps}">`);
        push('<div class="fx-shura-excalibur-veil" aria-hidden="true"></div>');
        push('<span class="fx-shura-blade fx-shura-blade-main" aria-hidden="true"></span>');
        push('<div class="fx-shura-excalibur-flash" aria-hidden="true"></div>');
        push('</div>');
        this._pushGoldScreenFlash(push, ps, 'fx-anime-screenflash--gold');
        break;
      }
      case 'shura-capricorn-leap': {
        const ps = this._goldFxPhaseStyle({ windup: 0.4, impact: 0.85, after: 1.1 });
        this._pushGoldAnimeBase(push, 'gold', ps);
        push('<div class="fx-shura-teleport-flash" aria-hidden="true"></div>');
        push('<div class="fx-shura-afterimage" aria-hidden="true"></div>');
        push('<div class="fx-shura-swap-ring" aria-hidden="true"></div>');
        this._pushGoldScreenFlash(push, ps, 'fx-anime-screenflash--gold');
        break;
      }
      case 'shina-thunder-claw': {
        const st = getFxTiming('shina-thunder-claw');
        const videoStartSec = st.videoStartSec ?? 0;
        const videoPath = st.videoPath ?? './sons/ThunderClaw.mp4';
        const opacity = st.videoOpacity ?? 0.35;
        const fadeInMs = st.videoFadeInMs ?? 350;
        const fadeOutMs = st.videoFadeOutMs ?? 700;
        const totalMs = st.durationMs ?? 5800;
        const fadeAtMs = Math.max(0, totalMs - fadeOutMs);
        const style = [
          `--stc-video-opacity:${opacity}`,
          `--stc-video-fade-in:${fadeInMs / 1000}s`,
          `--stc-video-fade-at:${fadeAtMs / 1000}s`,
          `--stc-video-fade:${fadeOutMs / 1000}s`,
        ].join(';');
        push(
          `<video class="fx-shina-thunder-claw-video" style="${style}" playsinline preload="auto" data-start-sec="${videoStartSec}" src="${videoPath}" aria-hidden="true"></video>`,
        );
        break;
      }
      case 'ichi-combo-griffe': {
        const icg = getFxTiming('ichi-combo-griffe');
        const videoStartSec = icg.videoStartSec ?? 0;
        const videoPath = icg.videoPath ?? './sons/KataCobra.mp4';
        const opacity = icg.videoOpacity ?? 0.35;
        const fadeInMs = icg.videoFadeInMs ?? 350;
        const fadeOutMs = icg.videoFadeOutMs ?? 700;
        const totalMs = icg.durationMs ?? 10070;
        const fadeAtMs = Math.max(0, totalMs - fadeOutMs);
        const style = [
          `--icg-video-opacity:${opacity}`,
          `--icg-video-fade-in:${fadeInMs / 1000}s`,
          `--icg-video-fade-at:${fadeAtMs / 1000}s`,
          `--icg-video-fade:${fadeOutMs / 1000}s`,
        ].join(';');
        push(
          `<video class="fx-ichi-combo-griffe-video" style="${style}" playsinline preload="auto" data-start-sec="${videoStartSec}" src="${videoPath}" aria-hidden="true"></video>`,
        );
        break;
      }
      case 'kagaho-ankh-sacrificielle': {
        const kas = getFxTiming('kagaho-ankh-sacrificielle');
        const videoStartSec = kas.videoStartSec ?? 0;
        const videoPath = kas.videoPath ?? './sons/Kagaho1.mp4';
        const opacity = kas.videoOpacity ?? 0.3;
        const fadeInMs = kas.videoFadeInMs ?? 350;
        const fadeOutMs = kas.videoFadeOutMs ?? 1000;
        const totalMs = kas.durationMs ?? 10106;
        const fadeAtMs = Math.max(0, totalMs - fadeOutMs);
        const style = [
          `--kas-video-opacity:${opacity}`,
          `--kas-video-fade-in:${fadeInMs / 1000}s`,
          `--kas-video-fade-at:${fadeAtMs / 1000}s`,
          `--kas-video-fade:${fadeOutMs / 1000}s`,
        ].join(';');
        push(
          `<video class="fx-kagaho-ankh-sacrificielle-video" style="${style}" playsinline preload="auto" data-start-sec="${videoStartSec}" src="${videoPath}" aria-hidden="true"></video>`,
        );
        push(
          '<div class="fx-kagaho-ankh-sacrificielle-field" aria-hidden="true"><div class="fx-kagaho-ankh-flame-whirls"></div></div>',
        );
        break;
      }
      case 'aldebaran-great-horn': {
        const gh = getFxTiming('aldebaran-great-horn');
        const videoStartSec = gh.videoStartSec ?? 3;
        push(
          `<video class="fx-shura-greathorn-video" playsinline preload="auto" data-start-sec="${videoStartSec}" src="./assets/audio/attacks/CorneTaureau.mp4" aria-hidden="true"></video>`,
        );
        push('<div class="fx-greathorn-impact-flash" aria-hidden="true"></div>');
        break;
      }
      case 'phoenix-hoyoku-tensho': {
        const pt = getFxTiming('phoenix-hoyoku-tensho');
        const concentrationMs = pt.concentrationMs ?? 5000;
        const stormMs = pt.stormMs ?? pt.burstMs ?? 10000;
        const fadeOutMs = Math.max(1000, pt.fadeOutMs ?? 1500);
        const videoPath = pt.videoPath ?? './assets/audio/attacks/BattementDailes.mp4';
        const videoStartDelayMs = Math.max(0, pt.videoStartDelayMs ?? 0);
        const videoInitialInvisibleMs = Math.max(0, pt.videoInitialInvisibleMs ?? 0);
        const videoFadeInMs = Math.max(2200, pt.videoFadeInMs ?? 4200);
        const videoFadeOutAdvanceMs = Math.max(0, pt.videoFadeOutAdvanceMs ?? 3000);
        const particleCount = Math.max(180, Math.min(480, pt.particleCount ?? 260));
        const particleTravelMs = Math.max(620, pt.particleTravelMs ?? Math.round(stormMs * 0.52));
        const totalMs = pt.durationMs ?? concentrationMs + stormMs + fadeOutMs;
        const auraWindowMs = Math.min(
          totalMs - Math.max(220, Math.floor(fadeOutMs * 0.3)),
          concentrationMs + Math.floor(stormMs * 0.52),
        );
        const particleWindowMs = Math.max(stormMs + fadeOutMs, totalMs - concentrationMs);
        const particleMaxDelayMs = Math.max(0, particleWindowMs - particleTravelMs);
        const fadeAtMs = Math.max(0, totalMs - fadeOutMs);
        const videoFadeInStartMs = Math.max(videoInitialInvisibleMs, videoStartDelayMs);
        const videoFadeAtMs = Math.max(videoFadeInStartMs, fadeAtMs - videoFadeOutAdvanceMs);
        const style = [
          `--phoenix-total:${totalMs / 1000}s`,
          `--phoenix-concentration:${concentrationMs / 1000}s`,
          `--phoenix-aura-window:${Math.max(0, auraWindowMs) / 1000}s`,
          `--phoenix-burst:${particleTravelMs / 1000}s`,
          `--phoenix-video-opacity:${0.5}`,
          `--phoenix-video-fade-in:${videoFadeInMs / 1000}s`,
          `--phoenix-fade-out:${fadeOutMs / 1000}s`,
          `--phoenix-fade-at:${fadeAtMs / 1000}s`,
          `--phoenix-video-reveal-at:${videoFadeInStartMs / 1000}s`,
          `--phoenix-video-fade-at:${videoFadeAtMs / 1000}s`,
        ].join(';');
        push(
          `<video class="fx-phoenix-hoyoku-video" style="${style}" playsinline preload="auto" data-start-sec="0" data-delay-play-ms="${videoStartDelayMs}" src="${videoPath}" aria-hidden="true"></video>`,
        );
        push(`<div class="fx-phoenix-burst" style="${style}" aria-hidden="true">`);
        for (let i = 0; i < particleCount; i++) {
          const side = Math.floor(Math.random() * 4);
          const overscan = 12 + Math.random() * 18;
          const startAxis = -8 + Math.random() * 116;
          const endAxis = startAxis + (Math.random() - 0.5) * 44;
          let sx = 0;
          let sy = 0;
          let ex = 0;
          let ey = 0;
          if (side === 0) {
            sx = -overscan;
            sy = startAxis;
            ex = 100 + overscan;
            ey = endAxis;
          } else if (side === 1) {
            sx = 100 + overscan;
            sy = startAxis;
            ex = -overscan;
            ey = endAxis;
          } else if (side === 2) {
            sx = startAxis;
            sy = -overscan;
            ex = endAxis;
            ey = 100 + overscan;
          } else {
            sx = startAxis;
            sy = 100 + overscan;
            ex = endAxis;
            ey = -overscan;
          }
          const size = 4 + Math.random() * 8;
          const swayX = (Math.random() - 0.5) * 220;
          const swayY = (Math.random() - 0.5) * 220;
          const rotate = (Math.random() - 0.5) * 180;
          const delayMs = Math.random() * particleMaxDelayMs;
          push(
            `<span class="fx-phoenix-particle" style="--sx:${sx.toFixed(2)}vw;--sy:${sy.toFixed(2)}vh;--ex:${ex.toFixed(2)}vw;--ey:${ey.toFixed(2)}vh;--sway-x:${swayX.toFixed(0)}px;--sway-y:${swayY.toFixed(0)}px;--rot:${rotate.toFixed(1)}deg;--size:${size.toFixed(1)}px;--dur:${particleTravelMs.toFixed(0)}ms;--delay:${delayMs.toFixed(0)}ms"></span>`,
          );
        }
        push('</div>');
        break;
      }
      case 'pope-sacred-dagger':
        push('<span class="fx-pope-dagger"></span>');
        push('<div class="fx-pope-divinity-burst"></div>');
        break;
      case 'pope-diabolic-ray':
        push('<div class="fx-pope-diabolic-beam"></div>');
        push('<div class="fx-pope-confusion-spiral"></div>');
        break;
      case 'pope-gemini-armor':
        for (let i = 0; i < 6; i++) {
          push(`<span class="fx-pope-armor-piece" style="--i:${i}"></span>`);
        }
        push('<div class="fx-pope-evolve-flash"></div>');
        break;
      case 'saga-explosion-galactique': {
        const seg = getFxTiming('saga-explosion-galactique');
        const videoStartSec = seg.videoStartSec ?? 0;
        const videoPath = seg.videoPath ?? './sons/Saga1.mp4';
        const opacity = seg.videoOpacity ?? 0.32;
        const fadeInMs = seg.videoFadeInMs ?? 350;
        const fadeOutMs = seg.videoFadeOutMs ?? 1000;
        const { fadeStartMs, flashAtMs, flashFadeMs } = sagaExplosionGalactiqueTiming(seg);
        const fadeAtMs = fadeStartMs;
        const videoStyle = [
          `--seg-video-opacity:${opacity}`,
          `--seg-video-fade-in:${fadeInMs / 1000}s`,
          `--seg-video-fade-at:${fadeAtMs / 1000}s`,
          `--seg-video-fade:${fadeOutMs / 1000}s`,
          `--seg-flash-at:${flashAtMs / 1000}s`,
          `--seg-flash-fade:${flashFadeMs / 1000}s`,
        ].join(';');
        push(
          `<video class="fx-saga-explosion-galactique-video" style="${videoStyle}" playsinline preload="auto" data-start-sec="${videoStartSec}" src="${videoPath}" aria-hidden="true"></video>`,
        );
        push(
          `<div class="fx-saga-explosion-galactique-flash" style="${videoStyle}" aria-hidden="true"></div>`,
        );
        const ps = this._goldFxPhaseStyle({ windup: 1.3, impact: 1.5, after: 0.5 });
        this._pushGoldAnimeBase(push, 'purple', ps);
        push(`<div class="fx-saga-galactic-field" style="${ps}">`);
        push('<div class="fx-saga-galactic-darken" aria-hidden="true"></div>');
        push('<div class="fx-saga-galactic-aura" aria-hidden="true"></div>');
        push('<div class="fx-saga-galactic-sphere" aria-hidden="true"></div>');
        push('<div class="fx-saga-galactic-projectile" aria-hidden="true"></div>');
        push('<div class="fx-saga-galactic-burst" aria-hidden="true"></div>');
        push('</div>');
        this._pushGoldScreenFlash(push, ps, 'fx-anime-screenflash--purple');
        break;
      }
      case 'saga-dimension': {
        const ps = this._goldFxPhaseStyle({ windup: 0.9, impact: 1.1, after: 0.7 });
        this._pushGoldAnimeBase(push, 'purple', ps);
        push(`<div class="fx-saga-dimension-field" style="${ps}">`);
        push('<div class="fx-saga-dimension-veil" aria-hidden="true"></div>');
        push('<div class="fx-saga-portal" aria-hidden="true"></div>');
        push('<div class="fx-saga-absorb-vortex" aria-hidden="true"></div>');
        push('<div class="fx-saga-dimension-swap-flash" aria-hidden="true"></div>');
        push('</div>');
        this._pushGoldScreenFlash(push, ps, 'fx-anime-screenflash--purple');
        break;
      }
      case 'saga-five-senses': {
        const st = getFxTiming('saga-five-senses');
        const stagger = st.symbolStaggerSec ?? 0.42;
        const ps = this._goldFxPhaseStyle({ windup: 0.35, impact: 2.15, after: 0.5 });
        this._pushGoldAnimeBase(push, 'purple', ps);
        push(`<div class="fx-saga-senses-field" style="${ps};--sense-stagger:${stagger}s">`);
        push('<div class="fx-saga-senses-veil" aria-hidden="true"></div>');
        const senseGlyphs = ['👁', '♪', '☁', '◆', '✋'];
        const senseLabels = ['sight', 'sound', 'smell', 'taste', 'touch'];
        for (let i = 0; i < 5; i++) {
          push(
            `<span class="fx-saga-sense-icon fx-saga-sense-${senseLabels[i]}" style="--i:${i}" aria-hidden="true">${senseGlyphs[i]}</span>`,
          );
        }
        for (let i = 0; i < 5; i++) {
          push(`<span class="fx-saga-sense-ring" style="--i:${i}"></span>`);
        }
        push('<div class="fx-saga-paralyze-lock" aria-hidden="true"></div>');
        push('<div class="fx-saga-senses-aura" aria-hidden="true"></div>');
        push('</div>');
        this._pushGoldScreenFlash(push, ps, 'fx-anime-screenflash--purple');
        break;
      }
      case 'mu-crystal-wall': {
        const ps = this._goldFxPhaseStyle({ windup: 0.55, impact: 1.4, after: 0.65 });
        this._pushGoldAnimeBase(push, 'crystal', ps);
        push(`<div class="fx-mu-crystal-field" style="${ps}">`);
        push('<div class="fx-mu-crystal-veil" aria-hidden="true"></div>');
        push('<div class="fx-mu-crystal-wall" aria-hidden="true"></div>');
        push('<div class="fx-mu-crystal-shimmer" aria-hidden="true"></div>');
        push('</div>');
        this._pushGoldScreenFlash(push, ps, 'fx-anime-screenflash--crystal');
        break;
      }
      case 'mu-spiral-stellaire': {
        const ms = getFxTiming('mu-spiral-stellaire');
        const videoStartSec = ms.videoStartSec ?? 0;
        const videoPath = ms.videoPath ?? './sons/SpiraleStellaire.mp4';
        const opacity = ms.videoOpacity ?? 0.48;
        const fadeInMs = ms.videoFadeInMs ?? 350;
        const fadeOutMs = ms.videoFadeOutMs ?? 1600;
        const videoEndMs = ms.durationMs ?? 5800;
        const fadeAtMs = Math.max(0, videoEndMs - fadeOutMs);
        const flashAtMs = ms.flashAtMs ?? Math.max(0, videoEndMs - 200);
        const flashFadeMs = ms.flashFadeMs ?? 2000;
        const style = [
          `--mss-video-opacity:${opacity}`,
          `--mss-video-fade-in:${fadeInMs / 1000}s`,
          `--mss-video-fade-at:${fadeAtMs / 1000}s`,
          `--mss-video-fade:${fadeOutMs / 1000}s`,
          `--mss-flash-at:${flashAtMs / 1000}s`,
          `--mss-flash-fade:${flashFadeMs / 1000}s`,
        ].join(';');
        push(
          `<video class="fx-mu-spiral-stellaire-video" style="${style}" playsinline preload="auto" data-start-sec="${videoStartSec}" src="${videoPath}" aria-hidden="true"></video>`,
        );
        push(`<div class="fx-mu-spiral-stellaire-flash" style="${style}" aria-hidden="true"></div>`);
        break;
      }
      case 'mu-death-star': {
        const ps = this._goldFxPhaseStyle({ windup: 1.1, impact: 0.85, after: 1.05 });
        this._pushGoldAnimeBase(push, 'gold', ps);
        push(`<div class="fx-mu-deathstar-field" style="${ps}">`);
        push('<div class="fx-mu-deathstar-veil" aria-hidden="true"></div>');
        push('<div class="fx-mu-deathstar-star" aria-hidden="true"></div>');
        push('<div class="fx-mu-deathstar-collapse" aria-hidden="true"></div>');
        push('<div class="fx-mu-deathstar-nova" aria-hidden="true"></div>');
        push('<div class="fx-mu-deathstar-portal" aria-hidden="true"></div>');
        push('<div class="fx-mu-deathstar-swap-fade" aria-hidden="true"></div>');
        push('</div>');
        this._pushGoldScreenFlash(push, ps, 'fx-anime-screenflash--gold');
        break;
      }
      default:
        push('<span class="fx-impact-flash"></span>');
    }

    return `<div class="fx-scene">${parts.join('')}</div>`;
  }

  showTurnStartBanner(playerIndex = 0) {
    const wrap = this.els.turnStartBanner;
    const inner = this.els.turnStartBannerInner;
    if (!wrap || !inner) return;
    const name = this.engine.state.players[playerIndex]?.name || `Joueur ${playerIndex + 1}`;
    const text = repairFrenchDisplayText(`Début du tour — ${name}`);
    inner.textContent = text;
    wrap.classList.remove('hidden');
    wrap.classList.add('show');
    clearTimeout(this.turnStartBannerTimer);
    const bannerMs = RULES.ui?.turnStartBannerMs ?? 1600;
    this.turnStartBannerTimer = setTimeout(() => {
      wrap.classList.remove('show');
      wrap.classList.add('hidden');
    }, bannerMs);
  }

  queueCoinFlipOverlay(data = {}) {
    this._coinFlipQueue = (this._coinFlipQueue || Promise.resolve()).then(() =>
      this.runCoinFlipOverlay(data),
    );
    return this._coinFlipQueue;
  }

  runCoinFlipOverlay(data = {}) {
    return new Promise((resolve) => {
      const wrap = this.els.coinFlipOverlay;
      const reasonEl = this.els.coinFlipReason;
      const resultEl = this.els.coinFlipResult;
      if (!wrap || !reasonEl || !resultEl) {
        resolve();
        return;
      }
      const reason = repairFrenchDisplayText((data.reason || 'Lancer de pièce').trim());
      const resultLabel = repairFrenchDisplayText(formatCoinFlipResult(data.result));
      reasonEl.textContent = reason;
      resultEl.textContent = resultLabel;
      resultEl.dataset.side = data.result === RULES.coin.heads ? 'heads' : 'tails';
      wrap.classList.remove('hidden');
      wrap.classList.remove('show');
      void wrap.offsetWidth;
      wrap.classList.add('show');
      clearTimeout(this._coinFlipTimer);
      const overlayMs = RULES.ui?.coinFlipOverlayMs ?? 2000;
      this._coinFlipTimer = setTimeout(() => {
        wrap.classList.remove('show');
        wrap.classList.add('hidden');
        resolve();
      }, overlayMs);
    });
  }

  showAttackSplash(attackName, label, damage, description = '', resultSummary = '') {
    this.showAttackNameSplash(attackName, label, description);
    void this.showAttackResultSplash(attackName, label, resultSummary, damage);
  }

  showAttackNameSplash(attackName, label, description = '', onDone) {
    if (!this.els.attackSplash) {
      onDone?.();
      return;
    }
    const name = repairFrenchDisplayText(label ? `${label} — ${attackName}` : attackName);
    const desc = repairFrenchDisplayText((description || '').trim());
    this.els.splashName.textContent = name;
    this.els.splashDamage.textContent = '';
    if (this.els.splashDesc) {
      if (desc) {
        this.els.splashDesc.textContent = desc;
        this.els.splashDesc.classList.remove('hidden');
      } else {
        this.els.splashDesc.textContent = '';
        this.els.splashDesc.classList.add('hidden');
      }
    }
    const nameMs = desc
      ? (RULES.ui?.attackNameSplashMs ?? 900)
      : (RULES.ui?.attackNameSplashMs ?? 700);
    this.els.attackSplash.classList.remove('hidden');
    this.els.attackSplash.classList.add('show', 'splash-phase-name');
    this.els.attackSplash.classList.remove('splash-phase-result');
    clearTimeout(this.splashNameTimer);
    this.splashNameTimer = setTimeout(() => {
      this.els.attackSplash.classList.remove('show', 'splash-phase-name', 'splash-phase-result');
      this.els.attackSplash.classList.add('hidden');
      onDone?.();
    }, nameMs);
  }

  showAttackResultSplash(attackName, label, resultDescription = '', damage = 0) {
    return new Promise((resolve) => {
      if (!this.els.attackSplash) {
        resolve();
        return;
      }
      const name = repairFrenchDisplayText(label ? `${label} — ${attackName}` : attackName);
      const desc = repairFrenchDisplayText((resultDescription || '').trim());
      this.els.splashName.textContent = name;
      this.els.splashDamage.textContent = damage > 0 ? `-${damage}` : '0';
      if (this.els.splashDesc) {
        if (desc) {
          this.els.splashDesc.textContent = desc;
          this.els.splashDesc.classList.remove('hidden');
        } else {
          this.els.splashDesc.textContent = '';
          this.els.splashDesc.classList.add('hidden');
        }
      }
      const splashMs = desc
        ? (RULES.ui?.attackSplashDescMs ?? 2800)
        : (RULES.ui?.attackSplashMs ?? 2000);
      this.els.attackSplash.classList.remove('hidden');
      this.els.attackSplash.classList.add('show', 'splash-phase-result');
      this.els.attackSplash.classList.remove('splash-phase-name');
      clearTimeout(this.splashTimer);
      this.splashTimer = setTimeout(() => {
        this.els.attackSplash.classList.remove('show', 'splash-phase-result', 'splash-phase-name');
        this.els.attackSplash.classList.add('hidden');
        resolve();
      }, splashMs);
    });
  }

  setMode(mode) {
    this.mode = mode;
    if (mode === null) this.selectedHandIndex = null;
  }

  setTargeting(on) {
    document.getElementById('game')?.classList.toggle('targeting-mode', !!on);
  }

  canCancelSelection(state = this.engine.state) {
    const acting = this.getActingPlayer(state);
    if (this.mode && ['attachEnergy', 'objet', 'supporter', 'tool', 'evolve', 'retreat', 'talent'].includes(this.mode)) {
      return true;
    }
    const pending = state.pending;
    if (!pending) return false;
    const cancellable = [
      'pickHealAlly',
      'pickBenchForDeckEnergy',
      'pickBenchForEnergyRecover',
      'pickKnightForDiscardEnergyAttach',
      'pickDamageOpponentKnight',
      'pickSilenceOpponentKnight',
      'pickRecoverFromDiscard',
      'lookTopDeck',
      'moveEnergy',
      'pickOpponentBenchActive',
      'pickOwnBenchActive',
      'searchDeck',
      'recoverDiscard',
      'attachEnergyFromDiscard',
      'discardHandKnight',
      'teleportPickSide',
      'donDeVie',
      'transferEnergyTalent',
      'athenaExclamationPick',
    ];
    if (!cancellable.includes(pending.type)) return false;
    const owner = pending.chooserPlayerIndex ?? pending.playerIndex;
    return owner === acting;
  }

  cancelSelection() {
    const state = this.engine.state;
    const acting = this.getActingPlayer(state);

    if (this.mode) {
      this.setMode(null);
      this.setTargeting(false);
      this.showBanner('Action annulée.');
      this.render(state);
      return;
    }

    if (this.engine.cancelPending(acting)) {
      this.setTargeting(false);
      this.els.overlay.classList.add('hidden');
      this.render(state);
    }
  }

  render(state) {
    this.resetCardMegaZoomForRender();

    const attackTest = this.isAttackTestMode();
    this.els.game?.classList.toggle('attack-test-mode', attackTest);
    this.els.attackTestBar?.classList.toggle('hidden', !attackTest);
    this.els.handZone?.classList.toggle('hidden', attackTest);

    const seat = attackTest ? 0 : this.getViewSeat(state);
    const bottom = state.players[seat];
    const top = state.players[1 - seat];
    const acting = attackTest ? state.turn : this.getActingPlayer(state);
    const murPending = bottom.modifiers?.pendingMurCrystal;
    this.els.btnTestSimHit?.classList.toggle(
      'hidden',
      !attackTest || !murPending || state.turn !== 1,
    );

    if (this.els.game) {
      this.els.game.dataset.perspective = String(seat);
      this.els.game.classList.toggle('perspective-p1', this.isLocal2p() && seat === 1);
    }

    this.renderPrizes(this.els.oppPrizes, top);
    this.renderPrizes(this.els.playerPrizes, bottom);

    const pickOppBenchPending =
      state.pending?.type === 'pickOpponentBenchActive' &&
      state.pending.chooserPlayerIndex === acting;
    const pickOppBenchOnTop =
      pickOppBenchPending && state.pending.opponentIndex !== seat;
    const pickOppBenchOnBottom =
      pickOppBenchPending && state.pending.opponentIndex === seat;
    const pickOppDamage =
      state.pending?.type === 'pickDamageOpponentKnight' &&
      state.pending.playerIndex === acting;
    const pickOppSilence =
      state.pending?.type === 'pickSilenceOpponentKnight' &&
      state.pending.playerIndex === acting;
    const pickOwnBench =
      state.pending?.type === 'pickOwnBenchActive' &&
      state.pending.chooserPlayerIndex === acting;
    const pickBenchEnergy =
      state.pending?.type === 'pickBenchForDeckEnergy' &&
      state.pending.playerIndex === acting;
    const pickBenchEnergyRecover =
      state.pending?.type === 'pickBenchForEnergyRecover' &&
      state.pending.playerIndex === acting;
    const pickKnightDiscardEnergyAttach =
      state.pending?.type === 'pickKnightForDiscardEnergyAttach' &&
      state.pending.playerIndex === acting;
    const pickDestructionOutil =
      state.pending?.type === 'destructionOutilDiscard' &&
      state.pending.playerIndex === acting;
    const pickCerbereBench =
      state.pending?.type === 'cerbereBenchBonus' &&
      state.pending.playerIndex === acting;
    const pickAthenaExclamation =
      state.pending?.type === 'athenaExclamationPick' &&
      state.pending.playerIndex === acting;
    const pickDistributeDamage =
      state.pending?.type === 'distributeDamage' &&
      state.pending.playerIndex === acting;
    const pickDonDeVie =
      state.pending?.type === 'donDeVie' &&
      state.pending.playerIndex === acting &&
      (state.pending.phase === 'damageTarget' || state.pending.phase === 'healTarget');
    const pickHealAllyNextTurn =
      state.pending?.type === 'pickHealAllyNextTurn' &&
      state.pending.playerIndex === acting;
    const pickVoluntarySacrifice =
      state.pending?.type === 'voluntarySacrificePick' &&
      state.pending.playerIndex === acting;
    const pickHuitiemeSensTarget =
      state.pending?.type === 'pickHuitiemeSensTransfer' &&
      state.pending.playerIndex === acting &&
      state.pending.phase === 'target';
    const pickKanonSanctuaryTarget =
      state.pending?.type === 'pickKanonSanctuary' &&
      state.pending.playerIndex === acting &&
      ['attach', 'moveFrom', 'moveTo'].includes(state.pending.phase);
    const pickOppOnlyBenchTarget = pickCerbereBench || pickDistributeDamage;

    const donDeVieClickable = (knight) =>
      pickDonDeVie && this.isDonDeVieTargetClickable(state, acting, knight);
    const healNextTurnClickable = (knight) =>
      pickHealAllyNextTurn && this.isPendingOptionKnight(state, acting, knight, 'pickHealAllyNextTurn');
    const sacrificeClickable = (knight) =>
      pickVoluntarySacrifice &&
      this.isPendingOptionKnight(state, acting, knight, 'voluntarySacrificePick');
    const athenaExclamationClickable = (knight) =>
      pickAthenaExclamation &&
      this.isPendingOptionKnight(state, acting, knight, 'athenaExclamationPick');
    const huitiemeSensBenchClickable = (knight) =>
      !pickHuitiemeSensTarget ||
      this.isPendingOptionKnight(state, acting, knight, 'pickHuitiemeSensTransfer', ['target']);

    this.renderKnight(
      this.els.oppActive,
      top.active,
      pickOppDamage ||
        pickOppSilence ||
        pickDestructionOutil ||
        pickDistributeDamage ||
        donDeVieClickable(top.active),
      'active',
      top,
    );
    const huitiemeSensActiveClickable =
      !pickHuitiemeSensTarget ||
      (bottom.active &&
        state.pending.options?.some((o) => o.instanceId === bottom.active.instanceId));
    const kanonSanctuaryActiveClickable =
      !pickKanonSanctuaryTarget ||
      this.isKanonSanctuaryTargetClickable(state, acting, 'active', bottom.active);
    const playerActiveInteractive =
      (huitiemeSensActiveClickable &&
        kanonSanctuaryActiveClickable &&
        (!pickDonDeVie || donDeVieClickable(bottom.active))) ||
      healNextTurnClickable(bottom.active) ||
      sacrificeClickable(bottom.active) ||
      athenaExclamationClickable(bottom.active) ||
      (pickKnightDiscardEnergyAttach &&
        state.pending.options?.some((o) => o.instanceId === bottom.active?.instanceId)) ||
      (!pickDonDeVie &&
        !pickHealAllyNextTurn &&
        !pickVoluntarySacrifice &&
        !pickAthenaExclamation &&
        !pickHuitiemeSensTarget &&
        !pickKanonSanctuaryTarget &&
        !pickOppOnlyBenchTarget &&
        !pickKnightDiscardEnergyAttach);
    this.renderKnight(
      this.els.playerActive,
      bottom.active,
      playerActiveInteractive,
      'active',
      bottom,
      state,
      acting,
    );

    this.renderBench(
      this.els.oppBench,
      top.bench,
      (knight, i) =>
        pickOppBenchOnTop ||
        pickOppDamage ||
        pickOppSilence ||
        pickCerbereBench ||
        pickDistributeDamage ||
        pickDestructionOutil ||
        donDeVieClickable(knight),
    );
    this.renderBench(
      this.els.playerBench,
      bottom.bench,
      (knight, i) =>
        pickOwnBench ||
        pickOppBenchOnBottom ||
        pickBenchEnergy ||
        pickBenchEnergyRecover ||
        pickKnightDiscardEnergyAttach ||
        pickDestructionOutil ||
        huitiemeSensBenchClickable(knight) ||
        pickKanonSanctuaryTarget ||
        donDeVieClickable(knight) ||
        healNextTurnClickable(knight) ||
        sacrificeClickable(knight) ||
        athenaExclamationClickable(knight) ||
        (!pickOppBenchPending && !pickOppOnlyBenchTarget),
      state,
      acting,
    );

    this.renderOppDeck(this.els.oppDeck, top.deck.length);
    this.renderPile(this.els.playerDeck, bottom.deck.length, 'Deck');
    this.renderDiscard(this.els.oppDiscard, top.discard.length);
    this.renderDiscard(this.els.playerDiscard, bottom.discard.length);

    this.renderStadium(state);
    this.renderHand(bottom.hand, state);
    this.renderAttacks(state, acting);
    this.renderControls(state, acting);

    if (
      (state.turn !== acting || state.phase !== 'main' || state.winner) &&
      this.mode &&
      ['attachEnergy', 'objet', 'supporter', 'tool', 'evolve', 'retreat'].includes(this.mode)
    ) {
      this.setMode(null);
      this.setTargeting(false);
    }

    if (state.pending) this.handlePending(state);
    else {
      this.resetPickOverlay();
      this.els.overlay.classList.add('hidden');
      if (state.phase === 'chooseActive' && state.pending?.playerIndex === acting) {
        this.setMode('chooseActive');
      }
    }
    this.renderControls(state, acting);

    if (state.winner != null && !attackTest) {
      this.showEndGameOverlay(state);
    } else {
      this.hideEndGameOverlay();
    }
  }

  showEndGameOverlay(state) {
    if (this.endGameShownFor === state.winner && !this.els.endgameOverlay?.classList.contains('hidden')) {
      return;
    }
    const firstShow = this.endGameShownFor !== state.winner;
    this.endGameShownFor = state.winner;
    if (firstShow && this.onMatchEnd) {
      this.onMatchEnd({ winner: state.winner, gameMode: this.gameMode });
    }
    const humanWon = !this.isLocal2p() && state.winner === 0;
    const winnerName = state.players[state.winner]?.name || 'Joueur';
    const custom = this.formatEndGame?.(state);
    const modal = this.els.endgameModal;
    if (modal) {
      modal.classList.remove('win', 'loss');
      if (this.isLocal2p()) modal.classList.add('win');
      else modal.classList.add(humanWon ? 'win' : 'loss');
    }
    if (this.els.endgameTitle) {
      this.els.endgameTitle.textContent =
        custom?.title ??
        (this.isLocal2p() ? 'Partie terminée' : humanWon ? 'Victoire !' : 'Défaite');
    }
    if (this.els.endgameDesc) {
      this.els.endgameDesc.textContent =
        custom?.desc ?? `${winnerName} remporte la partie.`;
    }
    if (this.els.btnReplay) {
      const hideReplay = custom?.hideReplay === true;
      this.els.btnReplay.hidden = hideReplay;
      if (!hideReplay) {
        this.els.btnReplay.textContent = custom?.replayLabel || 'Rejouer';
      }
    }
    if (this.els.btnMainMenu) {
      this.els.btnMainMenu.textContent = custom?.menuLabel || 'Menu principal';
    }
    this.els.endgameOverlay?.classList.remove('hidden');
  }

  hideEndGameOverlay() {
    this.endGameShownFor = null;
    this.els.endgameOverlay?.classList.add('hidden');
  }

  renderPrizes(el, player) {
    el.innerHTML = '';
    const remaining = player.prizes.length;
    for (let i = 0; i < RULES.prizeCount; i++) {
      const card = document.createElement('div');
      card.className = 'prize-card' + (i < remaining ? '' : ' taken');
      if (i < remaining) {
        const prize = player.prizes[i];
        if (prize?.faceUp && prize.cardId) {
          const mini = this.createCardElement(prize.cardId, null, false);
          mini.classList.add('prize-card-face');
          card.innerHTML = '';
          card.appendChild(mini);
        } else {
          card.innerHTML = '<span>Récompense</span>';
        }
      } else {
        card.innerHTML = '<span>Récompense</span>';
      }
      el.appendChild(card);
    }
  }

  renderPile(el, count, label) {
    el.innerHTML = `<div class="pile-stack"><span class="pile-count">${count}</span><span class="pile-label">${label}</span></div>`;
  }

  /** Opponent deck: hidden pile stack (fly anchor) + optional count label only. */
  renderOppDeck(el, count) {
    if (!el) return;
    el.innerHTML = `
      <span class="opp-deck-label">Pioche: <span class="opp-deck-count">${count}</span></span>
      <div class="pile-stack opp-deck-fly-anchor" aria-hidden="true">
        <span class="pile-count">${count}</span><span class="pile-label">Deck</span>
      </div>`;
  }

  renderDiscard(el, count) {
    el.innerHTML = `<div class="pile-stack discard-stack"><span class="pile-count">${count}</span><span class="pile-label">Défausse</span></div>`;
  }

  renderStadium(state) {
    const zone = this.els.stadiumZone;
    const slot = this.els.stadiumZoneCard;
    if (!zone || !slot) return;

    const stadium = state.stadium;
    zone.classList.toggle('stadium-zone--empty', !stadium);
    slot.innerHTML = '';

    if (!stadium?.cardId) return;

    const def = getCardDef(stadium.cardId);
    const mini = this.createCardElement(stadium.cardId, null, false);
    mini.classList.add('stadium-mini');
    slot.appendChild(mini);

    const owner = state.players[stadium.playerIndex]?.name;
    if (owner) {
      const meta = document.createElement('p');
      meta.className = 'stadium-zone-owner';
      meta.textContent = def?.name ? `${def.name} — ${owner}` : owner;
      slot.appendChild(meta);
    }
  }

  createKnightWrap(knight, interactive, zone, ownerPlayer = null) {
    const wrap = document.createElement('div');
    wrap.className = 'knight-wrap';
    wrap.dataset.instanceId = knight.instanceId;
    const skipCardClick = !!interactive;
    wrap.appendChild(this.createCardElement(knight.cardId, knight, interactive, zone, skipCardClick));

    const mur = ownerPlayer?.modifiers?.pendingMurCrystal;
    if (mur?.shieldKnightInstanceId === knight.instanceId) {
      const badge = document.createElement('div');
      badge.className = 'mur-crystal-shield-badge';
      badge.title = 'Mur de Cristal : actif au prochain tour adverse (pièce à la réception)';
      badge.textContent = 'Mur';
      wrap.appendChild(badge);
    }

    const tool = knight.attachedTool;
    if (tool?.cardId) {
      wrap.classList.add('has-tool');
      const toolName = tool.name || getCardDef(tool.cardId)?.name;
      if (toolName) {
        const toolLabel = document.createElement('div');
        toolLabel.className = 'knight-tool-label';
        toolLabel.textContent = toolName;
        toolLabel.title = toolName;
        wrap.appendChild(toolLabel);
      }
      const preview = document.createElement('div');
      preview.className = 'knight-tool-hover-preview';
      preview.setAttribute('aria-hidden', 'true');
      preview.appendChild(this.createCardElement(tool.cardId, null, false, '', true));
      wrap.appendChild(preview);
    }

    if (interactive) {
      wrap.classList.add('interactive');
      wrap.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof zone === 'number') {
          this.onBenchClick(zone);
          return;
        }
        this.onCardClick(knight.cardId, knight, zone);
      });
    }

    return wrap;
  }

  renderBench(el, bench, interactive, state = null, acting = 0) {
    el.innerHTML = '';
    const isSlotInteractive = (knight, i) =>
      typeof interactive === 'function' ? interactive(knight, i) : !!interactive;
    bench.forEach((knight, i) => {
      const slot = document.createElement('div');
      slot.className = 'bench-slot';
      const slotInteractive = isSlotInteractive(knight, i);
      const wrap = this.createKnightWrap(knight, slotInteractive, i);
      const talentOpt = state
        ? this.engine.getTalentOptions(acting).find((o) => o.zone === i)
        : null;
      if (
        talentOpt &&
        slotInteractive &&
        state?.turn === acting &&
        state?.phase === 'main' &&
        !state?.winner &&
        !state?.pending
      ) {
        wrap.appendChild(this.createTalentButton(talentOpt, acting, i, state));
      }
      slot.appendChild(wrap);
      if (slotInteractive) {
        slot.addEventListener('click', () => this.onBenchClick(i));
      }
      el.appendChild(slot);
    });
    while (el.children.length < RULES.maxBench) {
      const empty = document.createElement('div');
      empty.className = 'bench-slot empty';
      el.appendChild(empty);
    }
  }

  renderKnight(el, knight, interactive, zone = '', ownerPlayer = null, state = null, acting = 0) {
    el.innerHTML = '';
    if (!knight) {
      el.classList.add('empty');
      return;
    }
    el.classList.remove('empty');
    const wrap = this.createKnightWrap(knight, interactive, zone, ownerPlayer);
    const talentOpt = state
      ? this.engine.getTalentOptions(acting).find((o) => o.zone === zone)
      : null;
    if (
      talentOpt &&
      interactive &&
      state?.turn === acting &&
      state?.phase === 'main' &&
      !state?.winner &&
      !state?.pending
    ) {
      wrap.appendChild(this.createTalentButton(talentOpt, acting, zone, state));
    }
    el.appendChild(wrap);
  }

  createCardBackElement() {
    const el = document.createElement('article');
    el.className = 'card card-empty';
    el.setAttribute('aria-label', 'Carte face cachée');
    const frame = document.createElement('div');
    frame.className = 'card-frame';
    el.appendChild(frame);
    return el;
  }

  createCardElement(cardId, fieldData = null, interactive = false, zone = '', skipClickHandler = false) {
    const def = getCardDef(cardId);
    const el = document.createElement('article');
    el.className = `card card-${def?.cardType || 'unknown'}`;
    if (isTestOnlyCard(def)) el.classList.add('card-test-dummy');
    el.dataset.cardId = cardId;
    if (def.type) el.dataset.family = def.type;

    const imgSrc = def.image || '';
    const attacksHtml =
      def.attacks?.map((a) => {
        const desc =
          typeof a.description === 'string' && a.description.trim()
            ? `<p class="atk-desc">${a.description.trim()}</p>`
            : '';
        const label = a.label ? `<span class="atk-label">${a.label}</span>` : '';
        return `
      <div class="attack-line">
        <span class="atk-cost">${'◆'.repeat(a.cost || 0) || '—'}</span>
        ${label}
        <strong class="atk-name">${a.name}</strong>
        <span class="atk-dmg">${a.damage ?? ''}</span>
        ${desc}
      </div>`;
      }).join('') || '';

    el.innerHTML = `
      <div class="card-frame">
        <header class="card-header">
          <h3 class="card-name">${def.name}</h3>
          ${def.hp != null ? `<span class="card-hp">${fieldData ? fieldData.currentHp : def.hp}</span>` : ''}
        </header>
        <div class="card-art">
          ${imgSrc ? `<img src="${imgSrc}" alt="${def.name}" loading="eager" onload="this.classList.add('loaded');this.classList.remove('missing')" onerror="this.classList.add('missing');this.classList.remove('loaded')" />` : '<img class="missing" alt="" />'}
          <div class="art-fallback" aria-hidden="true">${isTestOnlyCard(def) ? '<span class="test-dummy-label">Test</span>' : ''}</div>
        </div>
        ${def.type ? `<div class="card-type-banner">${def.type}</div>` : ''}
        ${def.stage === 'cosmo ardent' ? `<div class="card-cosmo-badge">cosmo ardent</div>` : ''}
        ${def.stage === 'evolution' ? `<div class="card-cosmo-badge card-evolution-badge">évolution</div>` : ''}
        ${def.stage === 'chevalier-divin' ? `<div class="card-cosmo-badge card-divin-badge">divin</div>` : ''}
        ${def.knightType === 'GuerrierDivinAsgard' ? `<div class="card-cosmo-badge card-asgard-badge">Asgard</div>` : ''}
        ${def.knightType === 'Spectre' || def.knightType === 'Juge' ? `<div class="card-cosmo-badge card-hades-badge">Hadès</div>` : ''}
        ${def.text && (def.cardType === 'objet' || def.cardType === 'supporter' || def.cardType === 'stade' || def.cardType === 'outil') ? `<div class="card-objet-text"><p>${def.text}</p></div>` : ''}
        ${def.cardType === 'supporter' ? `<div class="card-type-banner card-supporter-badge">Supporter</div>` : ''}
        ${def.cardType === 'stade' ? `<div class="card-type-banner card-stade-badge">Stade</div>` : ''}
        ${def.cardType === 'outil' ? `<div class="card-type-banner card-outil-badge">Outil</div>` : ''}
        ${def.talent ? `<div class="card-talent"><strong>${def.talent.name}</strong><p>${def.talent.text}</p></div>` : ''}
        <div class="card-attacks">${attacksHtml}</div>
        ${def.retreat != null ? `<footer class="card-retreat">Retraite ${def.retreat}</footer>` : ''}
        ${fieldData?.energies?.length ? `<div class="energy-badge">${fieldData.energies.length} énergie(s)</div>` : ''}
        ${fieldData?.statuses?.length ? renderKnightStatusBadges(fieldData.statuses) : ''}
      </div>
    `;

    syncCardImage(el);

    if (
      interactive &&
      this.mode === 'evolve' &&
      this.selectedHandIndex != null &&
      fieldData &&
      (zone === 'active' || typeof zone === 'number')
    ) {
      const acting = this.getActingPlayer(this.engine.state);
      const target = zone === 'active' ? 'active' : zone;
      const ok = this.engine.canEvolve(acting, this.selectedHandIndex, target);
      el.classList.add(ok ? 'evolve-target-ok' : 'evolve-target-no');
    }

    if (interactive && !skipClickHandler) {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onCardClick(cardId, fieldData, zone);
      });
    }

    return el;
  }

  renderHand(hand, state) {
    const el = this.els.hand;
    el.innerHTML = '';
    const n = hand.length;
    const spread = Math.min(28, 12 + n * 2);
    const start = -spread / 2;

    hand.forEach((card, i) => {
      const def = getCardDef(card.cardId);
      const angle = n <= 1 ? 0 : start + (spread / (n - 1 || 1)) * i;
      const wrapper = document.createElement('div');
      wrapper.className = 'hand-card';
      wrapper.style.setProperty('--fan-rotate', `${angle}deg`);
      wrapper.style.setProperty('--fan-y', `${Math.abs(angle) * 0.3}px`);

      const inner = this.createCardElement(card.cardId, null, false);
      inner.classList.add('hand-size');
      if (this.selectedHandIndex === i) inner.classList.add('selected');

      wrapper.appendChild(inner);
      wrapper.addEventListener('click', () => this.onHandClick(i, card, state));
      el.appendChild(wrapper);
    });
  }

  createTalentButton(opt, acting, zone, state) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn talent-btn';
    btn.disabled = !opt.canUse;
    btn.textContent = opt.name;
    btn.title = opt.canUse ? `Utiliser ${opt.name}` : `${opt.name} (indisponible)`;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onTalentClick(acting, zone, state);
    });
    return btn;
  }

  onTalentClick(acting, zone, state) {
    if (state.turn !== acting || state.phase !== 'main' || state.pending) return;
    const ok = this.engine.useTalent(acting, zone);
    if (!ok) {
      this.showBanner('Talent indisponible.', 'warn');
      return;
    }
    this.setMode(null);
    const pending = this.engine.state.pending;
    if (
      pending?.type === 'pickOwnBenchActive' ||
      pending?.type === 'pickOpponentBenchActive' ||
      pending?.type === 'teleportPickSide' ||
      pending?.type === 'searchDeck'
    ) {
      this.setTargeting(true);
      this.render(this.engine.state);
    }
  }

  renderAttacks(state, acting = this.getActingPlayer(state)) {
    const bar = this.els.attackBar;
    bar.innerHTML = '';
    const attackTest = this.isAttackTestMode();
    if (attackTest) acting = state.turn;
    if (state.turn !== acting || state.phase !== 'main' || state.winner) return;

    const firstTurnBlock = attackTest ? false : !this.engine.canAttackThisTurn(acting);
    const opts = this.engine.getAttackOptions(acting);
    opts.forEach((o) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn atk-btn';
      btn.disabled = !o.canUse;
      if (firstTurnBlock && !o.canUse) {
        btn.title = 'Premier tour : pas d\'attaque pour le joueur qui commence.';
      }
      btn.textContent = `${o.attack.fromTool ? '★ ' : ''}${o.attack.label}: ${o.attack.name}`;
      btn.addEventListener('click', () => {
        if (!this.engine.canAttackThisTurn(acting)) {
          this.showBanner('Premier tour : vous ne pouvez pas attaquer.', 'warn');
          return;
        }
        if (this.relayOnlineAction({ type: 'attack', attackIndex: o.index })) {
          this.setMode(null);
          return;
        }
        this.engine.attack(acting, o.index);
        this.setMode(null);
      });
      bar.appendChild(btn);
    });

    const talentOpts = this.engine.getTalentOptions(acting);
    const talentGroup = document.createElement('div');
    talentGroup.className = 'attack-bar-talents';
    talentOpts.forEach((opt) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn talent-btn';
      btn.disabled = !opt.canUse || !!state.pending;
      const zoneLabel =
        opt.zone === 'active' ? 'Actif' : `Banc ${Number(opt.zone) + 1}`;
      btn.textContent = `${opt.name} (${zoneLabel})`;
      btn.addEventListener('click', () => this.onTalentClick(acting, opt.zone, state));
      talentGroup.appendChild(btn);
    });
    if (talentGroup.childElementCount > 0) bar.appendChild(talentGroup);

    if (firstTurnBlock) {
      const hint = document.createElement('span');
      hint.className = 'attack-hint';
      hint.textContent = 'Premier tour — pas d\'attaque (joueur qui commence).';
      bar.prepend(hint);
    }
  }

  renderControls(state, acting = this.getActingPlayer(state)) {
    const attackTest = this.isAttackTestMode();
    if (attackTest) acting = state.turn;
    this.els.btnEndTurn.disabled = state.turn !== acting || !!state.winner;
    this.els.btnRetreat.disabled = attackTest || !this.engine.canRetreat(acting);
    const showCancel = this.canCancelSelection(state);
    if (this.els.btnCancel) {
      this.els.btnCancel.classList.toggle('hidden', !showCancel);
      this.els.btnCancel.disabled = !showCancel;
    }
  }

  onHandClick(index, card, state) {
    const def = getCardDef(card.cardId);
    const acting = this.getActingPlayer(state);

    if (
      state.phase === 'chooseActive' &&
      state.pending?.type === 'chooseActive' &&
      state.pending.playerIndex === acting
    ) {
      if (isBaseChevalier(card.cardId)) {
        if (this.relayOnlineAction({ type: 'chooseActive', benchIndex: index })) return;
        this.engine.chooseActive(acting, index);
      } else if (isChevalierCard(def)) {
        this.showBanner('Choisissez un chevalier de base comme actif.', 'warn');
      }
      return;
    }

    if (state.pending?.type === 'discardForAttack' && state.pending.playerIndex === acting) {
      if (this.relayOnlineAction({ type: 'discardForPending', handIndex: index })) {
        if (!this.engine.state.pending) this.setTargeting(false);
        return;
      }
      this.engine.discardForPending(acting, index);
      if (!this.engine.state.pending) this.setTargeting(false);
      return;
    }

    if (
      state.pending?.type === 'optionalDiscardNamedCardsForAttack' &&
      state.pending.playerIndex === acting
    ) {
      const ok = this.engine.discardNamedCardForAttack(acting, index);
      if (ok) this.render(this.engine.state);
      else this.showBanner('Choisissez un Saphir d\'Odin en main.', 'warn');
      return;
    }

    if (state.pending?.type === 'accelerationEnergieDiscard' && state.pending.playerIndex === acting) {
      if (isChevalierNoirCard(card.cardId)) {
        this.engine.resolveAccelerationDiscardFromHand(acting, index);
        if (this.engine.state.pending?.type !== 'accelerationEnergieDiscard') {
          this.els.overlay.classList.add('hidden');
        }
      } else {
        this.showBanner('Guilty : choisissez un Chevalier Noir en main.', 'warn');
      }
      return;
    }

    if (state.pending?.type === 'missionGigasPlaceKnight' && state.pending.playerIndex === acting) {
      if (card.instanceId === state.pending.knightInstanceId) {
        void this.engine.resolveMissionGigasPlaceKnight(acting, index).then((ok) => {
          if (!ok) {
            this.showBanner('Impossible de placer ce Chevalier d\'Argent sur le banc.', 'warn');
          } else {
            this.els.overlay.classList.add('hidden');
            this.setMode(null);
            this.setTargeting(false);
          }
          this.render(this.engine.state);
        });
      } else {
        this.showBanner('Mission de Gigas : cliquez sur le Chevalier d\'Argent trouvé.', 'warn');
      }
      return;
    }

    if (state.pending?.type === 'discardForTalent' && state.pending.playerIndex === acting) {
      this.engine.resolveDiscardForTalent(acting, index);
      if (!this.engine.state.pending) this.setTargeting(false);
      return;
    }

    if (
      state.pending?.type === 'discardEnergyFromHandForTalent' &&
      state.pending.playerIndex === acting
    ) {
      if (isEnergieCard(def)) {
        this.engine.resolveDiscardEnergyFromHandForTalent(acting, index);
      } else {
        this.showBanner('Défaussez une carte Énergie.', 'warn');
      }
      if (!this.engine.state.pending) this.setTargeting(false);
      return;
    }

    if (state.pending?.type === 'attachEnergyFromHand' && state.pending.playerIndex === acting) {
      const allowed = state.pending.options?.some((o) => o.handIndex === index);
      if (allowed && isEnergieCard(def)) {
        this.engine.resolveAttachEnergyFromHand(acting, index);
      }
      return;
    }

    if (state.pending?.type === 'discardHandKnight' && state.pending.playerIndex === acting) {
      if (isChevalierCard(def)) {
        const ok = this.engine.resolveDiscardHandKnight(acting, index);
        if (ok) this.render(this.engine.state);
      } else {
        this.showBanner('Défaussez un Chevalier de votre main.', 'warn');
      }
      return;
    }

    if (
      state.pending?.type === 'discardHandSilenceOpponentTalent' &&
      state.pending.playerIndex === acting
    ) {
      const ok = this.engine.resolveDiscardHandSilenceOpponentTalent(acting, index);
      if (ok) this.setTargeting(false);
      return;
    }

    if (state.pending?.type === 'searchDeck' && state.pending.playerIndex === acting) {
      const deckCard = state.pending.options?.find((o) => o.instanceId === card.instanceId);
      if (deckCard) this.engine.resolveSearchDeck(acting, deckCard.instanceId);
      return;
    }

    if (state.turn !== acting || state.phase !== 'main') return;

    if (this.mode === 'attachEnergy' && isEnergieCard(def)) {
      return;
    }

    if (this.mode === 'attachEnergy' || this.mode === 'objet' || this.mode === 'supporter' || this.mode === 'evolve' || this.mode === 'tool') {
      return;
    }

    this.selectedHandIndex = index;

    if (isEnergieCard(def) && this.engine.canAttachEnergy(acting)) {
      this.selectedHandIndex = index;
      this.setMode('attachEnergy');
      this.showBanner('Énergie sélectionnée — cliquez sur votre chevalier actif ou de banc.');
      this.setTargeting(true);
      return;
    }

    if (def.cardType === 'stade' && this.engine.canPlayStadium(acting)) {
      const ok = this.engine.playStadium(acting, index);
      if (!ok) {
        this.showBanner(`Impossible de jouer ${def.name} (Stade).`, 'warn');
      } else {
        this.setMode(null);
        this.setTargeting(false);
      }
      return;
    }

    if (def.cardType === 'stade' && !this.engine.canPlayStadium(acting)) {
      if (this.engine.actions.stadium) {
        this.showBanner('Vous avez déjà joué un stade ce tour.', 'warn');
      } else if (state.players[acting].modifiers.cantPlayCardNextTurn) {
        this.showBanner('Vous ne pouvez pas jouer de carte ce tour.', 'warn');
      }
      return;
    }

    if (def.cardType === 'supporter' && this.engine.canPlaySupporter(acting)) {
      if (def.effects?.some((e) => e.type === 'acceleration_energie')) {
        this.selectedHandIndex = index;
        void this.engine.playObjet(acting, index, 'active').then((ok) => {
          if (!ok) this.showBanner(`Impossible de jouer ${def.name} (Supporter).`, 'warn');
          else this.setMode(null);
          this.setTargeting(false);
          this.render(this.engine.state);
        });
        return;
      }
      this.selectedHandIndex = index;
      this.setMode('supporter');
      this.setTargeting(true);
      this.showBanner(`${def.name} (Supporter) : choisissez un chevalier.`);
      return;
    }

    if (def.cardType === 'outil' && this.engine.canPlayTool(acting)) {
      this.selectedHandIndex = index;
      this.setMode('tool');
      this.setTargeting(true);
      this.showBanner(`Choisissez un chevalier pour attacher ${def.name}.`);
      return;
    }

    if (def.cardType === 'objet' && this.engine.canPlayObjetItem(acting)) {
      const skipsKnight = this.engine.effects.objetSkipsKnightTarget(def);
      if (skipsKnight) {
        this.selectedHandIndex = index;
        void this.engine.playObjet(acting, index, 'active').then((ok) => {
          if (!ok) this.showBanner(`Impossible de jouer ${def.name}.`, 'warn');
          else this.setMode(null);
          this.setTargeting(false);
          this.render(this.engine.state);
        });
        return;
      }
      this.selectedHandIndex = index;
      this.setMode('objet');
      this.setTargeting(true);
      if (def.id === 'objet_harpe_de_pandore') {
        this.showBanner(`${def.name} : chevalier source (avec Énergie).`);
      } else {
        this.showBanner(`${def.name} : choisissez un chevalier (actif ou banc).`);
      }
      return;
    }

    if (isEvolutionStage(def.stage)) {
      if (!this.engine.canEvolveThisTurn(acting)) {
        this.showBanner('Premier tour : évolution impossible.', 'warn');
        return;
      }
      if (!this.engine.canEvolveFromHand(acting, index)) {
        if (this.engine.hasEvolveMatchNotEligibleThisTurn(acting, index)) {
          this.showBanner(
            'Évolution impossible : seuls les chevaliers déjà en jeu au début du tour peuvent évoluer.',
            'warn',
          );
        } else if (
          this.engine.hasEvolveMatchMissingTool(acting, index) ||
          requiresEvolutionTool(def)
        ) {
          const toolName = getEvolutionRequiredToolName(def) || 'outil requis';
          this.showBanner(
            `Évolution impossible : cible compatible avec ${toolName} attaché requis.`,
            'warn',
          );
        } else {
          this.showBanner('Aucun chevalier compatible en jeu pour cette évolution.', 'warn');
        }
        return;
      }
      this.selectedHandIndex = index;
      this.setMode('evolve');
      const fromName = formatEvolvesFrom(def);
      const evoLabel =
        def.stage === 'chevalier-divin'
          ? 'armure divine'
          : def.stage === 'evolution'
            ? 'évolution'
            : 'cosmo ardent';
      this.showBanner(`Choisissez ${fromName} à faire évoluer en ${evoLabel}.`);
      this.setTargeting(true);
      this.render(state);
      return;
    }

    if (isBaseChevalier(card.cardId)) {
      if (this.engine.canPlayChevalier(acting, index)) {
        if (this.relayOnlineAction({ type: 'playChevalierToBench', handIndex: index })) {
          this.setMode(null);
          return;
        }
        this.engine.playChevalierToBench(acting, index);
        this.setMode(null);
        return;
      }
      const cur = state.players[acting];
      if (cur.bench.length >= RULES.maxBench) {
        this.showBanner('Banc plein — 5 chevaliers maximum.', 'warn');
      } else if (cur.modifiers.cantPlayCardNextTurn) {
        this.showBanner('Vous ne pouvez pas jouer de carte ce tour.', 'warn');
      }
      return;
    }

    if (isChevalierCard(def) && !isBaseChevalier(card.cardId)) {
      this.showBanner('Seuls les chevaliers de base peuvent aller sur le banc.', 'warn');
      return;
    }

    this.render(state);
  }

  async onCardClick(cardId, fieldData, zone) {
    const state = this.engine.state;
    const acting = this.getActingPlayer(state);
    if (this.tryHumanPromoteActive(this.benchIndexFromZone(zone))) return;
    if (
      state.turn !== acting &&
      state.phase !== 'chooseActive' &&
      !this.canHumanActOnPending(state, acting)
    ) {
      return;
    }

    if (
      state.pending?.type === 'donDeVie' &&
      state.pending.playerIndex === acting &&
      fieldData &&
      (state.pending.phase === 'damageTarget' || state.pending.phase === 'healTarget')
    ) {
      const opt = state.pending.options?.find((o) => o.instanceId === fieldData.instanceId);
      if (opt) {
        const ok = this.engine.resolveDonDeViePick(acting, fieldData.instanceId);
        if (ok && this.engine.state.pending?.type !== 'donDeVie') {
          this.setTargeting(false);
        } else if (ok) {
          this.render(this.engine.state);
        }
      }
      return;
    }

    if (
      state.pending?.type === 'pickHuitiemeSensTransfer' &&
      state.pending.playerIndex === acting &&
      state.pending.phase === 'target' &&
      fieldData
    ) {
      const opt = state.pending.options?.find((o) => o.instanceId === fieldData.instanceId);
      if (opt) {
        const ok = this.engine.resolvePickHuitiemeSensTarget(acting, fieldData.instanceId);
        if (ok && !this.engine.state.pending) this.setTargeting(false);
        else if (ok) this.render(this.engine.state);
      }
      return;
    }

    if (
      state.pending?.type === 'pickHealAllyNextTurn' &&
      state.pending.playerIndex === acting &&
      fieldData
    ) {
      const opt = state.pending.options?.find((o) => o.instanceId === fieldData.instanceId);
      if (opt) {
        const ok = this.engine.resolvePickHealAllyNextTurn(acting, fieldData.instanceId);
        if (ok) this.setTargeting(false);
      }
      return;
    }

    if (
      state.pending?.type === 'voluntarySacrificePick' &&
      state.pending.playerIndex === acting &&
      fieldData
    ) {
      const opt = state.pending.options?.find((o) => o.instanceId === fieldData.instanceId);
      if (opt) {
        const ok = this.engine.resolveVoluntarySacrificeKnight(acting, fieldData.instanceId);
        if (ok) this.setTargeting(false);
      }
      return;
    }

    if (state.pending?.type === 'pickKanonSanctuary' && state.pending.playerIndex === acting) {
      const target = zone === 'active' ? 'active' : typeof zone === 'number' ? zone : null;
      if (target != null && fieldData) {
        const ok = this.engine.resolvePickKanonSanctuaryTarget(acting, target);
        if (ok && !this.engine.state.pending) {
          this.setTargeting(false);
        } else if (ok && this.engine.state.pending?.type === 'pickKanonSanctuary') {
          this.handlePending(this.engine.state);
        }
      }
      return;
    }

    if (this.mode === 'attachEnergy' && this.selectedHandIndex != null) {
      const target = zone === 'active' ? 'active' : typeof zone === 'number' ? zone : null;
      if (target != null) {
        const ok = this.engine.attachEnergy(acting, this.selectedHandIndex, target);
        if (!ok) this.showBanner('Impossible d\'attacher l\'énergie.', 'warn');
      }
      this.setMode(null);
      this.setTargeting(false);
      return;
    }

    if (state.pending?.type === 'moveEnergy' && state.pending.playerIndex === acting) {
      const target = zone === 'active' ? 'active' : typeof zone === 'number' ? zone : null;
      if (target != null) {
        const ok = this.engine.resolveMoveEnergy(acting, target);
        if (!ok) this.showBanner('Impossible de déplacer l\'énergie vers ce chevalier.', 'warn');
        else this.setTargeting(false);
      }
      return;
    }

    if (state.pending?.type === 'pickHealAlly' && state.pending.playerIndex === acting && fieldData) {
      const opt = state.pending.options?.find((o) => o.instanceId === fieldData.instanceId);
      if (opt) {
        const ok = this.engine.resolvePickHealAlly(acting, fieldData.instanceId);
        if (ok) this.setTargeting(false);
      }
      return;
    }

    if (
      state.pending?.type === 'pickKnightForDiscardEnergyAttach' &&
      state.pending.playerIndex === acting &&
      fieldData
    ) {
      const opt = state.pending.options?.find((o) => o.instanceId === fieldData.instanceId);
      if (opt) {
        const ok = this.engine.resolvePickKnightForDiscardEnergyAttach(acting, fieldData.instanceId);
        if (ok && !this.engine.state.pending) this.setTargeting(false);
      } else {
        this.showBanner('Choisissez un Guerrier Divin d\'Asgard.', 'warn');
      }
      return;
    }

    if (
      state.pending?.type === 'athenaExclamationPick' &&
      state.pending.playerIndex === acting &&
      fieldData
    ) {
      const opt = state.pending.options?.find((o) => o.instanceId === fieldData.instanceId);
      if (opt) {
        const ok = this.engine.resolveAthenaExclamationPick(acting, fieldData.instanceId);
        if (ok && !this.engine.state.pending) this.setTargeting(false);
        else if (ok) this.render(this.engine.state);
      } else {
        this.showBanner(
          "Exclamation d'Athéna : choisissez un Chevalier d'Or distinct avec Énergie.",
          'warn',
        );
      }
      return;
    }

    if (
      state.pending?.type === 'pickBenchForDeckEnergy' &&
      state.pending.playerIndex === acting &&
      fieldData
    ) {
      const opt = state.pending.options?.find((o) => o.instanceId === fieldData.instanceId);
      if (opt) {
        const ok = this.engine.resolvePickBenchForDeckEnergy(acting, fieldData.instanceId);
        if (ok) this.setTargeting(false);
      }
      return;
    }

    if (
      state.pending?.type === 'pickBenchForEnergyRecover' &&
      state.pending.playerIndex === acting &&
      fieldData
    ) {
      const opt = state.pending.options?.find((o) => o.instanceId === fieldData.instanceId);
      if (opt) {
        const ok = this.engine.resolvePickBenchForEnergyRecover(acting, fieldData.instanceId);
        if (ok) this.setTargeting(false);
      }
      return;
    }

    if (
      state.pending?.type === 'destructionOutilDiscard' &&
      state.pending.playerIndex === acting &&
      fieldData?.attachedTool
    ) {
      const ok = this.engine.resolveDestructionOutilPick(acting, fieldData.instanceId);
      if (ok && this.engine.state.pending?.type !== 'destructionOutilDiscard') {
        this.setTargeting(false);
        this.els.overlay.classList.add('hidden');
      }
      return;
    }

    if (
      state.pending?.type === 'cerbereBenchBonus' &&
      state.pending.playerIndex === acting &&
      fieldData
    ) {
      const opt = state.pending.options?.find((o) => o.instanceId === fieldData.instanceId);
      if (opt) {
        const ok = this.engine.resolveCerbereBenchBonusPick(acting, fieldData.instanceId);
        if (ok && !this.engine.state.pending) this.setTargeting(false);
      }
      return;
    }

    if (
      state.pending?.type === 'distributeDamage' &&
      state.pending.playerIndex === acting &&
      fieldData
    ) {
      const opt = state.pending.options?.find((o) => o.instanceId === fieldData.instanceId);
      if (opt) {
        const ok = this.engine.resolveDistributeDamageAssign(acting, fieldData.instanceId);
        if (ok && this.engine.state.pending?.type === 'distributeDamage') {
          this.showDistributeDamageModal(this.engine.state.pending, acting);
        } else if (ok) {
          this.setTargeting(false);
          this.resetPickOverlay();
          this.els.overlay.classList.add('hidden');
        }
      }
      return;
    }

    if (
      state.pending?.type === 'pickDamageOpponentKnight' &&
      state.pending.playerIndex === acting &&
      fieldData
    ) {
      const opt = state.pending.options?.find((o) => o.instanceId === fieldData.instanceId);
      if (opt) {
        const ok = this.engine.resolvePickDamageOpponentKnight(acting, fieldData.instanceId);
        if (ok) this.setTargeting(false);
      }
      return;
    }

    if (
      state.pending?.type === 'pickSilenceOpponentKnight' &&
      state.pending.playerIndex === acting &&
      fieldData
    ) {
      const opt = state.pending.options?.find((o) => o.instanceId === fieldData.instanceId);
      if (opt) {
        const ok = this.engine.resolvePickSilenceOpponentKnight(acting, fieldData.instanceId);
        if (ok) this.setTargeting(false);
      }
      return;
    }

    if (
      state.pending?.type === 'sacrificeBenchForAttack' &&
      state.pending.playerIndex === acting &&
      fieldData
    ) {
      const opt = state.pending.options?.find((o) => o.instanceId === fieldData.instanceId);
      if (opt) {
        const ok = this.engine.resolveSacrificeBenchForAttack(acting, fieldData.instanceId);
        if (ok) this.setTargeting(false);
      }
      return;
    }

    if (
      state.pending?.type === 'charonSwapBench' &&
      state.pending.playerIndex === acting &&
      fieldData
    ) {
      const opt = state.pending.options?.find((o) => o.instanceId === fieldData.instanceId);
      if (opt) {
        const ok = this.engine.resolveCharonSwapBench(acting, fieldData.instanceId);
        if (ok) this.setTargeting(false);
      }
      return;
    }

    if (
      state.pending?.type === 'transferEnergyToHades' &&
      state.pending.playerIndex === acting &&
      fieldData
    ) {
      const pending = state.pending;
      if (pending.step === 'from' && fieldData.energies?.length) {
        const ok = this.engine.resolveTransferEnergyToHadesSource(acting, fieldData.instanceId);
        if (!ok) this.showBanner('Pharaon : choisissez un chevalier avec Énergie.', 'warn');
        return;
      }
      if (pending.step === 'to') {
        const opt = pending.hadesOptions?.find((o) => o.instanceId === fieldData.instanceId);
        if (opt) {
          const ok = this.engine.resolveTransferEnergyToHadesDest(acting, fieldData.instanceId);
          if (ok) this.setTargeting(false);
        }
      }
      return;
    }

    if (state.pending?.type === 'transferEnergyTalent' && state.pending.playerIndex === acting) {
      const target = zone === 'active' ? 'active' : typeof zone === 'number' ? zone : null;
      if (target != null) {
        const ok = this.engine.resolveTransferEnergyTalentStep(acting, target);
        if (!ok) this.showBanner('Transfert impossible.', 'warn');
        else if (!this.engine.state.pending) this.setTargeting(false);
      }
      return;
    }

    if (state.pending?.type === 'pickMeleeBonusAlly' && state.pending.playerIndex === acting && fieldData) {
      const opt = state.pending.options?.find((o) => o.instanceId === fieldData.instanceId);
      if (opt) {
        const ok = this.engine.resolvePickMeleeBonusAlly(acting, fieldData.instanceId);
        if (ok) this.setTargeting(false);
      }
      return;
    }

    if (
      state.pending?.type === 'accelerationEnergieAttach' &&
      state.pending.playerIndex === acting &&
      fieldData
    ) {
      const opt = state.pending.options?.find((o) => o.instanceId === fieldData.instanceId);
      if (opt) {
        this.engine.resolveAccelerationAttach(acting, fieldData.instanceId);
        if (!this.engine.state.pending) this.setTargeting(false);
      } else {
        this.showBanner('Guilty : choisissez un Chevalier Noir ou Phénix Méchant.', 'warn');
      }
      return;
    }

    if (this.mode === 'tool' && this.selectedHandIndex != null) {
      const target = zone === 'active' ? 'active' : typeof zone === 'number' ? zone : null;
      if (target != null) {
        const p = state.players[acting];
        const knight = target === 'active' ? p.active : p.bench[target];
        if (knight?.attachedTool) {
          this.showBanner('Ce chevalier a déjà un outil.', 'warn');
          return;
        }
        const def = getCardDef(p.hand[this.selectedHandIndex]?.cardId);
        const ok = await this.engine.playTool(acting, this.selectedHandIndex, target);
        if (!ok) {
          this.showBanner(`Impossible d'attacher ${def?.name || 'cet outil'}.`, 'warn');
          return;
        }
        this.setMode(null);
        if (this.engine.state.pending?.type === 'moveEnergy') {
          this.setTargeting(true);
          this.showBanner('Choisissez le chevalier destinataire de l\'énergie.');
        } else {
          this.setTargeting(false);
        }
      }
      return;
    }

    if ((this.mode === 'objet' || this.mode === 'supporter') && this.selectedHandIndex != null) {
      const def = getCardDef(this.engine.state.players[acting].hand[this.selectedHandIndex]?.cardId);
      let target = zone === 'active' ? 'active' : typeof zone === 'number' ? zone : null;
      if (def?.id === 'objet_harpe_de_pandore') {
        const p = state.players[acting];
        const src = target === 'active' ? p.active : typeof target === 'number' ? p.bench[target] : null;
        if (!src?.energies?.length) {
          this.showBanner('Harpe de Pandore : choisissez un chevalier avec au moins une Énergie.', 'warn');
          return;
        }
      }
      if (def?.effects?.some((e) => e.type === 'survie') && target !== 'active') {
        this.showBanner('Sunrei : cliquez sur votre Chevalier actif.', 'warn');
        return;
      }
      if (target != null) {
        const ok = this.engine.playObjet(acting, this.selectedHandIndex, target);
        if (!ok) this.showBanner(`Impossible de jouer ${def?.name || 'cet objet'}.`, 'warn');
        else if (this.engine.state.pending?.type === 'moveEnergy') {
          this.showBanner('Harpe de Pandore : choisissez le chevalier destinataire.');
          return;
        }
      }
      this.setMode(null);
      this.setTargeting(false);
      return;
    }

    if (this.mode === 'evolve' && this.selectedHandIndex != null) {
      const target = zone === 'active' ? 'active' : typeof zone === 'number' ? zone : null;
      if (target != null) {
        const ok = this.engine.evolveCosmo(acting, this.selectedHandIndex, target);
        if (!ok) return;
      }
      this.setMode(null);
      this.setTargeting(false);
      return;
    }

    if (this.mode === 'retreat') {
      if (typeof zone === 'number') {
        const benchIdx = zone;
        this.engine.retreat(acting, benchIdx);
        this.setMode(null);
        this.setTargeting(false);
      }
      return;
    }
  }

  benchIndexFromZone(zone) {
    if (typeof zone === 'number') return zone;
    return null;
  }

  canHumanPromoteActive(state = this.engine.state) {
    const pending = state.pending;
    const acting = this.getActingPlayer(state);
    if (pending?.type !== 'promoteActive' || pending.playerIndex !== acting) return false;
    return true;
  }

  tryHumanPromoteActive(benchIndex) {
    const state = this.engine.state;
    const acting = this.getActingPlayer(state);
    if (!this.canHumanPromoteActive(state)) return false;
    if (typeof benchIndex !== 'number' || !state.players[acting].bench[benchIndex]) return false;
    if (this.relayOnlineAction({ type: 'promoteActive', benchIndex })) return true;
    const ok = this.engine.promoteActive(acting, benchIndex);
    if (ok) {
      this.setMode(null);
      this.setTargeting(false);
      this.audio?.playPromote?.();
    }
    return ok;
  }

  onBenchClick(index) {
    if (this.tryHumanPromoteActive(index)) return;
    if (this.tryHumanDestructionOutilPick(index)) return;
    if (this.tryHumanCerbereBenchPick(index)) return;
    if (this.tryHumanDistributeDamagePick(index)) return;
    if (this.tryHumanPickDamageOpponentKnight(index)) return;
    if (this.tryHumanPickSilenceOpponentKnight(index)) return;
    if (this.tryHumanPickOpponentBenchActive(index)) return;
    if (this.tryHumanPickOwnBenchActive(index)) return;
    if (this.tryHumanPickBenchForDeckEnergy(index)) return;
    if (this.tryHumanAccelerationDiscardBench(index)) return;
    const state = this.engine.state;
    const acting = this.getActingPlayer(state);
    const knight = state.players[acting].bench[index];
    if (knight) this.onCardClick(knight.cardId, knight, index);
    else this.onCardClick(null, null, index);
  }

  tryHumanAccelerationDiscardBench(benchIndex) {
    const state = this.engine.state;
    const acting = this.getActingPlayer(state);
    const pending = state.pending;
    if (pending?.type !== 'accelerationEnergieDiscard' || pending.playerIndex !== acting) {
      return false;
    }
    const knight = state.players[acting].bench[benchIndex];
    if (!knight || !isChevalierNoirCard(knight.cardId)) {
      if (knight) this.showBanner('Guilty : choisissez un Chevalier Noir sur le banc.', 'warn');
      return false;
    }
    const ok = this.engine.resolveAccelerationDiscardFromBench(acting, benchIndex);
    if (ok && state.pending?.type !== 'accelerationEnergieDiscard') {
      this.els.overlay.classList.add('hidden');
    }
    return ok;
  }

  canHumanPickDamageOpponentKnight(state = this.engine.state) {
    const pending = state.pending;
    const acting = this.getActingPlayer(state);
    return pending?.type === 'pickDamageOpponentKnight' && pending.playerIndex === acting;
  }

  tryHumanPickDamageOpponentKnight(benchIndex) {
    const state = this.engine.state;
    if (!this.canHumanPickDamageOpponentKnight(state)) return false;
    const acting = this.getActingPlayer(state);
    const pending = state.pending;
    const opp = state.players[pending.opponentIndex ?? 1 - acting];
    const knight = opp.bench[benchIndex];
    if (!knight) return false;
    const ok = this.engine.resolvePickDamageOpponentKnight(acting, knight.instanceId);
    if (ok) {
      this.setMode(null);
      this.setTargeting(false);
    }
    return ok;
  }

  canHumanPickSilenceOpponentKnight(state = this.engine.state) {
    const pending = state.pending;
    const acting = this.getActingPlayer(state);
    return pending?.type === 'pickSilenceOpponentKnight' && pending.playerIndex === acting;
  }

  tryHumanPickSilenceOpponentKnight(benchIndex) {
    const state = this.engine.state;
    if (!this.canHumanPickSilenceOpponentKnight(state)) return false;
    const acting = this.getActingPlayer(state);
    const pending = state.pending;
    const opp = state.players[pending.opponentIndex ?? 1 - acting];
    const knight = opp.bench[benchIndex];
    if (!knight) return false;
    const opt = pending.options?.find((o) => o.instanceId === knight.instanceId);
    if (!opt) return false;
    const ok = this.engine.resolvePickSilenceOpponentKnight(acting, knight.instanceId);
    if (ok) {
      this.setMode(null);
      this.setTargeting(false);
    }
    return ok;
  }

  tryHumanDestructionOutilPick(benchIndex) {
    const state = this.engine.state;
    const acting = this.getActingPlayer(state);
    const pending = state.pending;
    if (pending?.type !== 'destructionOutilDiscard' || pending.playerIndex !== acting) {
      return false;
    }
    const opp = state.players[1 - acting];
    const own = state.players[acting];
    const knight = [opp.bench[benchIndex], own.bench[benchIndex]].find((k) => k?.attachedTool);
    if (!knight) {
      this.showBanner('Sceau d\'Athéna : aucun Outil sur ce slot de banc.', 'warn');
      return false;
    }
    const ok = this.engine.resolveDestructionOutilPick(acting, knight.instanceId);
    if (ok && state.pending?.type !== 'destructionOutilDiscard') {
      this.setMode(null);
      this.setTargeting(false);
      this.els.overlay.classList.add('hidden');
    }
    return ok;
  }

  tryHumanCerbereBenchPick(benchIndex) {
    const state = this.engine.state;
    const acting = this.getActingPlayer(state);
    const pending = state.pending;
    if (pending?.type !== 'cerbereBenchBonus' || pending.playerIndex !== acting) {
      return false;
    }
    const opp = state.players[pending.opponentIndex ?? 1 - acting];
    const knight = opp.bench[benchIndex];
    if (!knight) return false;
    const ok = this.engine.resolveCerbereBenchBonusPick(acting, knight.instanceId);
    if (ok && !this.engine.state.pending) {
      this.setMode(null);
      this.setTargeting(false);
    }
    return ok;
  }

  tryHumanDistributeDamagePick(benchIndex) {
    const state = this.engine.state;
    const acting = this.getActingPlayer(state);
    const pending = state.pending;
    if (pending?.type !== 'distributeDamage' || pending.playerIndex !== acting) {
      return false;
    }
    const opt = pending.options?.find((o) => o.target === benchIndex);
    if (!opt) return false;
    const ok = this.engine.resolveDistributeDamageAssign(acting, opt.instanceId);
    if (ok && this.engine.state.pending?.type === 'distributeDamage') {
      this.showDistributeDamageModal(this.engine.state.pending, acting);
    } else if (ok) {
      this.setMode(null);
      this.setTargeting(false);
      this.resetPickOverlay();
      this.els.overlay.classList.add('hidden');
    }
    return ok;
  }

  tryHumanPickBenchForDeckEnergy(benchIndex) {
    const state = this.engine.state;
    const acting = this.getActingPlayer(state);
    const pending = state.pending;
    if (pending?.type !== 'pickBenchForDeckEnergy' || pending.playerIndex !== acting) {
      return false;
    }
    const knight = state.players[acting].bench[benchIndex];
    if (!knight) return false;
    const opt = pending.options?.find((o) => o.instanceId === knight.instanceId);
    if (!opt) return false;
    const ok = this.engine.resolvePickBenchForDeckEnergy(acting, knight.instanceId);
    if (ok) {
      this.setMode(null);
      this.setTargeting(false);
    }
    return ok;
  }

  canHumanPickOpponentBench(state = this.engine.state) {
    const pending = state.pending;
    const acting = this.getActingPlayer(state);
    return (
      pending?.type === 'pickOpponentBenchActive' && pending.chooserPlayerIndex === acting
    );
  }

  tryHumanPickOpponentBenchActive(benchIndex) {
    const state = this.engine.state;
    if (!this.canHumanPickOpponentBench(state)) return false;
    const acting = this.getActingPlayer(state);
    const pending = state.pending;
    if (!state.players[pending.opponentIndex]?.bench[benchIndex]) return false;
    const ok = this.engine.pickOpponentBenchActive(acting, benchIndex);
    if (ok) {
      this.setMode(null);
      this.setTargeting(false);
    }
    return ok;
  }

  canHumanPickOwnBench(state = this.engine.state) {
    const pending = state.pending;
    const acting = this.getActingPlayer(state);
    return pending?.type === 'pickOwnBenchActive' && pending.chooserPlayerIndex === acting;
  }

  tryHumanPickOwnBenchActive(benchIndex) {
    const state = this.engine.state;
    if (!this.canHumanPickOwnBench(state)) return false;
    const acting = this.getActingPlayer(state);
    if (!state.players[acting].bench[benchIndex]) return false;
    const ok = this.engine.pickOwnBenchActive(acting, benchIndex);
    if (ok) {
      this.setMode(null);
      this.setTargeting(false);
    }
    return ok;
  }

  handlePending(state) {
    const p = state.pending;
    const acting = this.getActingPlayer(state);
    if (p.type === 'chooseActive' && p.playerIndex === acting) {
      this.showBanner('Choisissez un chevalier de base en main comme actif.');
      return;
    }
    if (p.type === 'promoteActive' && p.playerIndex === acting) {
      this.setMode(null);
      this.setTargeting(true);
      this.showBanner('KO : choisissez un chevalier du banc comme actif.', 'ko');
      return;
    }
    if (p.type === 'searchDeck' && p.playerIndex === acting) {
      this.showSearchModal(p, acting);
      return;
    }
    if (p.type === 'discardForAttack' && p.playerIndex === acting) {
      this.showBanner('Défaussez une carte de votre main.');
    }
    if (p.type === 'discardForTalent' && p.playerIndex === acting) {
      this.showBanner('Savoir : défaussez une carte de votre main.');
    }
    if (p.type === 'discardEnergyFromHandForTalent' && p.playerIndex === acting) {
      const label = p.sourceLabel ? `${p.sourceLabel} : ` : '';
      this.showBanner(`${label}défaussez une Énergie de votre main.`);
    }
    if (p.type === 'teleportPickSide' && p.playerIndex === acting) {
      this.showTeleportSideModal(p, acting);
      return;
    }
    if (p.type === 'moveEnergy' && p.playerIndex === acting) {
      this.setTargeting(true);
      this.showBanner('Harpe de Pandore : choisissez le chevalier destinataire.');
    }
    if (p.type === 'pickOpponentBenchActive' && p.chooserPlayerIndex === acting) {
      this.setMode(null);
      this.setTargeting(true);
      const label = p.sourceLabel ? `${p.sourceLabel} : ` : '';
      this.showBanner(
        `${label}choisissez le chevalier de banc adverse qui devient actif.`,
        'status',
      );
      return;
    }
    if (p.type === 'pickOwnBenchActive' && p.chooserPlayerIndex === acting) {
      this.setMode(null);
      this.setTargeting(true);
      const label = p.sourceLabel ? `${p.sourceLabel} : ` : '';
      this.showBanner(`${label}choisissez un chevalier de votre banc.`, 'status');
      return;
    }
    if (p.type === 'pickHealAlly' && p.playerIndex === acting) {
      this.setMode(null);
      this.setTargeting(true);
      this.showBanner(`Choisissez un chevalier allié à soigner (+${p.amount} PV).`, 'heal');
      return;
    }
    if (p.type === 'pickBenchForDeckEnergy' && p.playerIndex === acting) {
      this.setMode(null);
      this.setTargeting(true);
      const label = p.sourceLabel ? `${p.sourceLabel} : ` : '';
      this.showBanner(`${label}choisissez un chevalier de banc pour attacher l'énergie.`, 'energy');
      return;
    }
    if (p.type === 'pickBenchForEnergyRecover' && p.playerIndex === acting) {
      this.setMode(null);
      this.setTargeting(true);
      this.showBanner('Vieux Maître : choisissez un chevalier Bronze/Argent sur le banc.', 'talent');
      return;
    }
    if (p.type === 'pickKnightForDiscardEnergyAttach' && p.playerIndex === acting) {
      this.setMode(null);
      this.setTargeting(true);
      const label = p.sourceLabel ? `${p.sourceLabel} : ` : '';
      this.showBanner(
        `${label}choisissez un Guerrier Divin d'Asgard pour l'Énergie.`,
        'energy',
      );
      return;
    }
    if (p.type === 'lookTopDeck' && p.playerIndex === acting) {
      this.setMode(null);
      this.setTargeting(false);
      this.showLookTopDeckModal(p, acting);
      return;
    }
    if (p.type === 'pickRecoverFromDiscard' && p.playerIndex === acting) {
      this.setMode(null);
      this.setTargeting(false);
      this.showPickRecoverFromDiscardModal(p, acting);
      return;
    }
    if (p.type === 'pickDamageOpponentKnight' && p.playerIndex === acting) {
      this.setMode(null);
      this.setTargeting(true);
      const label = p.sourceLabel ? `${p.sourceLabel} : ` : '';
      this.showBanner(`${label}choisissez un chevalier adverse (actif ou banc).`, 'attack');
      return;
    }
    if (p.type === 'pickSilenceOpponentKnight' && p.playerIndex === acting) {
      this.setMode(null);
      this.setTargeting(true);
      this.showBanner(
        'Envoie de Fairy : choisissez un chevalier adverse dont annuler le talent.',
        'talent',
      );
      return;
    }
    if (p.type === 'sacrificeBenchForAttack' && p.playerIndex === acting) {
      this.setMode(null);
      this.setTargeting(true);
      this.showBanner('Condamnation Galactique : sacrificez un chevalier du banc.', 'attack');
      return;
    }
    if (p.type === 'charonSwapBench' && p.playerIndex === acting) {
      this.setMode(null);
      this.setTargeting(true);
      const label = p.sourceLabel || 'Charon';
      this.showBanner(`${label} : choisissez un chevalier sur le banc.`, 'talent');
      return;
    }
    if (p.type === 'transferEnergyToHades' && p.playerIndex === acting) {
      this.setMode(null);
      this.setTargeting(true);
      const msg =
        p.step === 'to'
          ? 'Pharaon : choisissez Hadès sur le banc.'
          : 'Pharaon : choisissez un chevalier source (Énergie).';
      this.showBanner(msg, 'talent');
      return;
    }
    if (p.type === 'recoverDiscard' && p.playerIndex === acting) {
      this.setMode(null);
      this.setTargeting(false);
      this.showRecoverDiscardModal(p, acting);
      return;
    }
    if (p.type === 'attachEnergyFromHand' && p.playerIndex === acting) {
      this.setMode(null);
      this.setTargeting(false);
      this.showBanner('Choisissez une Énergie de votre main à attacher.');
    }
    if (p.type === 'optionalDiscardHandDraw' && p.playerIndex === acting) {
      this.setMode(null);
      this.setTargeting(false);
      this.showOptionalDiscardHandDrawModal(p, acting);
      return;
    }
    if (p.type === 'revealOpponentHand' && p.playerIndex === acting) {
      this.setMode(null);
      this.setTargeting(false);
      this.showRevealOpponentHandModal(p, acting);
      return;
    }
    if (p.type === 'pickDisableOpponentAttack' && p.playerIndex === acting) {
      this.showDisableAttackModal(p, acting);
      return;
    }
    if (p.type === 'optionalDiscardEnergyForAttack' && p.playerIndex === acting) {
      this.showOptionalDiscardEnergyModal(p, acting);
      return;
    }
    if (p.type === 'optionalDiscardNamedCardsForAttack' && p.playerIndex === acting) {
      this.showOptionalDiscardNamedCardsModal(p, acting);
      return;
    }
    if (p.type === 'destructionOutilDiscard' && p.playerIndex === acting) {
      this.setMode(null);
      this.setTargeting(true);
      this.showDestructionOutilModal(p, acting);
      return;
    }
    if (p.type === 'cerbereBenchBonus' && p.playerIndex === acting) {
      this.setMode(null);
      this.setTargeting(true);
      this.showCerbereBenchModal(p, acting);
      return;
    }
    if (p.type === 'athenaExclamationPick' && p.playerIndex === acting) {
      this.setMode(null);
      this.setTargeting(true);
      const remaining = p.remaining ?? p.required ?? 3;
      this.showBanner(
        `Exclamation d'Athéna : choisissez ${remaining} Chevalier(s) d'Or distinct(s) (dont 1 sur le banc) — 1 Énergie chacun.`,
        'supporter',
      );
      return;
    }
    if (p.type === 'distributeDamage' && p.playerIndex === acting) {
      this.setMode(null);
      this.setTargeting(true);
      this.showDistributeDamageModal(p, acting);
      return;
    }
    if (p.type === 'transferEnergyTalent' && p.playerIndex === acting) {
      this.setTargeting(true);
      this.showBanner(
        p.step === 'to'
          ? 'Proche des dieux : chevalier destinataire.'
          : 'Proche des dieux : chevalier source (avec Énergie).',
        'talent',
      );
      return;
    }
    if (p.type === 'pickMeleeBonusAlly' && p.playerIndex === acting) {
      this.setTargeting(true);
      this.showBanner('Armes de la Balance : choisissez un chevalier (+20 corps à corps).', 'talent');
      return;
    }
    if (p.type === 'pickCopyBenchAttack' && p.playerIndex === acting) {
      this.showCopyBenchAttackModal(p, acting);
      return;
    }
    if (p.type === 'pickCopyOpponentAttack' && p.playerIndex === acting) {
      this.showCopyOpponentAttackModal(p, acting);
      return;
    }
    if (p.type === 'pickBenchSelfAttack' && p.playerIndex === acting) {
      this.showBenchSelfAttackModal(p, acting);
      return;
    }
    if (p.type === 'pickKanonSanctuary' && p.playerIndex === acting) {
      if (!p.phase) {
        this.showKanonSanctuaryModal(p, acting);
        return;
      }
      this.setMode(null);
      this.setTargeting(true);
      const msg =
        p.phase === 'attach'
          ? 'Sanctuaire Sous-Marin : choisissez un Général Marina.'
          : p.phase === 'moveFrom'
            ? 'Sanctuaire Sous-Marin : Marina source (avec Énergie).'
            : 'Sanctuaire Sous-Marin : Marina destinataire.';
      this.showBanner(msg, 'talent');
      return;
    }
    if (p.type === 'donDeVie' && p.playerIndex === acting) {
      this.setMode(null);
      if (p.phase === 'amount') {
        this.showDonDeVieAmountModal(p, acting);
        return;
      }
      this.setTargeting(true);
      const label = p.sourceLabel ? `${p.sourceLabel} : ` : '';
      const msg =
        p.phase === 'healTarget'
          ? `${label}choisissez le second chevalier (soins).`
          : `${label}choisissez le premier chevalier (dégâts).`;
      this.showBanner(msg, p.phase === 'healTarget' ? 'heal' : 'objet');
      return;
    }
    if (p.type === 'pickHuitiemeSensTransfer' && p.playerIndex === acting) {
      this.setMode(null);
      if (p.phase === 'count') {
        this.showHuitiemeSensCountModal(p, acting);
        return;
      }
      if (p.phase === 'target') {
        this.setTargeting(true);
        this.showBanner(
          `8e Sens : choisissez ${p.remaining ?? 1} destinataire(s) (1 Énergie par clic).`,
          'energy',
        );
        return;
      }
    }
    if (p.type === 'pickIoAnimal' && p.playerIndex === acting) {
      this.showIoAnimalModal(p, acting);
      return;
    }
    if (p.type === 'pickIoBigTornadoStatus' && p.playerIndex === acting) {
      this.showIoBigTornadoStatusModal(p, acting);
      return;
    }
    if (p.type === 'pickHealAllyNextTurn' && p.playerIndex === acting) {
      this.setMode(null);
      this.setTargeting(true);
      this.showBanner(
        `Nuée de Fairy : choisissez un chevalier à soigner (+${p.amount ?? 30} PV).`,
        'heal',
      );
      return;
    }
    if (p.type === 'lookTopPickOne' && p.playerIndex === acting) {
      this.showLookTopPickOneModal(p, acting);
      return;
    }
    if (p.type === 'voluntarySacrificePick' && p.playerIndex === acting) {
      this.setMode(null);
      this.setTargeting(true);
      const label = p.sourceLabel ? `${p.sourceLabel} : ` : '';
      this.showBanner(`${label}choisissez un chevalier à sacrifier.`, 'attack');
      return;
    }
    if (p.type === 'discardHandSilenceOpponentTalent' && p.playerIndex === acting) {
      this.setMode(null);
      this.setTargeting(false);
      this.showBanner('Envoie de Fairy : défaussez une carte de votre main.', 'talent');
      return;
    }
    if (p.type === 'attachEnergyFromDiscard' && p.playerIndex === acting) {
      this.showAttachEnergyFromDiscardModal(p, acting);
      return;
    }
    if (p.type === 'discardHandKnight' && p.playerIndex === acting) {
      this.setMode(null);
      this.setTargeting(false);
      this.showBanner('Défaussez un Chevalier de votre main.', 'objet');
      return;
    }
    if (p.type === 'accelerationEnergieDiscard' && p.playerIndex === acting) {
      this.setMode(null);
      this.setTargeting(true);
      this.showAccelerationDiscardModal(p, acting);
      return;
    }
    if (p.type === 'accelerationEnergieAttach' && p.playerIndex === acting) {
      this.setMode(null);
      this.setTargeting(true);
      this.showBanner('Guilty : choisissez un Chevalier Noir ou Phénix Méchant pour l\'Énergie.', 'energy');
      return;
    }
    if (p.type === 'missionGigasPlaceKnight' && p.playerIndex === acting) {
      this.setMode(null);
      this.setTargeting(false);
      this.showMissionGigasModal(p, acting);
      return;
    }
  }

  showMissionGigasModal(pending, playerIndex) {
    this.els.overlay.classList.remove('hidden');
    this.els.modal.innerHTML =
      '<h3>Mission de Gigas</h3>' +
      '<p>Placez le Chevalier d\'Argent trouvé sur votre banc pour attacher l\'Énergie trouvée (hors limite du tour).</p>' +
      '<p>Cliquez sur le Chevalier d\'Argent en main, ou terminez sans le placer.</p>' +
      '<div class="modal-actions"></div>';
    const actions = this.els.modal.querySelector('.modal-actions');
    const doneBtn = document.createElement('button');
    doneBtn.type = 'button';
    doneBtn.className = 'btn';
    doneBtn.textContent = 'Terminer';
    doneBtn.addEventListener('click', () => {
      this.engine.finishMissionGigasSkip(playerIndex);
      this.els.overlay.classList.add('hidden');
      this.render(this.engine.state);
    });
    actions.appendChild(doneBtn);
  }

  showAccelerationDiscardModal(pending, playerIndex) {
    this.els.overlay.classList.remove('hidden');
    const max = pending.maxDiscard ?? 3;
    const discarded = pending.discarded ?? 0;
    this.els.modal.innerHTML =
      '<h3>Guilty</h3>' +
      `<p>Défaussez jusqu'à ${max} Chevalier(s) Noir(s) depuis votre main ou banc (${discarded}/${max}).</p>` +
      '<p>Cliquez sur un Chevalier Noir, ou terminez sans en défausser d\'autre.</p>' +
      '<div class="modal-actions"></div>';
    const actions = this.els.modal.querySelector('.modal-actions');
    const doneBtn = document.createElement('button');
    doneBtn.type = 'button';
    doneBtn.className = 'btn';
    doneBtn.textContent = discarded === 0 ? 'Ne rien défausser' : 'Terminer';
    doneBtn.addEventListener('click', () => {
      this.engine.finishAccelerationEnergieDiscard(playerIndex);
      this.els.overlay.classList.add('hidden');
      this.render(this.engine.state);
    });
    actions.appendChild(doneBtn);
  }

  showDisableAttackModal(pending, playerIndex) {
    this.els.overlay.classList.remove('hidden');
    const label = pending.sourceLabel || 'OM';
    this.els.modal.innerHTML =
      `<h3>${label}</h3>` +
      '<p>Quelle attaque de l\'actif adverse bloquer au prochain tour ?</p>' +
      '<div class="modal-actions"></div>';
    const actions = this.els.modal.querySelector('.modal-actions');
    (pending.attackNames || []).forEach((name) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn';
      btn.textContent = name;
      btn.addEventListener('click', () => {
        this.engine.resolvePickDisableOpponentAttack(playerIndex, name);
        this.els.overlay.classList.add('hidden');
      });
      actions.appendChild(btn);
    });
  }

  showCopyBenchAttackModal(pending, playerIndex) {
    this.els.overlay.classList.remove('hidden');
    this.els.modal.innerHTML =
      '<h3>Apprends vite</h3>' +
      '<p>Quelle attaque de banc copier ce tour ?</p>' +
      '<div class="modal-actions"></div>';
    const actions = this.els.modal.querySelector('.modal-actions');
    (pending.attacks || []).forEach((atk) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn';
      btn.textContent = `${atk.name} (${atk.sourceName || ''})`;
      btn.addEventListener('click', () => {
        this.engine.resolvePickCopyBenchAttack(playerIndex, atk.name);
        this.els.overlay.classList.add('hidden');
      });
      actions.appendChild(btn);
    });
  }

  showCopyOpponentAttackModal(pending, playerIndex) {
    this.els.overlay.classList.remove('hidden');
    this.els.modal.innerHTML =
      '<h3>Illusion Trompeuse</h3>' +
      '<p>Quelle attaque adverse copier ce tour ?</p>' +
      '<div class="modal-actions"></div>';
    const actions = this.els.modal.querySelector('.modal-actions');
    (pending.attacks || []).forEach((atk) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn';
      btn.textContent = `${atk.name} (${atk.sourceName || ''})`;
      btn.addEventListener('click', () => {
        this.engine.resolvePickCopyOpponentAttack(playerIndex, atk.name);
        this.els.overlay.classList.add('hidden');
        this.render(this.engine.state);
      });
      actions.appendChild(btn);
    });
  }

  showKanonSanctuaryModal(pending, playerIndex) {
    this.els.overlay.classList.remove('hidden');
    this.els.modal.innerHTML =
      '<h3>Sanctuaire Sous-Marin</h3>' +
      '<p>Choisissez une action :</p>' +
      '<div class="modal-actions"></div>';
    const actions = this.els.modal.querySelector('.modal-actions');
    [
      { choice: 'draw', label: 'Piocher 1 carte' },
      { choice: 'attach', label: 'Attacher une Énergie (Marina)' },
      { choice: 'move', label: 'Déplacer une Énergie (Marina)' },
    ].forEach(({ choice, label }) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn';
      btn.textContent = label;
      btn.addEventListener('click', () => {
        const ok = this.engine.resolvePickKanonSanctuary(playerIndex, choice);
        if (ok && this.engine.state.pending?.type === 'pickKanonSanctuary') {
          this.els.overlay.classList.add('hidden');
          this.handlePending(this.engine.state);
        } else if (ok) {
          this.els.overlay.classList.add('hidden');
          this.render(this.engine.state);
        }
      });
      actions.appendChild(btn);
    });
  }

  showAttachEnergyFromDiscardModal(pending, playerIndex) {
    this.els.overlay.classList.remove('hidden');
    this.els.modal.innerHTML =
      '<h3>Sceptre d\'Athéna</h3>' +
      '<p>Choisissez une Énergie de votre défausse à attacher.</p>' +
      '<div class="modal-actions"></div>';
    const actions = this.els.modal.querySelector('.modal-actions');
    for (const opt of pending.options || []) {
      const def = getCardDef(opt.cardId);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn';
      btn.textContent = def?.name || opt.cardId;
      btn.addEventListener('click', () => {
        this.engine.resolveAttachEnergyFromDiscard(playerIndex, opt.instanceId);
        this.els.overlay.classList.add('hidden');
        this.render(this.engine.state);
      });
      actions.appendChild(btn);
    }
  }

  showDonDeVieAmountModal(pending, playerIndex) {
    this.els.overlay.classList.remove('hidden');
    const max = pending.maxDamage ?? 40;
    const label = pending.sourceLabel || 'Don de Vie';
    this.els.modal.innerHTML =
      `<h3>${label}</h3>` +
      `<p>Choisissez les dégâts à infliger (0–${max}). Les soins seront égaux aux dégâts infligés.</p>` +
      '<div class="modal-actions"></div>';
    const actions = this.els.modal.querySelector('.modal-actions');
    for (let n = 0; n <= max; n += 10) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn';
      btn.textContent = String(n);
      btn.addEventListener('click', () => {
        this.engine.resolveDonDeVieAmount(playerIndex, n);
        this.els.overlay.classList.add('hidden');
        this.setTargeting(false);
        this.render(this.engine.state);
      });
      actions.appendChild(btn);
    }
    if (max % 10 !== 0) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn';
      btn.textContent = String(max);
      btn.addEventListener('click', () => {
        this.engine.resolveDonDeVieAmount(playerIndex, max);
        this.els.overlay.classList.add('hidden');
        this.setTargeting(false);
        this.render(this.engine.state);
      });
      actions.appendChild(btn);
    }
  }

  showHuitiemeSensCountModal(pending, playerIndex) {
    this.els.overlay.classList.remove('hidden');
    const max = pending.maxTransfer ?? 0;
    this.els.modal.innerHTML =
      '<h3>8e Sens</h3>' +
      `<p>Combien d'Énergies transférer depuis le chevalier KO ? (0–${max})</p>` +
      '<div class="modal-actions"></div>';
    const actions = this.els.modal.querySelector('.modal-actions');
    for (let n = 0; n <= max; n++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn';
      btn.textContent = n === 0 ? 'Aucune' : String(n);
      btn.addEventListener('click', () => {
        this.engine.resolvePickHuitiemeSensCount(playerIndex, n);
        this.els.overlay.classList.add('hidden');
        const next = this.engine.state.pending;
        if (next?.type === 'pickHuitiemeSensTransfer' && next.phase === 'target') {
          this.setTargeting(true);
        }
        this.render(this.engine.state);
      });
      actions.appendChild(btn);
    }
  }

  showIoAnimalModal(pending, playerIndex) {
    this.els.overlay.classList.remove('hidden');
    this.els.modal.innerHTML =
      '<h3>Projection Animale</h3>' +
      '<p>Choisissez un animal :</p>' +
      '<div class="modal-actions"></div>';
    const actions = this.els.modal.querySelector('.modal-actions');
    (pending.animals || []).forEach((animal) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn';
      btn.textContent = animal.label || animal.id;
      btn.addEventListener('click', () => {
        this.engine.resolvePickIoAnimal(playerIndex, animal.id);
        this.els.overlay.classList.add('hidden');
        this.render(this.engine.state);
      });
      actions.appendChild(btn);
    });
  }

  showIoBigTornadoStatusModal(pending, playerIndex) {
    this.els.overlay.classList.remove('hidden');
    this.els.modal.innerHTML =
      '<h3>Big Tornado</h3>' +
      '<p>Quel statut appliquer à l\'actif adverse ?</p>' +
      '<div class="modal-actions"></div>';
    const actions = this.els.modal.querySelector('.modal-actions');
    const labels = { confused: 'Confus', poisoned: 'Empoisonné' };
    (pending.options || []).forEach((status) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn';
      btn.textContent = labels[status] || status;
      btn.addEventListener('click', () => {
        this.engine.resolvePickIoBigTornadoStatus(playerIndex, status);
        this.els.overlay.classList.add('hidden');
        this.render(this.engine.state);
      });
      actions.appendChild(btn);
    });
  }

  showLookTopPickOneModal(pending, playerIndex) {
    this.els.overlay.classList.remove('hidden');
    const label = pending.sourceLabel || 'Pandore';
    this.els.modal.innerHTML =
      `<h3>${label}</h3>` +
      '<p>Choisissez 1 carte à garder en main (le reste va en défausse) :</p>' +
      '<div class="modal-actions"></div>';
    const actions = this.els.modal.querySelector('.modal-actions');
    (pending.cards || []).forEach((card) => {
      const def = getCardDef(card.cardId);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn';
      btn.textContent = def?.name || card.cardId;
      btn.addEventListener('click', () => {
        this.engine.resolveLookTopPickOne(playerIndex, card.instanceId);
        this.els.overlay.classList.add('hidden');
        this.render(this.engine.state);
      });
      actions.appendChild(btn);
    });
  }

  showBenchSelfAttackModal(pending, playerIndex) {
    this.els.overlay.classList.remove('hidden');
    this.els.modal.innerHTML =
      '<h3>Image mentale</h3>' +
      '<p>Quelle attaque de Krest utiliser depuis le banc ?</p>' +
      '<div class="modal-actions"></div>';
    const actions = this.els.modal.querySelector('.modal-actions');
    (pending.attacks || []).forEach((atk) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn';
      btn.textContent = atk.name;
      btn.addEventListener('click', () => {
        this.engine.resolvePickBenchSelfAttack(playerIndex, atk.index);
        this.els.overlay.classList.add('hidden');
      });
      actions.appendChild(btn);
    });
  }

  showOptionalDiscardEnergyModal(pending, playerIndex) {
    const max = pending.maxDiscard || 0;
    const swapOnDiscard = pending.swapOnDiscard;
    this.els.overlay.classList.remove('hidden');
    this.els.modal.innerHTML =
      '<h3>Défausse optionnelle</h3>' +
      (swapOnDiscard
        ? '<p>Défausser 1 Énergie pour forcer l\'adversaire à échanger son actif ? (0 = non)</p>'
        : `<p>Défausser combien d'Énergies (0–${max}) ?</p>`) +
      '<div class="modal-actions"></div>';
    const actions = this.els.modal.querySelector('.modal-actions');
    for (let n = 0; n <= max; n++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn';
      btn.textContent = n === 0 ? 'Aucune' : String(n);
      btn.addEventListener('click', () => {
        this.engine.resolveOptionalDiscardEnergyForAttack(playerIndex, n);
        this.els.overlay.classList.add('hidden');
      });
      actions.appendChild(btn);
    }
  }

  showOptionalDiscardNamedCardsModal(pending, playerIndex) {
    this.els.overlay.classList.remove('hidden');
    const max = pending.maxDiscard ?? 2;
    const discarded = pending.discarded ?? 0;
    this.els.modal.innerHTML =
      '<h3>Épée de Balmung</h3>' +
      `<p>Défaussez jusqu'à ${max} Saphir d'Odin depuis votre main (${discarded}/${max}), puis validez.</p>` +
      '<div class="modal-actions"></div>';
    const actions = this.els.modal.querySelector('.modal-actions');
    const doneBtn = document.createElement('button');
    doneBtn.type = 'button';
    doneBtn.className = 'btn';
    doneBtn.textContent = 'Valider et attaquer';
    doneBtn.addEventListener('click', () => {
      this.engine.resolveOptionalDiscardNamedCardsForAttack(playerIndex);
      this.els.overlay.classList.add('hidden');
      this.render(this.engine.state);
    });
    actions.appendChild(doneBtn);
  }

  showDestructionOutilModal(pending, playerIndex) {
    this.els.overlay.classList.remove('hidden');
    const max = pending.maxCibles ?? 2;
    const discarded = pending.discarded ?? 0;
    this.els.modal.innerHTML =
      '<h3>Sceau d\'Athéna</h3>' +
      `<p>Cliquez sur un Chevalier avec un Outil attaché (${discarded}/${max}), ou terminez.</p>` +
      '<div class="modal-actions"></div>';
    const actions = this.els.modal.querySelector('.modal-actions');
    const doneBtn = document.createElement('button');
    doneBtn.type = 'button';
    doneBtn.className = 'btn';
    doneBtn.textContent = discarded === 0 ? 'Ne rien défausser' : 'Terminer';
    doneBtn.addEventListener('click', () => {
      this.engine.finishDestructionOutil(playerIndex);
      this.els.overlay.classList.add('hidden');
      this.render(this.engine.state);
    });
    actions.appendChild(doneBtn);
  }

  showCerbereBenchModal(pending, playerIndex) {
    this.els.overlay.classList.remove('hidden');
    const remaining = pending.remaining ?? 1;
    const amount = pending.amount ?? 30;
    this.els.modal.innerHTML =
      '<h3>Cerbère</h3>' +
      `<p>Choisissez jusqu'à ${remaining} chevalier(s) de banc adverse (+${amount} dégâts chacun), ou terminez.</p>` +
      '<div class="modal-actions"></div>';
    const actions = this.els.modal.querySelector('.modal-actions');
    const doneBtn = document.createElement('button');
    doneBtn.type = 'button';
    doneBtn.className = 'btn';
    doneBtn.textContent = 'Terminer';
    doneBtn.addEventListener('click', () => {
      this.engine.finishCerbereBenchBonus(playerIndex);
      this.els.overlay.classList.add('hidden');
      this.render(this.engine.state);
    });
    actions.appendChild(doneBtn);
  }

  showDistributeDamageModal(pending, playerIndex) {
    this.showPickOverlay({ boardTarget: true });
    const remaining = pending.remaining ?? pending.totalDamage ?? 0;
    const step = pending.step || 10;
    this.els.modal.innerHTML =
      '<h3>Répartition des dégâts</h3>' +
      `<p>Il reste <strong>${remaining}</strong> dégâts à placer (+${step} par clic sur un chevalier adverse).</p>` +
      '<p>Cliquez sur l\'actif ou le banc adverse, puis « Terminer » si tout est placé.</p>' +
      '<div class="modal-actions"></div>';
    const actions = this.els.modal.querySelector('.modal-actions');
    const doneBtn = document.createElement('button');
    doneBtn.type = 'button';
    doneBtn.className = 'btn';
    doneBtn.textContent = 'Terminer';
    doneBtn.disabled = remaining > 0;
    doneBtn.addEventListener('click', () => {
      if ((this.engine.state.pending?.remaining ?? 0) > 0) return;
      this.engine.finishDistributeDamage(playerIndex);
      this.resetPickOverlay();
      this.els.overlay.classList.add('hidden');
      this.render(this.engine.state);
    });
    actions.appendChild(doneBtn);
  }

  showLookTopDeckModal(pending, playerIndex) {
    this.els.overlay.classList.remove('hidden');
    const cardById = Object.fromEntries((pending.cards || []).map((c) => [c.instanceId, c]));
    const order = pending.order || [];
    let html =
      '<h3>Connais le futur</h3>' +
      '<p>Cartes du dessus de votre pioche (haut → bas). Réordonnez si besoin.</p>' +
      '<div class="look-top-deck-list"></div>' +
      '<div class="modal-actions"></div>';
    this.els.modal.innerHTML = html;
    const list = this.els.modal.querySelector('.look-top-deck-list');
    const renderRows = () => {
      list.innerHTML = '';
      order.forEach((id, index) => {
        const card = cardById[id];
        if (!card) return;
        const row = document.createElement('div');
        row.className = 'look-top-deck-row';
        const name = getCardDef(card.cardId)?.name || card.cardId;
        row.innerHTML = `<span>${index + 1}. ${name}</span>`;
        const upBtn = document.createElement('button');
        upBtn.type = 'button';
        upBtn.className = 'btn btn-small';
        upBtn.textContent = '↑';
        upBtn.disabled = index === 0;
        upBtn.addEventListener('click', () => {
          this.engine.moveLookTopDeckCard(playerIndex, index, -1);
          this.showLookTopDeckModal(this.engine.state.pending, playerIndex);
        });
        const downBtn = document.createElement('button');
        downBtn.type = 'button';
        downBtn.className = 'btn btn-small';
        downBtn.textContent = '↓';
        downBtn.disabled = index === order.length - 1;
        downBtn.addEventListener('click', () => {
          this.engine.moveLookTopDeckCard(playerIndex, index, 1);
          this.showLookTopDeckModal(this.engine.state.pending, playerIndex);
        });
        row.appendChild(upBtn);
        row.appendChild(downBtn);
        list.appendChild(row);
      });
    };
    renderRows();
    const actions = this.els.modal.querySelector('.modal-actions');
    const okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.className = 'btn';
    okBtn.textContent = 'Remettre sur la pioche';
    okBtn.addEventListener('click', () => {
      this.engine.confirmLookTopDeck(playerIndex);
      this.els.overlay.classList.add('hidden');
      this.render(this.engine.state);
    });
    actions.appendChild(okBtn);
  }

  showPickRecoverFromDiscardModal(pending, playerIndex) {
    this.els.overlay.classList.remove('hidden');
    this.els.modal.innerHTML =
      '<h3>Retour au Sanctuaire</h3>' +
      '<p>Choisissez un Outil ou Objet à récupérer de votre défausse.</p>' +
      '<div class="modal-actions"></div>';
    const actions = this.els.modal.querySelector('.modal-actions');
    for (const opt of pending.options || []) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn';
      btn.textContent = opt.name || opt.cardId;
      btn.addEventListener('click', () => {
        this.engine.resolvePickRecoverFromDiscard(playerIndex, opt.instanceId);
        this.els.overlay.classList.add('hidden');
        this.render(this.engine.state);
      });
      actions.appendChild(btn);
    }
  }

  showTeleportSideModal(pending, playerIndex) {
    this.els.overlay.classList.remove('hidden');
    this.els.modal.innerHTML =
      '<h3>Téléportation</h3>' +
      '<p>Échangez votre actif ou celui de l\'adversaire ?</p>' +
      '<div class="modal-actions"></div>';
    const actions = this.els.modal.querySelector('.modal-actions');
    const ownBtn = document.createElement('button');
    ownBtn.type = 'button';
    ownBtn.className = 'btn';
    ownBtn.textContent = 'Mon banc';
    ownBtn.addEventListener('click', () => {
      this.els.overlay.classList.add('hidden');
      this.engine.pickTeleportSide(playerIndex, 'own');
      this.render(this.engine.state);
    });
    const oppBtn = document.createElement('button');
    oppBtn.type = 'button';
    oppBtn.className = 'btn';
    oppBtn.textContent = 'Banc adverse';
    oppBtn.addEventListener('click', () => {
      this.els.overlay.classList.add('hidden');
      this.engine.pickTeleportSide(playerIndex, 'opponent');
      this.render(this.engine.state);
    });
    actions.appendChild(ownBtn);
    actions.appendChild(oppBtn);
  }

  showOptionalDiscardHandDrawModal(pending, playerIndex) {
    const draw = pending.draw || 6;
    const label = pending.sourceLabel || 'Analyse de la situation';
    this.els.overlay.classList.remove('hidden');
    this.els.modal.innerHTML =
      `<h3>${label}</h3>` +
      `<p>Défausser toute votre main et piocher ${draw} cartes ?</p>` +
      '<div class="modal-actions"></div>';
    const actions = this.els.modal.querySelector('.modal-actions');
    const yesBtn = document.createElement('button');
    yesBtn.type = 'button';
    yesBtn.className = 'btn';
    yesBtn.textContent = 'Oui, défausser';
    yesBtn.addEventListener('click', () => {
      this.engine.resolveOptionalDiscardHandDraw(playerIndex, true);
      this.els.overlay.classList.add('hidden');
    });
    const noBtn = document.createElement('button');
    noBtn.type = 'button';
    noBtn.className = 'btn btn-cancel';
    noBtn.textContent = 'Non';
    noBtn.addEventListener('click', () => {
      this.engine.resolveOptionalDiscardHandDraw(playerIndex, false);
      this.els.overlay.classList.add('hidden');
    });
    actions.appendChild(yesBtn);
    actions.appendChild(noBtn);
  }

  showRevealOpponentHandModal(pending, playerIndex) {
    this.els.overlay.classList.remove('hidden');
    const label = pending.sourceLabel ? `${pending.sourceLabel} : ` : '';
    this.els.modal.innerHTML =
      `<h3>${label}main adverse</h3>` +
      '<p>Choisissez une carte à mélanger dans le deck adverse :</p>' +
      '<div class="modal-cards"></div>';
    const container = this.els.modal.querySelector('.modal-cards');
    (pending.options || []).forEach((opt) => {
      const def = getCardDef(opt.cardId);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn';
      btn.textContent = def?.name || opt.cardId;
      btn.addEventListener('click', () => {
        this.engine.resolveRevealOpponentHandShuffle(playerIndex, opt.instanceId);
        this.els.overlay.classList.add('hidden');
      });
      container.appendChild(btn);
    });
  }

  showRecoverDiscardModal(pending, playerIndex) {
    const options = pending?.options || [];
    const hasObjet = options.some((o) => getCardDef(o.cardId)?.cardType === 'objet');
    const title = hasObjet ? 'Récupération depuis la défausse' : 'Gardien';
    const hint = hasObjet
      ? 'Choisissez un Objet à récupérer en main.'
      : 'Choisissez un chevalier en défausse.';
    this.els.overlay.classList.remove('hidden');
    this.els.modal.innerHTML =
      `<h3>${title}</h3><p>${hint}</p><div class="modal-cards"></div><div class="modal-actions"></div>`;
    const container = this.els.modal.querySelector('.modal-cards');
    options.forEach((opt) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn';
      btn.textContent = getCardDef(opt.cardId).name;
      btn.addEventListener('click', () => {
        this.engine.resolveRecoverDiscard(playerIndex, opt.instanceId);
        if (!this.engine.state.pending) {
          this.els.overlay.classList.add('hidden');
        }
        this.render(this.engine.state);
      });
      container.appendChild(btn);
    });
    const actions = this.els.modal.querySelector('.modal-actions');
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn btn-cancel';
    cancelBtn.textContent = 'Annuler';
    cancelBtn.addEventListener('click', () => {
      if (this.engine.cancelPending(playerIndex)) {
        this.els.overlay.classList.add('hidden');
        this.setTargeting(false);
        this.render(this.engine.state);
      }
    });
    actions.appendChild(cancelBtn);
  }

  showSearchModal(pending, playerIndex = this.getActingPlayer()) {
    const options = pending?.options || [];
    const progress = pending?.progress || null;
    const progressLabel =
      progress && progress.total > 1
        ? `<p>Sélection ${progress.current} / ${progress.total}</p>`
        : '<p>Choisissez une carte :</p>';
    this.els.overlay.classList.remove('hidden');
    this.els.modal.innerHTML =
      `<h3>Recherche dans le deck</h3>${progressLabel}<div class="modal-cards"></div><div class="modal-actions"></div>`;
    const container = this.els.modal.querySelector('.modal-cards');
    options.forEach((opt) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn';
      btn.textContent = getCardDef(opt.cardId).name;
      btn.addEventListener('click', () => {
        this.engine.resolveSearchDeck(playerIndex, opt.instanceId);
        if (this.engine.state.pending?.type !== 'searchDeck') {
          this.els.overlay.classList.add('hidden');
        }
      });
      container.appendChild(btn);
    });
    const actions = this.els.modal.querySelector('.modal-actions');
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn btn-cancel';
    cancelBtn.textContent = 'Annuler';
    cancelBtn.addEventListener('click', () => {
      if (this.engine.cancelPending(playerIndex)) {
        this.els.overlay.classList.add('hidden');
        this.setTargeting(false);
      }
    });
    actions.appendChild(cancelBtn);
  }
}

/** Sync art after innerHTML — cached images may not fire onload. */
export function syncCardImage(cardEl) {
  const img = cardEl.querySelector('.card-art img');
  if (!img) return;
  if (!img.getAttribute('src')) {
    img.classList.add('missing');
    return;
  }
  if (img.complete) {
    if (img.naturalWidth > 0) {
      img.classList.add('loaded');
      img.classList.remove('missing');
    } else {
      img.classList.add('missing');
      img.classList.remove('loaded');
    }
  }
}

function isChevalierCard(def) {
  return def?.cardType === 'chevalier';
}
function isChevalierNoirCard(cardId) {
  return getCardDef(cardId)?.rawType === 'chevalier-noir';
}
function isEnergieCard(def) {
  return def?.cardType === 'energie';
}
