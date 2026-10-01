import {
  ROUND_SIZES,
  chooseBotCard,
  createDeck,
  shuffle,
  trickWinner,
} from "./game.js";

export const SCORING_VARIANTS = [
  ...[10, 8, 6].map((value) => ({ id: `current-m${value}`, miss: "current", mountainReward: value, mountainPenalty: value })),
  { id: "current-m10-6", miss: "current", mountainReward: 10, mountainPenalty: 6 },
  ...[10, 8, 6].map((value) => ({ id: `symmetric-m${value}`, miss: "symmetric", mountainReward: value, mountainPenalty: value })),
  { id: "symmetric-m10-6", miss: "symmetric", mountainReward: 10, mountainPenalty: 6 },
];

export function scoreWithVariant(prediction, tricks, variant) {
  if (prediction === 0) return tricks === 0 ? variant.mountainReward : -variant.mountainPenalty;
  if (prediction === tricks) return 5 + tricks;
  return variant.miss === "symmetric" ? -Math.abs(prediction - tricks) : tricks;
}

export function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function mixSeed(seed, gameIndex, round) {
  let value = (seed ^ Math.imul(gameIndex + 1, 0x9e3779b1) ^ Math.imul(round + 1, 0x85ebca6b)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return (value ^ (value >>> 16)) >>> 0;
}

function expectedTricks(hand, trumpSuit, playerCount, isDealer) {
  let expected = 0;
  for (const card of hand) {
    if (card.suit === trumpSuit) expected += card.value >= 10 ? 0.9 : card.value >= 7 ? 0.65 : 0.35;
    else if (card.value === 12) expected += 0.72 - (playerCount - 2) * 0.055;
    else if (card.value === 11) expected += 0.4 - (playerCount - 2) * 0.04;
    else if (card.value === 10) expected += 0.18;
  }
  return Math.max(0, Math.min(hand.length, expected + (isDealer ? 0.08 : 0)));
}

function binomialDistribution(size, expected) {
  if (size === 0) return [1];
  const probability = Math.max(0.001, Math.min(0.999, expected / size));
  const distribution = Array(size + 1).fill(0);
  distribution[0] = (1 - probability) ** size;
  for (let tricks = 1; tricks <= size; tricks += 1) {
    distribution[tricks] = distribution[tricks - 1] * ((size - tricks + 1) / tricks) * (probability / (1 - probability));
  }
  return distribution;
}

function bestBid(distribution, variant) {
  let best = { bid: 0, value: -Infinity };
  for (let bid = 0; bid < distribution.length; bid += 1) {
    const value = distribution.reduce((total, probability, tricks) =>
      total + probability * scoreWithVariant(bid, tricks, variant), 0);
    if (value > best.value + 1e-12) best = { bid, value };
  }
  return best.bid;
}

function blindDistribution(players, playerIndex, leader, trumpCard) {
  const visiblePlays = players.flatMap((player, index) => index === playerIndex ? [] : [{ playerIndex: index, card: player.hand[0] }]);
  const knownIds = new Set([trumpCard.id, ...visiblePlays.map(({ card }) => card.id)]);
  const candidates = createDeck().filter((card) => !knownIds.has(card.id));
  let wins = 0;
  for (const card of candidates) {
    const plays = [...visiblePlays, { playerIndex, card }].sort((a, b) =>
      (a.playerIndex - leader + players.length) % players.length -
      (b.playerIndex - leader + players.length) % players.length);
    if (trickWinner(plays, trumpCard.suit).playerIndex === playerIndex) wins += 1;
  }
  return [1 - wins / candidates.length, wins / candidates.length];
}

export function chooseSimulationBid({ players, playerIndex, leader, dealer, trumpCard, variant }) {
  const player = players[playerIndex];
  const distribution = player.hand.length === 1
    ? blindDistribution(players, playerIndex, leader, trumpCard)
    : binomialDistribution(player.hand.length, expectedTricks(player.hand, trumpCard.suit, players.length, dealer === playerIndex));
  return bestBid(distribution, variant);
}

function leaders(scores) {
  const high = Math.max(...scores);
  return scores.map((score, index) => score === high ? index : -1).filter((index) => index >= 0);
}

function finalRoundSwing(variant) {
  const bestScore = Math.max(11, variant.mountainReward);
  const worstOrdinaryScore = variant.miss === "symmetric" ? -6 : 0;
  return bestScore - Math.min(worstOrdinaryScore, -variant.mountainPenalty);
}

export function simulateGame({ variant, playerCount, gameIndex, seed = 20261001 }) {
  const players = Array.from({ length: playerCount }, (_, index) => ({ index, score: 0, prediction: null, tricks: 0, hand: [] }));
  const initialDealer = mixSeed(seed, gameIndex, 99) % playerCount;
  let previousLeaders = [];
  let leadChanges = 0;
  let midpointLast = [];
  let finalRoundContenders = 0;
  let finalRoundReachContenders = 0;
  const mountainCalls = Array(playerCount).fill(0);
  const mountainSuccesses = Array(playerCount).fill(0);
  const mountainFailures = Array(playerCount).fill(0);
  const postFailureOpportunities = Array(playerCount).fill(0);
  const postFailureCalls = Array(playerCount).fill(0);
  let exactBids = 0;

  for (let round = 0; round < ROUND_SIZES.length; round += 1) {
    if (round === ROUND_SIZES.length - 1) {
      const high = Math.max(...players.map((player) => player.score));
      finalRoundContenders = players.filter((player) => high - player.score <= 10).length;
      finalRoundReachContenders = players.filter((player) => high - player.score <= finalRoundSwing(variant)).length;
    }
    const dealer = (initialDealer + round) % playerCount;
    const leader = (dealer + 1) % playerCount;
    const deck = shuffle(createDeck(), seededRandom(mixSeed(seed, gameIndex, round)));
    const handSize = ROUND_SIZES[round];
    players.forEach((player) => {
      player.hand = deck.splice(0, handSize);
      player.tricks = 0;
      player.prediction = null;
    });
    const trumpCard = deck.shift();

    players.forEach((player) => {
      if (mountainFailures[player.index] > 0) postFailureOpportunities[player.index] += 1;
      player.prediction = chooseSimulationBid({ players, playerIndex: player.index, leader, dealer, trumpCard, variant });
      if (player.prediction === 0) {
        mountainCalls[player.index] += 1;
        if (mountainFailures[player.index] > 0) postFailureCalls[player.index] += 1;
      }
    });

    let trickLeader = leader;
    for (let trick = 0; trick < handSize; trick += 1) {
      const plays = [];
      for (let offset = 0; offset < playerCount; offset += 1) {
        const playerIndex = (trickLeader + offset) % playerCount;
        const player = players[playerIndex];
        const card = chooseBotCard({ hand: player.hand, plays, trumpSuit: trumpCard.suit, prediction: player.prediction, tricks: player.tricks });
        player.hand.splice(player.hand.indexOf(card), 1);
        plays.push({ playerIndex, card });
      }
      trickLeader = trickWinner(plays, trumpCard.suit).playerIndex;
      players[trickLeader].tricks += 1;
    }

    players.forEach((player) => {
      if (player.prediction === player.tricks) exactBids += 1;
      if (player.prediction === 0) {
        if (player.tricks === 0) mountainSuccesses[player.index] += 1;
        else mountainFailures[player.index] += 1;
      }
      player.score += scoreWithVariant(player.prediction, player.tricks, variant);
    });
    const currentLeaders = leaders(players.map((player) => player.score));
    if (previousLeaders.length && !currentLeaders.some((leaderIndex) => previousLeaders.includes(leaderIndex))) leadChanges += 1;
    previousLeaders = currentLeaders;
    if (round === 5) {
      const low = Math.min(...players.map((player) => player.score));
      midpointLast = players.filter((player) => player.score === low).map((player) => player.index);
    }
  }

  const finalScores = players.map((player) => player.score);
  const finalLeaders = leaders(finalScores);
  const sortedScores = [...finalScores].sort((a, b) => b - a);
  const failedPlayers = players.filter((player) => mountainFailures[player.index] > 0).map((player) => player.index);
  return {
    finalScores,
    winnerMargin: sortedScores[0] - sortedScores[1],
    finalSpread: sortedScores[0] - sortedScores.at(-1),
    leadChanges,
    midpointComeback: midpointLast.some((index) => finalLeaders.includes(index)),
    finalRoundContenders,
    finalRoundReachContenders,
    exactBids,
    mountainCalls: mountainCalls.reduce((a, b) => a + b, 0),
    mountainSuccesses: mountainSuccesses.reduce((a, b) => a + b, 0),
    mountainFailures: mountainFailures.reduce((a, b) => a + b, 0),
    postFailureOpportunities: postFailureOpportunities.reduce((a, b) => a + b, 0),
    postFailureCalls: postFailureCalls.reduce((a, b) => a + b, 0),
    failedPlayers: failedPlayers.length,
    failedPlayersWhoWon: failedPlayers.filter((index) => finalLeaders.includes(index)).length,
  };
}

export function simulateVariant({ variant, gamesPerPlayerCount, seed = 20261001, playerCounts = [2, 3, 4, 5, 6, 7, 8] }) {
  const totals = Object.fromEntries([
    "games", "players", "score", "scoreSquared", "winnerMargin", "finalSpread", "leadChanges", "midpointComebacks",
    "finalRoundContenders", "competitiveFinals", "finalRoundReachContenders", "competitiveFinalReach", "exactBids", "playerRounds", "mountainCalls", "mountainSuccesses",
    "mountainFailures", "postFailureOpportunities", "postFailureCalls", "failedPlayers", "failedPlayersWhoWon",
  ].map((key) => [key, 0]));
  const byPlayerCount = [];

  for (const playerCount of playerCounts) {
    const countTotals = { games: 0, winnerMargin: 0, finalSpread: 0, mountainCalls: 0, mountainFailures: 0 };
    for (let gameIndex = 0; gameIndex < gamesPerPlayerCount; gameIndex += 1) {
      const result = simulateGame({ variant, playerCount, gameIndex, seed });
      totals.games += 1;
      totals.players += playerCount;
      totals.winnerMargin += result.winnerMargin;
      totals.finalSpread += result.finalSpread;
      totals.leadChanges += result.leadChanges;
      totals.midpointComebacks += Number(result.midpointComeback);
      totals.finalRoundContenders += result.finalRoundContenders;
      totals.competitiveFinals += Number(result.finalRoundContenders >= 2);
      totals.finalRoundReachContenders += result.finalRoundReachContenders;
      totals.competitiveFinalReach += Number(result.finalRoundReachContenders >= 2);
      totals.exactBids += result.exactBids;
      totals.playerRounds += playerCount * ROUND_SIZES.length;
      for (const key of ["mountainCalls", "mountainSuccesses", "mountainFailures", "postFailureOpportunities", "postFailureCalls", "failedPlayers", "failedPlayersWhoWon"]) totals[key] += result[key];
      for (const score of result.finalScores) {
        totals.score += score;
        totals.scoreSquared += score ** 2;
      }
      countTotals.games += 1;
      countTotals.winnerMargin += result.winnerMargin;
      countTotals.finalSpread += result.finalSpread;
      countTotals.mountainCalls += result.mountainCalls;
      countTotals.mountainFailures += result.mountainFailures;
    }
    byPlayerCount.push({
      playerCount,
      averageWinnerMargin: countTotals.winnerMargin / countTotals.games,
      averageFinalSpread: countTotals.finalSpread / countTotals.games,
      mountainCallsPerGame: countTotals.mountainCalls / countTotals.games,
      mountainFailuresPerGame: countTotals.mountainFailures / countTotals.games,
    });
  }

  const averageScore = totals.score / totals.players;
  return {
    variant,
    samples: { gamesPerPlayerCount, totalGames: totals.games, playerRounds: totals.playerRounds },
    metrics: {
      averageScore,
      scoreStandardDeviation: Math.sqrt(totals.scoreSquared / totals.players - averageScore ** 2),
      averageWinnerMargin: totals.winnerMargin / totals.games,
      averageFinalSpread: totals.finalSpread / totals.games,
      averageLeadChanges: totals.leadChanges / totals.games,
      midpointLastPlaceComebackRate: totals.midpointComebacks / totals.games,
      averageFinalRoundContendersWithin10: totals.finalRoundContenders / totals.games,
      competitiveFinalRate: totals.competitiveFinals / totals.games,
      averageFinalRoundContendersInReach: totals.finalRoundReachContenders / totals.games,
      competitiveFinalReachRate: totals.competitiveFinalReach / totals.games,
      exactBidRate: totals.exactBids / totals.playerRounds,
      mountainCallRate: totals.mountainCalls / totals.playerRounds,
      mountainCallsPerGame: totals.mountainCalls / totals.games,
      mountainSuccessRate: totals.mountainSuccesses / totals.mountainCalls,
      mountainFailureRate: totals.mountainFailures / totals.mountainCalls,
      postFailureRecallRate: totals.postFailureCalls / totals.postFailureOpportunities,
      failedMountainPlayerWinRate: totals.failedPlayersWhoWon / totals.failedPlayers,
    },
    byPlayerCount,
  };
}
