export const SUITS = ["♠", "♥", "♦", "♣"];
export const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
export const ROUND_SIZES = [6, 5, 4, 3, 2, 1, 2, 3, 4, 5, 6];
export const BOT_NAMES = ["Mira", "Theo", "June", "Felix", "Sage", "Wren", "Otis"];
export const MOUNTAINTOP_POINTS = 6;

export function leadText(player) {
  return player.human ? "You lead" : `${player.name} leads`;
}

export function leadText(player) {
  return player.human ? "You lead" : `${player.name} leads`;
}

export function createDeck() {
  return SUITS.flatMap((suit) => RANKS.map((rank, value) => ({ id: `${rank}${suit}`, rank, suit, value })));
}

export function shuffle(cards, random = Math.random) {
  const deck = [...cards];
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export function legalCards(hand, ledSuit) {
  if (!ledSuit) return hand;
  const following = hand.filter((card) => card.suit === ledSuit);
  return following.length ? following : hand;
}

export function trickWinner(plays, trumpSuit) {
  if (!plays.length) return null;
  const ledSuit = plays[0].card.suit;
  const trumps = plays.filter((play) => play.card.suit === trumpSuit);
  const contenders = trumps.length ? trumps : plays.filter((play) => play.card.suit === ledSuit);
  return contenders.reduce((best, play) => (play.card.value > best.card.value ? play : best));
}

export function scoreRound(prediction, tricks) {
  if (prediction === 0) return tricks === 0 ? MOUNTAINTOP_POINTS : -MOUNTAINTOP_POINTS;
  return prediction === tricks ? 5 + tricks : -Math.abs(prediction - tricks);
}

export function predictionDistribution(hand, trumpSuit, playerCount, isDealer) {
  let expected = 0;
  for (const card of hand) {
    if (card.suit === trumpSuit) {
      expected += card.value >= 10 ? 0.9 : card.value >= 7 ? 0.65 : 0.35;
    } else if (card.value === 12) expected += 0.72 - (playerCount - 2) * 0.055;
    else if (card.value === 11) expected += 0.4 - (playerCount - 2) * 0.04;
    else if (card.value === 10) expected += 0.18;
  }
  if (isDealer) expected += 0.08;
  expected = Math.max(0, Math.min(hand.length, expected));
  if (hand.length === 0) return [1];
  const probability = Math.max(0.001, Math.min(0.999, expected / hand.length));
  const distribution = Array(hand.length + 1).fill(0);
  distribution[0] = (1 - probability) ** hand.length;
  for (let tricks = 1; tricks <= hand.length; tricks += 1) {
    distribution[tricks] = distribution[tricks - 1] * ((hand.length - tricks + 1) / tricks) * (probability / (1 - probability));
  }
  return distribution;
}

export function bestPrediction(distribution, scorer = scoreRound) {
  let best = { prediction: 0, value: -Infinity };
  for (let prediction = 0; prediction < distribution.length; prediction += 1) {
    const value = distribution.reduce((total, probability, tricks) => total + probability * scorer(prediction, tricks), 0);
    if (value > best.value + 1e-12) best = { prediction, value };
  }
  return best.prediction;
}

export function estimatePrediction(hand, trumpSuit, playerCount, isDealer) {
  return bestPrediction(predictionDistribution(hand, trumpSuit, playerCount, isDealer));
}

function cardRisk(card, trumpSuit) {
  return card.value + (card.suit === trumpSuit ? 20 : 0);
}

// Only public information enters this calculation: never the bidder's own card
// or the actual undealt deck. Each unseen card is an equally possible own card.
export function estimateBlindPrediction({ visiblePlays, playerIndex, leader, trumpCard }) {
  const knownIds = new Set([trumpCard.id, ...visiblePlays.map(({ card }) => card.id)]);
  const candidates = createDeck().filter((card) => !knownIds.has(card.id));
  const playerCount = visiblePlays.length + 1;
  let wins = 0;
  for (const card of candidates) {
    const plays = [...visiblePlays, { playerIndex, card }].sort((a, b) =>
      (a.playerIndex - leader + playerCount) % playerCount -
      (b.playerIndex - leader + playerCount) % playerCount);
    if (trickWinner(plays, trumpCard.suit).playerIndex === playerIndex) wins += 1;
  }
  const winChance = wins / candidates.length;
  const bidOneValue = winChance * scoreRound(1, 1) + (1 - winChance) * scoreRound(1, 0);
  const mountainValue = winChance * scoreRound(0, 1) + (1 - winChance) * scoreRound(0, 0);
  return bidOneValue >= mountainValue ? 1 : 0;
}

export function chooseBotCard({ hand, plays, trumpSuit, prediction, tricks }) {
  const ledSuit = plays[0]?.card.suit;
  const legal = legalCards(hand, ledSuit);
  const winningNow = legal.filter((card) => trickWinner([...plays, { card, playerIndex: -1 }], trumpSuit)?.playerIndex === -1);
  const stillNeedsTricks = prediction > tricks;

  if (stillNeedsTricks && winningNow.length) {
    return [...winningNow].sort((a, b) => cardRisk(a, trumpSuit) - cardRisk(b, trumpSuit))[0];
  }

  const losing = legal.filter((card) => !winningNow.includes(card));
  if (losing.length) return [...losing].sort((a, b) => cardRisk(b, trumpSuit) - cardRisk(a, trumpSuit))[0];
  return [...legal].sort((a, b) => cardRisk(a, trumpSuit) - cardRisk(b, trumpSuit))[0];
}

export function sortHand(hand, trumpSuit) {
  return [...hand].sort((a, b) => {
    if (a.suit === trumpSuit && b.suit !== trumpSuit) return 1;
    if (b.suit === trumpSuit && a.suit !== trumpSuit) return -1;
    const suitDiff = SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit);
    return suitDiff || a.value - b.value;
  });
}

export function createPlayers(count) {
  return [
    { name: "You", human: true, score: 0 },
    ...BOT_NAMES.slice(0, count - 1).map((name) => ({ name, human: false, score: 0 })),
  ];
}
