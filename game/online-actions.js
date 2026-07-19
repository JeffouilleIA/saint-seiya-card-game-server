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

function guestPlayerIndex(action) {
  return action.playerIndex ?? 1;
}

async function invokeGuestMethod(engine, method, args = []) {
  if (!ONLINE_GUEST_METHODS.has(method)) return false;
  const fn = engine[method];
  if (typeof fn !== 'function') return false;
  const result = fn.apply(engine, args);
  if (result != null && typeof result.then === 'function') {
    await result;
  }
  return true;
}

export async function applyRemoteGameAction(engine, action) {
  if (!engine || !action?.type) return false;
  if (guestPlayerIndex(action) !== 1) return false;

  if (action.type === 'engineCall') {
    return invokeGuestMethod(engine, action.method, action.args || []);
  }

  switch (action.type) {
    case 'endTurn':
      if (engine.state.turn === 1 && !engine.state.pending) {
        await engine.endTurn();
        return true;
      }
      return false;
    case 'playChevalierToBench':
      if (typeof action.handIndex === 'number') {
        engine.playChevalierToBench(1, action.handIndex);
        return true;
      }
      return false;
    case 'playStadium':
      if (typeof action.handIndex === 'number') {
        engine.playStadium(1, action.handIndex);
        return true;
      }
      return false;
    case 'attack':
      if (typeof action.attackIndex === 'number') {
        engine.attack(1, action.attackIndex);
        return true;
      }
      return false;
    case 'chooseActive':
      if (typeof action.benchIndex === 'number') {
        engine.chooseActive(1, action.benchIndex);
        return true;
      }
      return false;
    case 'promoteActive':
      if (typeof action.benchIndex === 'number') {
        engine.promoteActive(1, action.benchIndex);
        return true;
      }
      return false;
    case 'discardForPending':
      if (typeof action.handIndex === 'number') {
        engine.discardForPending(1, action.handIndex);
        return true;
      }
      return false;
    default:
      return false;
  }
}
