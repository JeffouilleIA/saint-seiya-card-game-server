/**
 * Applique les actions relayées par l'invité sur le moteur hôte.
 * @param {import('./engine.js').GameEngine} engine
 * @param {{ type: string, [key: string]: unknown }} action
 */
export function applyRemoteGameAction(engine, action) {
  if (!engine || !action?.type) return false;
  const acting = action.playerIndex;
  if (acting !== 1) return false;

  switch (action.type) {
    case 'endTurn':
      if (engine.state.turn === acting && !engine.state.pending) {
        void engine.endTurn();
        return true;
      }
      return false;
    case 'playChevalierToBench':
      if (typeof action.handIndex === 'number') {
        engine.playChevalierToBench(acting, action.handIndex);
        return true;
      }
      return false;
    case 'playStadium':
      if (typeof action.handIndex === 'number') {
        engine.playStadium(acting, action.handIndex);
        return true;
      }
      return false;
    case 'attack':
      if (typeof action.attackIndex === 'number') {
        engine.attack(acting, action.attackIndex);
        return true;
      }
      return false;
    case 'chooseActive':
      if (typeof action.benchIndex === 'number') {
        engine.chooseActive(acting, action.benchIndex);
        return true;
      }
      return false;
    case 'promoteActive':
      if (typeof action.benchIndex === 'number') {
        engine.promoteActive(acting, action.benchIndex);
        return true;
      }
      return false;
    case 'discardForPending':
      if (typeof action.handIndex === 'number') {
        engine.discardForPending(acting, action.handIndex);
        return true;
      }
      return false;
    default:
      return false;
  }
}
