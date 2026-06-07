import { loadCardsForNode } from './load-cards-node.mjs';
import { simulateAiBattle } from '../ai-battle.js';
import { expandDeckEntries, getDefaultDeckEntry } from '../decks.js';

await loadCardsForNode();
const defaultList = expandDeckEntries(getDefaultDeckEntry().cards);

const runs = 10;
let completed = 0;
const statuses = {};
for (let i = 0; i < runs; i++) {
  const r = await simulateAiBattle({
    deckLists: [defaultList, defaultList.slice()],
    deckNames: [`run${i + 1} A`, `run${i + 1} B`],
    aiDifficulty: 'moyen',
  });
  statuses[r.status] = (statuses[r.status] || 0) + 1;
  if (r.status === 'completed') completed++;
  if (i < 5 || r.status !== 'completed') {
    console.log(JSON.stringify({ i: i + 1, status: r.status, winner: r.winnerName, turns: r.turnCount, stuck: r.stuckPendingType }));
  }
}
console.log(`Completed: ${completed}/${runs}`);
console.log('Status breakdown:', statuses);
