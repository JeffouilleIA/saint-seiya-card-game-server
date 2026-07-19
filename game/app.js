import { loadCards } from './cards.js';
import { loadAttackFx } from './attackFx.js';
import { gameAudio } from './audio.js';
import { GameEngine } from './engine.js';
import { GameUI } from './ui.js';
import { GameMenu } from './menu.js';
import { getDeckById, deckEntryToCardList, initDeckStorage } from './decks.js';
import { createMatchStatsTracker, recordDeckMatchFromGame } from './deck-stats.js';
import { getHouseDeckDisplayName, prepareTwelveHousesRun } from './twelve-houses.js';
import {
  bothPlayersHaveUnusedDecks,
  beginSecretPickPhase,
  clearActiveCombat1000Run,
  getActiveCombat1000Run,
  getMatchDeckNames,
  recordCombat1000RoundResult,
  saveCombat1000ToHistory,
  setActiveCombat1000Run,
} from './combat-1000-jours.js';
import { applyRemoteGameAction } from './online-actions.js';

const root = document.getElementById('app');

function showError(message) {
  const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
  const link = origin
    ? `<a href="${origin}">${origin}</a>`
    : 'l’URL affichée dans la barre d’adresse';
  root.innerHTML = `<div class="boot-error"><h2>Erreur de chargement</h2><p>${message}</p><p>Servez le jeu avec <code>node server.js</code> puis ouvrez ${link}</p></div>`;
}

function mountShell() {
  root.innerHTML = `
    <div id="menu-host"></div>
    <div id="game-host" hidden></div>
  `;
  const menuHost = root.querySelector('#menu-host');
  const gameHost = root.querySelector('#game-host');
  menuHost.removeAttribute('hidden');
  gameHost.setAttribute('hidden', '');
  return { menuHost, gameHost };
}

/** Hôtes DOM actuels (évite les références périmées après tearDownMatch). */
function getShellHosts() {
  const menuHost = document.getElementById('menu-host');
  const gameHost = document.getElementById('game-host');
  if (!menuHost || !gameHost) return null;
  return { menuHost, gameHost };
}

function showGameShell() {
  const hosts = getShellHosts();
  if (!hosts) return null;
  hosts.menuHost.setAttribute('hidden', '');
  hosts.menuHost.innerHTML = '';
  hosts.gameHost.removeAttribute('hidden');
  return hosts;
}

function showMenuShell() {
  const hosts = getShellHosts();
  if (!hosts) return null;
  hosts.gameHost.setAttribute('hidden', '');
  hosts.menuHost.removeAttribute('hidden');
  return hosts;
}

/** @type {{ engine?: GameEngine, ui?: GameUI, lastMatch?: { playerDeckId: string, opponentDeckId: string, gameMode?: string, aiDifficulty?: string } } | null} */
let activeMatch = null;

/**
 * @type {{
 *   playerDeckId: string,
 *   houses: Array<{ id: string, name: string, houseNumber: number }>,
 *   houseIndex: number,
 *   wins: number,
 *   totalHouses: number,
 *   aiDifficulty: string,
 *   title: string,
 * } | null}
 */
let twelveHousesRun = null;

/** @type {import('./combat-1000-jours.js').Combat1000Run | null} */
let combat1000Run = null;

function tearDownMatch() {
  if (activeMatch?.engine) {
    clearTimeout(activeMatch.engine._aiResumeTimer);
  }
  activeMatch = null;
  window.chevalierGame = { audio: gameAudio };
  return mountShell();
}

function resolveDeckLists(playerDeckId, opponentDeckId) {
  const playerDeck = getDeckById(playerDeckId);
  const opponentDeck = getDeckById(opponentDeckId);
  return {
    playerDeckId,
    opponentDeckId,
    deckLists: [deckEntryToCardList(playerDeck), deckEntryToCardList(opponentDeck)],
  };
}

function startMatch(menuHost, gameHost, playerDeckId, opponentDeckId, gameMode = 'ai', aiDifficulty = 'moyen') {
  const resolved = resolveDeckLists(playerDeckId, opponentDeckId);
  const mode = gameMode === 'local2p' ? 'local2p' : 'ai';
  const difficulty = mode === 'ai' ? GameEngine.normalizeAiDifficulty(aiDifficulty) : 'moyen';
  menuHost.setAttribute('hidden', '');
  gameHost.removeAttribute('hidden');
  gameHost.innerHTML = '';

  const engine = new GameEngine({ gameMode: mode, aiDifficulty: difficulty });

  function attachMatchStatsTracker() {
    engine.matchStats = createMatchStatsTracker({
      gameMode: mode,
      deckIds: [playerDeckId, opponentDeckId],
      aiDifficulty: difficulty,
    });
  }
  attachMatchStatsTracker();

  function flushMatchStats(winner) {
    const snapshots = engine.matchStats?.finalize(engine.state.turnCount || 0) || [];
    const playerDeck = getDeckById(playerDeckId);
    const opponentDeck = getDeckById(opponentDeckId);
    const playerName = playerDeck?.name || 'Joueur';
    const opponentName = opponentDeck?.name || 'Adversaire';

    if (mode === 'ai') {
      recordDeckMatchFromGame({
        deckId: playerDeckId,
        deckName: playerName,
        outcome: winner === 0 ? 'win' : 'loss',
        match: snapshots[0],
        opponentDeckId,
        opponentDeckName: opponentName,
        gameMode: mode,
        aiDifficulty: difficulty,
      });
    } else if (mode === 'local2p') {
      recordDeckMatchFromGame({
        deckId: playerDeckId,
        deckName: playerName,
        outcome: winner === 0 ? 'win' : 'loss',
        match: snapshots[0],
        opponentDeckId,
        opponentDeckName: opponentName,
        gameMode: mode,
      });
      recordDeckMatchFromGame({
        deckId: opponentDeckId,
        deckName: opponentName,
        outcome: winner === 1 ? 'win' : 'loss',
        match: snapshots[1],
        opponentDeckId: playerDeckId,
        opponentDeckName: playerName,
        gameMode: mode,
      });
    }
  }

  const ui = new GameUI(gameHost, engine, gameAudio, {
    gameMode: mode,
    onMatchEnd: ({ winner }) => {
      flushMatchStats(winner);
    },
    onReplay: () => {
      ui.hideEndGameOverlay();
      engine.reset({ deckLists: resolved.deckLists, gameMode: mode, aiDifficulty: difficulty });
      attachMatchStatsTracker();
      engine.startGame();
    },
    onMainMenu: () => {
      ui.hideEndGameOverlay();
      const shells = tearDownMatch();
      initMenu(shells.menuHost, shells.gameHost);
    },
  });

  engine.reset({ deckLists: resolved.deckLists, gameMode: mode, aiDifficulty: difficulty });
  engine.startGame();

  activeMatch = {
    engine,
    ui,
    lastMatch: {
      playerDeckId,
      opponentDeckId,
      gameMode: mode,
      aiDifficulty: difficulty,
    },
  };

  window.chevalierGame = {
    engine,
    ui,
    audio: gameAudio,
    lastMatch: activeMatch.lastMatch,
    mode: 'match',
    /** Dev: preview signature attack FX (start a match first). */
    testAttackFx(which = 'seiya') {
      if (!ui) {
        console.warn('testAttackFx: start a match first');
        return;
      }
      const payloads = {
        seiya: {
          attackName: 'M t ores de P gase',
          attackerCardId: 'seiya-de-pegase',
          damage: 40,
          label: '2',
        },
        shiryu: {
          attackName: 'Col re du dragon',
          attackerCardId: 'shiryu-du-dragon',
          damage: 60,
          label: '2',
        },
        docrates: {
          attackName: "Météores d'Hercule",
          attackerCardId: 'bronze_docrates',
          damage: 60,
          label: '4',
        },
        pegaseNoir: {
          attackName: 'M t ores noirs',
          attackerCardId: 'pegase-noir',
          damage: 30,
          label: '2',
        },
        aioros: {
          attackName: 'Foudre atomique',
          attackerCardId: 'aioros_sagittaire',
          damage: 60,
          label: '2',
        },
        marine: {
          attackName: "Météores de l'Aigle",
          attackerCardId: 'marine-aigle',
          damage: 30,
          label: '2',
        },
        aldebaran: {
          attackName: 'Corne du Taureau',
          attackerCardId: 'aldebaran_taureau',
          damage: 60,
          label: '2',
        },
        shina: {
          attackName: 'Les griffes du tonnerre',
          attackerCardId: 'shina-du-cobra',
          damage: 40,
          label: '2',
        },
        ichi: {
          attackName: 'Combo griffes',
          attackerCardId: 'bronze_ichi',
          damage: 40,
          label: '3',
        },
        ikki: {
          attackName: "Battement d'ailes",
          attackerCardId: 'ikki-du-phenix',
          damage: 80,
          label: '3',
        },
        mu: {
          attackName: 'Spirale Stellaire',
          attackerCardId: 'mu_belier',
          damage: 90,
          label: '3',
        },
        kagaho: {
          attackName: 'Ankh Sacrificielle',
          attackerCardId: 'kagaho_benou',
          damage: 120,
          label: '4',
        },
        misty: {
          attackName: 'Tourbillon du Lézard',
          attackerCardId: 'misty-du-lezard',
          damage: 60,
          label: '3',
        },
        androNoir: {
          attackName: 'Cha ne serpents',
          attackerCardId: 'andromede-noir',
          damage: 30,
          label: '3',
        },
        shakka: {
          attackName: 'Trésors du Ciel',
          attackerCardId: 'shaka-de-la-vierge',
          damage: 160,
          label: '4',
        },
        saga: {
          attackName: 'Explosion Galactique',
          attackerCardId: 'saga-des-gemeaux',
          damage: 120,
          label: '4',
        },
        shura: {
          attackName: 'Excalibur',
          attackerCardId: 'shura-du-capricorne',
          damage: 70,
          label: '3',
          headsCount: 2,
        },
        poseidon: {
          attackName: 'Trident Royal',
          attackerCardId: 'poseidon-dieu-oceans',
          damage: 110,
          previewDamage: 110,
          attackLethal: true,
          label: '2',
        },
        poseidonCourt: {
          attackName: 'Trident Royal',
          attackerCardId: 'poseidon-dieu-oceans',
          damage: 110,
          previewDamage: 110,
          attackLethal: false,
          label: '2',
        },
      };
      const p = payloads[which] || payloads.seiya;
      const deferFx =
        which === 'seiya' ||
        which === 'pegaseNoir' ||
        which === 'aioros' ||
        which === 'marine' ||
        which === 'docrates' ||
        which === 'shiryu' ||
        which === 'aldebaran' ||
        which === 'shina' ||
        which === 'ichi' ||
        which === 'ikki' ||
        which === 'mu' ||
        which === 'kagaho' ||
        which === 'misty' ||
        which === 'androNoir' ||
        which === 'shakka' ||
        which === 'saga' ||
        which === 'shura' ||
        which === 'poseidon' ||
        which === 'poseidonCourt';
      ui.playAttackSequence({
        ...p,
        description: 'Test FX',
        playerIndex: 0,
        headsCount: 0,
        coin: null,
        deferDamage: deferFx,
        resultSummary: deferFx ? '' : 'Actif : -60 PV',
      });
      console.info(`testAttackFx("${which}") — ${p.attackName}`);
    },
  };
}

function finishTwelveHousesRun(_menuHost, _gameHost, { wonAll, abandoned = false } = {}) {
  const run = twelveHousesRun;
  twelveHousesRun = null;
  const { menuHost, gameHost } = tearDownMatch();
  showMenuShell();
  const menu = initMenu(menuHost, gameHost, { showMain: false });
  if (run) {
    menu.showTwelveHousesEnd({
      wins: run.wins,
      totalHouses: run.totalHouses,
      wonAll: !!wonAll && !abandoned,
      abandoned: !!abandoned,
      playerDeckId: run.playerDeckId,
      difficulty: run.modeDifficulty,
    });
  } else {
    menu.showMain();
  }
}

function showTwelveHousesLadderInterstitial(_menuHost, _gameHost, { wins, currentIndex, onContinue }) {
  const run = twelveHousesRun;
  if (!run) return;

  const match = activeMatch;
  match?.ui?.hideEndGameOverlay();

  const hosts = showMenuShell();
  if (!hosts) return;

  let menu = window.chevalierMenu;
  if (!menu || menu.host !== hosts.menuHost) {
    menu = initMenu(hosts.menuHost, hosts.gameHost, { showMain: false });
  }

  menu.showTwelveHousesLadderProgress({
    houses: run.houses,
    wins,
    currentIndex,
    totalHouses: run.totalHouses,
    modeDifficulty: run.modeDifficulty,
    onContinue: () => {
      if (!showGameShell()) return;
      onContinue();
    },
  });
}

function advanceTwelveHousesAfterWin(menuHost, gameHost) {
  const run = twelveHousesRun;
  if (!run) return;
  const nextIndex = run.houseIndex + 1;
  if (nextIndex >= run.houses.length) {
    finishTwelveHousesRun(menuHost, gameHost, { wonAll: true });
    return;
  }

  showTwelveHousesLadderInterstitial(menuHost, gameHost, {
    wins: run.wins,
    currentIndex: nextIndex,
    onContinue: () => {
      run.houseIndex = nextIndex;
      startTwelveHousesNextMatch(menuHost, gameHost);
    },
  });
}

function startTwelveHousesNextMatch(menuHost, gameHost) {
  const run = twelveHousesRun;
  if (!run) return;
  const match = activeMatch;
  if (!match?.engine || !match?.ui) {
    console.error('Les 12 maisons : partie active introuvable pour la maison suivante.');
    return;
  }
  const opponent = run.houses[run.houseIndex];
  if (!opponent) {
    finishTwelveHousesRun(menuHost, gameHost, { wonAll: true });
    return;
  }
  const resolved = resolveDeckLists(run.playerDeckId, opponent.id);
  const difficulty = GameEngine.normalizeAiDifficulty(run.aiDifficulty);
  const opponentDeckName = getHouseDeckDisplayName(opponent);

  if (!showGameShell()) return;

  match.ui.hideEndGameOverlay();
  match.ui.setHousesProgress({
    progress: `Maison ${opponent.houseNumber} / ${run.totalHouses}`,
    opponentName: opponentDeckName,
  });
  match.engine.reset({
    deckLists: resolved.deckLists,
    gameMode: 'ai',
    aiDifficulty: difficulty,
  });
  match.engine.matchStats = createMatchStatsTracker({
    gameMode: 'ai',
    deckIds: [run.playerDeckId, opponent.id],
    aiDifficulty: difficulty,
  });
  match.lastMatch = {
    playerDeckId: run.playerDeckId,
    opponentDeckId: opponent.id,
    gameMode: 'ai',
    aiDifficulty: difficulty,
  };
  match.engine.startGame();
}

function startTwelveHousesMatch(menuHost, gameHost) {
  const run = twelveHousesRun;
  if (!run) return;
  const opponent = run.houses[run.houseIndex];
  if (!opponent) {
    finishTwelveHousesRun(menuHost, gameHost, { wonAll: true });
    return;
  }

  const resolved = resolveDeckLists(run.playerDeckId, opponent.id);
  const mode = 'ai';
  const difficulty = GameEngine.normalizeAiDifficulty(run.aiDifficulty);
  const opponentDeckName = getHouseDeckDisplayName(opponent);

  const hosts = showGameShell();
  if (!hosts) return;
  menuHost = hosts.menuHost;
  gameHost = hosts.gameHost;
  gameHost.innerHTML = '';

  const engine = new GameEngine({ gameMode: mode, aiDifficulty: difficulty });

  function attachMatchStatsTracker() {
    engine.matchStats = createMatchStatsTracker({
      gameMode: mode,
      deckIds: [run.playerDeckId, opponent.id],
      aiDifficulty: difficulty,
    });
  }
  attachMatchStatsTracker();

  function flushMatchStats(winner) {
    const snapshots = engine.matchStats?.finalize(engine.state.turnCount || 0) || [];
    const playerDeck = getDeckById(run.playerDeckId);
    const opponentDeck = getDeckById(opponent.id);
    recordDeckMatchFromGame({
      deckId: run.playerDeckId,
      deckName: playerDeck?.name || 'Joueur',
      outcome: winner === 0 ? 'win' : 'loss',
      match: snapshots[0],
      opponentDeckId: opponent.id,
      opponentDeckName: opponentDeck?.name || opponent.name,
      gameMode: mode,
      aiDifficulty: difficulty,
    });
  }

  const ui = new GameUI(gameHost, engine, gameAudio, {
    gameMode: 'twelve-houses',
    housesProgress: {
      progress: `Maison ${opponent.houseNumber} / ${run.totalHouses}`,
      opponentName: opponentDeckName,
    },
    formatEndGame: (state) => {
      const humanWon = state.winner === 0;
      const nextIdx = run.houseIndex + 1;
      const hasNext = humanWon && nextIdx < run.houses.length;
      const wonAll = humanWon && nextIdx >= run.houses.length;
      if (!humanWon) {
        return {
          title: 'Défaite',
          desc: `Vous avez vaincu ${run.wins} maison${run.wins !== 1 ? 's' : ''} sur ${run.totalHouses}. La run s'arrête ici.`,
          hideReplay: true,
          menuLabel: 'Enregistrer le score',
        };
      }
      if (wonAll) {
        return {
          title: 'Les 12 maisons conquises !',
          desc: `Victoire finale contre ${opponentDeckName}. Score : ${run.wins} / ${run.totalHouses}.`,
          hideReplay: true,
          menuLabel: 'Enregistrer le score',
        };
      }
      return {
        title: 'Maison vaincue !',
        desc: `${opponentDeckName} est tombé. Prochaine épreuve : ${getHouseDeckDisplayName(run.houses[nextIdx]) || '…'}.`,
        replayLabel: 'Maison suivante',
        menuLabel: 'Abandonner la run',
      };
    },
    onMatchEnd: ({ winner }) => {
      flushMatchStats(winner);
      if (winner === 0) run.wins += 1;
    },
    onReplay: () => {
      advanceTwelveHousesAfterWin(menuHost, gameHost);
    },
    onMainMenu: () => {
      const state = activeMatch?.engine?.state;
      const justWon = state?.winner === 0;
      const hasNext = run.houseIndex + 1 < run.houses.length;
      const isAbandon = justWon && hasNext;
      if (isAbandon) {
        const ok = window.confirm(
          'Abandonner la run des 12 maisons ? Vous passerez à l’enregistrement du score.',
        );
        if (!ok) return;
      }
      finishTwelveHousesRun(menuHost, gameHost, {
        wonAll: !isAbandon && run.wins >= run.totalHouses,
        abandoned: isAbandon,
      });
    },
  });

  engine.reset({ deckLists: resolved.deckLists, gameMode: mode, aiDifficulty: difficulty });
  engine.startGame();

  activeMatch = {
    engine,
    ui,
    lastMatch: {
      playerDeckId: run.playerDeckId,
      opponentDeckId: opponent.id,
      gameMode: mode,
      aiDifficulty: difficulty,
    },
  };

  window.chevalierGame = {
    engine,
    ui,
    audio: gameAudio,
    lastMatch: activeMatch.lastMatch,
    mode: 'twelve-houses',
  };
}

function finishCombat1000Run({ abandoned = false } = {}) {
  const run = combat1000Run;
  combat1000Run = null;
  clearActiveCombat1000Run();
  const { menuHost, gameHost } = tearDownMatch();
  showMenuShell();
  const menu = initMenu(menuHost, gameHost, { showMain: false });
  if (run && run.roundNumber > 0) {
    saveCombat1000ToHistory(run);
  }
  if (run) {
    menu.showCombat1000End(run, { abandoned: !!abandoned });
  } else {
    menu.showMain();
  }
}

function showCombat1000MenuPhase(renderFn) {
  const match = activeMatch;
  match?.ui?.hideEndGameOverlay();

  const hosts = showMenuShell();
  if (!hosts) return;

  let menu = window.chevalierMenu;
  if (!menu || menu.host !== hosts.menuHost) {
    menu = initMenu(hosts.menuHost, hosts.gameHost, { showMain: false });
  }
  renderFn(menu);
}

function advanceCombat1000AfterRound(menuHost, gameHost) {
  const run = combat1000Run;
  if (!run) return;

  if (bothPlayersHaveUnusedDecks(run)) {
    beginSecretPickPhase(run);
    showCombat1000MenuPhase((menu) => menu.showCombat1000SecretPick());
    return;
  }
  finishCombat1000Run();
}

function startCombat1000Match(menuHost, gameHost) {
  const run = combat1000Run;
  if (!run?.matchPlayer1DeckId || !run?.matchPlayer2DeckId) {
    console.error('Combat des 1000 Jours : decks de manche introuvables.');
    return;
  }

  const playerDeckId = run.matchPlayer1DeckId;
  const opponentDeckId = run.matchPlayer2DeckId;
  const resolved = resolveDeckLists(playerDeckId, opponentDeckId);
  const mode = 'local2p';
  const { player1DeckName, player2DeckName } = getMatchDeckNames(run);
  const roundLabel = `Manche ${run.roundNumber + 1}`;

  const hosts = showGameShell();
  if (!hosts) return;
  menuHost = hosts.menuHost;
  gameHost = hosts.gameHost;
  gameHost.innerHTML = '';

  const engine = new GameEngine({ gameMode: mode, aiDifficulty: 'moyen' });

  function attachMatchStatsTracker() {
    engine.matchStats = createMatchStatsTracker({
      gameMode: mode,
      deckIds: [playerDeckId, opponentDeckId],
    });
  }
  attachMatchStatsTracker();

  function flushMatchStats(winner) {
    const snapshots = engine.matchStats?.finalize(engine.state.turnCount || 0) || [];
    const playerDeck = getDeckById(playerDeckId);
    const opponentDeck = getDeckById(opponentDeckId);
    recordDeckMatchFromGame({
      deckId: playerDeckId,
      deckName: playerDeck?.name || player1DeckName,
      outcome: winner === 0 ? 'win' : 'loss',
      match: snapshots[0],
      opponentDeckId,
      opponentDeckName: opponentDeck?.name || player2DeckName,
      gameMode: mode,
    });
    recordDeckMatchFromGame({
      deckId: opponentDeckId,
      deckName: opponentDeck?.name || player2DeckName,
      outcome: winner === 1 ? 'win' : 'loss',
      match: snapshots[1],
      opponentDeckId: playerDeckId,
      opponentDeckName: playerDeck?.name || player1DeckName,
      gameMode: mode,
    });
  }

  const ui = new GameUI(gameHost, engine, gameAudio, {
    gameMode: 'combat-1000-jours',
    housesProgress: {
      progress: roundLabel,
      opponentName: `${run.player2Name} · ${player2DeckName}`,
    },
    formatEndGame: (state) => {
      const winnerName = state.winner === 0 ? run.player1Name : run.player2Name;
      const hasNext = bothPlayersHaveUnusedDecks(run);
      const scoreLine = `${run.player1Name} ${run.player1Wins} — ${run.player2Wins} ${run.player2Name}`;
      return {
        title: `Manche remportée par ${winnerName}`,
        desc: `${player1DeckName} vs ${player2DeckName}. Score : ${scoreLine}.${hasNext ? ' Préparez la manche suivante (sélection secrète des decks).' : ''}`,
        hideReplay: !hasNext,
        replayLabel: 'Manche suivante',
        menuLabel: hasNext ? 'Abandonner le combat' : 'Voir les résultats',
      };
    },
    onMatchEnd: ({ winner }) => {
      flushMatchStats(winner);
      recordCombat1000RoundResult(run, winner);
    },
    onReplay: () => {
      advanceCombat1000AfterRound(menuHost, gameHost);
    },
    onMainMenu: () => {
      const hasNext = bothPlayersHaveUnusedDecks(run);
      if (hasNext) {
        const ok = window.confirm(
          'Abandonner le Combat des 1000 Jours ? Les manches déjà jouées seront conservées dans le score final.',
        );
        if (!ok) return;
        finishCombat1000Run({ abandoned: true });
        return;
      }
      finishCombat1000Run();
    },
  });

  engine.reset({ deckLists: resolved.deckLists, gameMode: mode, aiDifficulty: 'moyen' });
  engine.startGame();

  activeMatch = {
    engine,
    ui,
    lastMatch: {
      playerDeckId,
      opponentDeckId,
      gameMode: mode,
    },
  };

  window.chevalierGame = {
    engine,
    ui,
    audio: gameAudio,
    lastMatch: activeMatch.lastMatch,
    mode: 'combat-1000-jours',
  };
}

function startCombat1000FromVsScreen(menuHost, gameHost) {
  const run = combat1000Run;
  if (!run?.matchPlayer1DeckId || !run?.matchPlayer2DeckId) return;
  startCombat1000Match(menuHost, gameHost);
}

function initCombat1000Run(run) {
  combat1000Run = run;
  setActiveCombat1000Run(run);
}

async function startTwelveHousesRun(_menuHost, _gameHost, { playerDeckId, difficulty = 'normal', prepared = null } = {}) {
  const hosts = getShellHosts();
  if (!hosts) {
    window.alert('Interface du jeu introuvable. Rechargez la page.');
    return;
  }
  try {
    const preparedRun =
      prepared ||
      (await prepareTwelveHousesRun(difficulty));
    if (!preparedRun.houses.length) {
      window.alert('Aucun deck maison disponible. Vérifiez data/twelve-houses.json.');
      return;
    }
    twelveHousesRun = {
      playerDeckId,
      houses: preparedRun.houses,
      houseIndex: 0,
      wins: 0,
      totalHouses: preparedRun.totalHouses,
      aiDifficulty: preparedRun.aiDifficulty,
      modeDifficulty: preparedRun.modeDifficulty,
      title: preparedRun.title,
    };
    startTwelveHousesMatch(hosts.menuHost, hosts.gameHost);
  } catch (err) {
    console.error(err);
    window.alert(err.message || 'Impossible de charger le mode Les 12 maisons.');
  }
}

function startAttackTest(menuHost, gameHost, knightCardId) {
  menuHost.setAttribute('hidden', '');
  gameHost.removeAttribute('hidden');
  gameHost.innerHTML = '';

  const engine = new GameEngine({ gameMode: 'attack-test' });
  try {
    engine.initAttackTest(knightCardId);
  } catch (err) {
    console.error(err);
    const shells = tearDownMatch();
    const menu = initMenu(shells.menuHost, shells.gameHost);
    menu.showTestKnightPicker();
    shells.menuHost.querySelector('.menu-test-pick')?.insertAdjacentHTML(
      'afterbegin',
      `<p class="menu-msg error">${err.message || String(err)}</p>`,
    );
    return;
  }

  const ui = new GameUI(gameHost, engine, gameAudio, {
    gameMode: 'attack-test',
    onMainMenu: () => {
      const shells = tearDownMatch();
      initMenu(shells.menuHost, shells.gameHost);
    },
    onAttackTestBackKnights: () => {
      const shells = tearDownMatch();
      const menu = initMenu(shells.menuHost, shells.gameHost);
      menu.showTestKnightPicker();
    },
  });

  activeMatch = { engine, ui, lastMatch: null, mode: 'attack-test', knightCardId };

  window.chevalierGame = {
    engine,
    ui,
    audio: gameAudio,
    mode: 'attack-test',
    knightCardId,
    startAttackTest: (id) => startAttackTest(menuHost, gameHost, id),
  };
}

function resolveOnlineDeckLists(startPayload) {
  const deck0 = startPayload.decks.find((d) => d.seat === 0);
  const deck1 = startPayload.decks.find((d) => d.seat === 1);
  const entry0 = getDeckById(deck0?.deckId);
  const entry1 = getDeckById(deck1?.deckId);
  return {
    deckIds: [deck0?.deckId, deck1?.deckId],
    deckLists: [deckEntryToCardList(entry0), deckEntryToCardList(entry1)],
    names: [deck0?.name || entry0?.name || 'Joueur 1', deck1?.name || entry1?.name || 'Joueur 2'],
  };
}

function startOnlineMatch(menuHost, gameHost, { seat, start, client }) {
  const resolved = resolveOnlineDeckLists(start);
  const mode = 'online2p';
  const isHost = seat === 0;
  const myDeckId = resolved.deckIds[seat];
  const oppDeckId = resolved.deckIds[1 - seat];

  const hosts = showGameShell();
  if (!hosts) return;
  menuHost = hosts.menuHost;
  gameHost = hosts.gameHost;
  gameHost.innerHTML = '';

  const engine = new GameEngine({ gameMode: mode, aiDifficulty: 'moyen' });
  engine.onlineRole = isHost ? 'host' : 'guest';

  function attachMatchStatsTracker() {
    engine.matchStats = createMatchStatsTracker({
      gameMode: 'local2p',
      deckIds: [resolved.deckIds[0], resolved.deckIds[1]],
    });
  }
  attachMatchStatsTracker();

  function flushMatchStats(winner) {
    const snapshots = engine.matchStats?.finalize(engine.state.turnCount || 0) || [];
    recordDeckMatchFromGame({
      deckId: resolved.deckIds[0],
      deckName: getDeckById(resolved.deckIds[0])?.name || resolved.names[0],
      outcome: winner === 0 ? 'win' : 'loss',
      match: snapshots[0],
      opponentDeckId: resolved.deckIds[1],
      opponentDeckName: getDeckById(resolved.deckIds[1])?.name || resolved.names[1],
      gameMode: 'local2p',
    });
    recordDeckMatchFromGame({
      deckId: resolved.deckIds[1],
      deckName: getDeckById(resolved.deckIds[1])?.name || resolved.names[1],
      outcome: winner === 1 ? 'win' : 'loss',
      match: snapshots[1],
      opponentDeckId: resolved.deckIds[0],
      opponentDeckName: getDeckById(resolved.deckIds[0])?.name || resolved.names[0],
      gameMode: 'local2p',
    });
  }

  const ui = new GameUI(gameHost, engine, gameAudio, {
    gameMode: mode,
    onlineSeat: seat,
    onlineHost: isHost,
    onlineRelay: (action) => {
      client.sendAction({ ...action, playerIndex: seat });
    },
    housesProgress: {
      progress: `En ligne · ${start.code}`,
      opponentName: resolved.names[1 - seat],
    },
    onMatchEnd: ({ winner }) => {
      flushMatchStats(winner);
    },
    onReplay: () => {
      if (!isHost) {
        window.alert('Seul l’hôte peut relancer la partie.');
        return;
      }
      ui.hideEndGameOverlay();
      engine.reset({ deckLists: resolved.deckLists, gameMode: mode });
      attachMatchStatsTracker();
      engine.startGame();
    },
    onMainMenu: () => {
      ui.hideEndGameOverlay();
      void client.leaveRoom();
      const shells = tearDownMatch();
      initMenu(shells.menuHost, shells.gameHost);
    },
  });
  if (isHost) {
    const baseOnStateChange = engine.onStateChange;
    engine.onStateChange = (state) => {
      baseOnStateChange(state);
      client.pushState(state);
    };
    client.onGameAction = ({ seat: fromSeat, action }) => {
      if (fromSeat !== 1) return;
      applyRemoteGameAction(engine, action);
    };
  } else {
    client.onGameState = ({ state }) => {
      if (state) engine.applyRemoteState(state);
    };
    client.onGameAction = null;
  }

  client.onOpponentLeft = () => {
    window.alert('Votre adversaire s’est déconnecté.');
    ui.hideEndGameOverlay?.();
    void client.leaveRoom();
    const shells = tearDownMatch();
    initMenu(shells.menuHost, shells.gameHost);
  };

  if (isHost) {
    engine.reset({ deckLists: resolved.deckLists, gameMode: mode });
    engine.startGame();
  }

  activeMatch = {
    engine,
    ui,
    lastMatch: {
      playerDeckId: myDeckId,
      opponentDeckId: oppDeckId,
      gameMode: mode,
    },
  };

  window.chevalierGame = {
    engine,
    ui,
    audio: gameAudio,
    lastMatch: activeMatch.lastMatch,
    mode: 'online',
    roomCode: start.code,
    seat,
    isHost,
  };
}

function initMenu(menuHost, gameHost, { showMain = true } = {}) {
  const menu = new GameMenu(menuHost, {
    onStartMatch: ({ playerDeckId, opponentDeckId, gameMode, aiDifficulty }) => {
      const hosts = getShellHosts() || { menuHost, gameHost };
      startMatch(hosts.menuHost, hosts.gameHost, playerDeckId, opponentDeckId, gameMode, aiDifficulty);
    },
    onStartAttackTest: (knightCardId) => {
      const hosts = getShellHosts() || { menuHost, gameHost };
      startAttackTest(hosts.menuHost, hosts.gameHost, knightCardId);
    },
    onStartTwelveHouses: (opts) => {
      startTwelveHousesRun(menuHost, gameHost, opts);
    },
    onInitCombat1000: (run) => {
      initCombat1000Run(run);
    },
    onStartCombat1000Match: () => {
      const hosts = getShellHosts() || { menuHost, gameHost };
      startCombat1000FromVsScreen(hosts.menuHost, hosts.gameHost);
    },
    onStartOnlineMatch: ({ seat, start, client }) => {
      const hosts = getShellHosts() || { menuHost, gameHost };
      startOnlineMatch(hosts.menuHost, hosts.gameHost, { seat, start, client });
    },
  });
  if (showMain) menu.showMain();
  window.chevalierMenu = menu;
  window.chevalierStartTwelveHousesRun = (opts) => startTwelveHousesRun(menuHost, gameHost, opts);
  return menu;
}

root.innerHTML = '<p class="boot-loading">Chargement des cartes…</p>';

Promise.all([loadCards(), loadAttackFx(), initDeckStorage()])
  .then(() => {
    window.gameAudio = gameAudio;
    const { menuHost, gameHost } = mountShell();
    initMenu(menuHost, gameHost);
  })
  .catch((err) => {
    console.error(err);
    showError(err.message || String(err));
  });
