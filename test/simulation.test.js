import test from "node:test";
import assert from "node:assert/strict";
import {
  SCORING_VARIANTS,
  chooseSimulationBid,
  scoreWithVariant,
  seededRandom,
  simulateGame,
  simulateVariant,
} from "../src/simulation.js";
import { createDeck, createPlayers } from "../src/game.js";

const current = SCORING_VARIANTS.find(({ id }) => id === "current-m10");
const symmetric = SCORING_VARIANTS.find(({ id }) => id === "symmetric-m10");

test("simulation matrix crosses both miss rules with four Mountaintop schedules", () => {
  assert.equal(SCORING_VARIANTS.length, 8);
  assert.equal(new Set(SCORING_VARIANTS.map(({ id }) => id)).size, 8);
  assert.deepEqual(new Set(SCORING_VARIANTS.map(({ miss }) => miss)), new Set(["current", "symmetric"]));
});

test("variant scoring preserves exact bids and changes only configured risks", () => {
  assert.equal(scoreWithVariant(3, 3, current), 8);
  assert.equal(scoreWithVariant(3, 4, current), 4);
  assert.equal(scoreWithVariant(3, 4, symmetric), -1);
  assert.equal(scoreWithVariant(0, 0, { ...current, mountainReward: 10, mountainPenalty: 6 }), 10);
  assert.equal(scoreWithVariant(0, 1, { ...current, mountainReward: 10, mountainPenalty: 6 }), -6);
});

test("seeded random and complete-game simulation are reproducible", () => {
  const firstRandom = seededRandom(42);
  const secondRandom = seededRandom(42);
  assert.deepEqual(Array.from({ length: 5 }, firstRandom), Array.from({ length: 5 }, secondRandom));
  const options = { variant: symmetric, playerCount: 4, gameIndex: 17, seed: 1234 };
  assert.deepEqual(simulateGame(options), simulateGame(options));
});

test("blind simulation bids do not depend on the bidder's hidden card", () => {
  const deck = createDeck();
  const players = createPlayers(4).map((player, index) => ({ ...player, hand: [deck[index]] }));
  const options = { players, playerIndex: 1, leader: 0, dealer: 3, trumpCard: deck[10], variant: current };
  const bid = chooseSimulationBid(options);
  players[1].hand = [deck[40]];
  assert.equal(chooseSimulationBid(options), bid);
});

test("variant aggregation reports finite balance metrics", () => {
  const result = simulateVariant({ variant: current, gamesPerPlayerCount: 2, seed: 9, playerCounts: [2, 4] });
  assert.equal(result.samples.totalGames, 4);
  assert.equal(result.byPlayerCount.length, 2);
  for (const value of Object.values(result.metrics)) assert.ok(Number.isFinite(value));
});
