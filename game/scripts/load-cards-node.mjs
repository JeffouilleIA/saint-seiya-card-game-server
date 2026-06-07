/** Bootstrap CARD_DATABASE in Node via le serveur local (node server.js). */
export async function loadCardsForNode(baseUrl = 'http://127.0.0.1:8080/') {
  const cardsModule = await import('../cards.js');
  if (Object.keys(cardsModule.CARD_DATABASE || {}).length > 0) {
    return cardsModule.CARD_DATABASE;
  }

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.startsWith('./')) {
      return originalFetch(new URL(url.slice(2), baseUrl), init);
    }
    return originalFetch(input, init);
  };

  try {
    await cardsModule.loadCards();
    return cardsModule.CARD_DATABASE;
  } finally {
    globalThis.fetch = originalFetch;
  }
}
