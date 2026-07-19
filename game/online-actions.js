/**
 * Applique les actions relayées par l'invité sur le moteur hôte.
 * @param {import('./engine.js').GameEngine} engine
 * @param {{ type: string, playerIndex?: number, method?: string, args?: unknown[], [key: string]: unknown }} action
 */
export const ONLINE_GUEST_METHODS = new Set([
  'endTurn',
  'attack',
  'attackFromBench',
  'chooseActive',
  'promoteActive',
  'discardForPending',
  'playChevalierToBench',
  'playStadium',
  'useTalent',
  'cancelPending',
  'discardNamedCardForAttack',
  'resolveAccelerationDiscardFromHand',
  'resolveAccelerationDiscardFromBench',
  'resolveMissionGigasPlaceKnight',
  'resolveDiscardForTalent',
  'resolveDiscardEnergyFromHandForTalent',
  'resolveAttachEnergyFromHand',
  'resolveDiscardHandKnight',
  'resolveDiscardHandSilenceOpponentTalent',
  'resolveSearchDeck',
  'playObjet',
  'playTool',
  'attachEnergy',
  'evolveCosmo',
  'retreat',
  'swapActiveWithBenchIndex',
  'pickOpponentBenchActive',
  'pickOwnBenchActive',
  'resolveDonDeViePick',
  'resolvePickHuitiemeSensTarget',
  'resolvePickHealAllyNextTurn',
  'resolveVoluntarySacrificeKnight',
  'resolvePickKanonSanctuaryTarget',
  'resolveMoveEnergy',
  'resolvePickHealAlly',
  'resolvePickKnightForDiscardEnergyAttach',
  'resolveAthenaExclamationPick',
  'resolvePickBenchForDeckEnergy',
  'resolvePickBenchForEnergyRecover',
  'resolveDestructionOutilPick',
  'resolveCerbereBenchBonusPick',
  'resolveDistributeDamageAssign',
  'resolvePickDamageOpponentKnight',
  'resolvePickSilenceOpponentKnight',
  'resolveSacrificeBenchForAttack',
  'resolveCharonSwapBench',
  'resolveTransferEnergyToHadesSource',
  'resolveTransferEnergyToHadesDest',
  'resolveTransferEnergyTalentStep',
  'resolvePickMeleeBonusAlly',
  'resolveAccelerationAttach',
  'finishMissionGigasSkip',
  'finishAccelerationEnergieDiscard',
  'resolvePickDisableOpponentAttack',
  'resolvePickCopyBenchAttack',
  'resolvePickCopyOpponentAttack',
  'resolvePickKanonSanctuary',
  'resolveAttachEnergyFromDiscard',
  'resolveDonDeVieAmount',
  'resolvePickHuitiemeSensCount',
  'resolvePickIoAnimal',
  'resolvePickIoBigTornadoStatus',
  'resolveLookTopPickOne',
  'resolvePickBenchSelfAttack',
  'resolveOptionalDiscardEnergyForAttack',
  'resolveOptionalDiscardNamedCardsForAttack',
  'finishDestructionOutil',
  'finishCerbereBenchBonus',
  'finishDistributeDamage',
  'moveLookTopDeckCard',
  'confirmLookTopDeck',
  'resolvePickRecoverFromDiscard',
  'pickTeleportSide',
]);

const GUEST_SEAT = 1;

function guestPlayerIndex(action) {
  return action.playerIndex ?? GUEST_SEAT;
}

function guestOwnsPending(engine, guestIndex = GUEST_SEAT) {
  const pending = engine.state?.pending;
  if (!pending) return false;
  const owner = pending.chooserPlayerIndex ?? pending.playerIndex;
  return owner === guestIndex;
}

function guestCanRelayEngineCall(engine, args = []) {
  if (args[0] !== GUEST_SEAT) return false;
  if (engine.state.turn === GUEST_SEAT && engine.state.phase === 'main' && !engine.state.winner) {
    return true;
  }
  return guestOwnsPending(engine, GUEST_SEAT);
}

async function invokeGuestMethod(engine, method, args = []) {
  if (!ONLINE_GUEST_METHODS.has(method)) return false;
  if (!guestCanRelayEngineCall(engine, args)) return false;
  const fn = engine[method];
  if (typeof fn !== 'function') return false;
  const result = fn.apply(engine, args);
  const resolved = result != null && typeof result.then === 'function' ? await result : result;
  if (resolved === false) return false;
  return true;
}

export async function applyRemoteGameAction(engine, action) {
  if (!engine || !action?.type) return false;
  if (guestPlayerIndex(action) !== GUEST_SEAT) return false;

  if (action.type === 'engineCall') {
    return invokeGuestMethod(engine, action.method, action.args || []);
  }

  switch (action.type) {
    case 'endTurn':
      if (engine.state.turn === GUEST_SEAT && !engine.state.pending) {
        await engine.endTurn();
        return true;
      }
      return false;
    case 'playChevalierToBench':
      if (typeof action.handIndex === 'number') {
        return (await invokeGuestMethod(engine, 'playChevalierToBench', [GUEST_SEAT, action.handIndex])) !== false;
      }
      return false;
    case 'playStadium':
      if (typeof action.handIndex === 'number') {
        return (await invokeGuestMethod(engine, 'playStadium', [GUEST_SEAT, action.handIndex])) !== false;
      }
      return false;
    case 'attack':
      if (typeof action.attackIndex === 'number') {
        return (await invokeGuestMethod(engine, 'attack', [GUEST_SEAT, action.attackIndex])) !== false;
      }
      return false;
    case 'chooseActive':
      if (typeof action.benchIndex === 'number') {
        return (await invokeGuestMethod(engine, 'chooseActive', [GUEST_SEAT, action.benchIndex])) !== false;
      }
      return false;
    case 'promoteActive':
      if (typeof action.benchIndex === 'number') {
        return (await invokeGuestMethod(engine, 'promoteActive', [GUEST_SEAT, action.benchIndex])) !== false;
      }
      return false;
    case 'discardForPending':
      if (typeof action.handIndex === 'number') {
        return (await invokeGuestMethod(engine, 'discardForPending', [GUEST_SEAT, action.handIndex])) !== false;
      }
      return false;
    default:
      return false;
  }
}
