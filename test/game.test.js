import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  MOUNTAINTOP_POINTS,
  ROUND_SIZES,
  bestPrediction,
  createDeck,
  createPlayers,
  leadText,
  legalCards,
  scoreRound,
  trickWinner,
  winText,
} from "../src/game.js";

const card = (rank, suit, value) => ({ id: `${rank}${suit}`, rank, suit, value });

test("deck contains 52 unique cards", () => {
  const deck = createDeck();
  assert.equal(deck.length, 52);
  assert.equal(new Set(deck.map((c) => c.id)).size, 52);
});

test("round schedule has eleven rounds and descends then ascends", () => {
  assert.deepEqual(ROUND_SIZES, [6, 5, 4, 3, 2, 1, 2, 3, 4, 5, 6]);
});

test("players must follow the led suit when able", () => {
  const hand = [card("A", "♠", 12), card("2", "♥", 0), card("K", "♥", 11)];
  assert.deepEqual(legalCards(hand, "♥").map((c) => c.id), ["2♥", "K♥"]);
  assert.equal(legalCards(hand, "♣").length, 3);
});

test("highest trump wins over the led suit", () => {
  const plays = [
    { playerIndex: 0, card: card("A", "♥", 12) },
    { playerIndex: 1, card: card("2", "♠", 0) },
    { playerIndex: 2, card: card("K", "♠", 11) },
  ];
  assert.equal(trickWinner(plays, "♠").playerIndex, 2);
});

test("highest card in led suit wins when no trump is played", () => {
  const plays = [
    { playerIndex: 0, card: card("10", "♥", 8) },
    { playerIndex: 1, card: card("A", "♣", 12) },
    { playerIndex: 2, card: card("Q", "♥", 10) },
  ];
  assert.equal(trickWinner(plays, "♠").playerIndex, 2);
});

test("round scoring: exact bids score five plus tricks, misses score tricks taken, Mountaintop is ±6", () => {
  assert.equal(MOUNTAINTOP_POINTS, 6);
  assert.equal(scoreRound(3, 3), 8);
  assert.equal(scoreRound(1, 1), 6);
  assert.equal(scoreRound(3, 2), 2);
  assert.equal(scoreRound(3, 4), 4);
  assert.equal(scoreRound(3, 0), 0);
  assert.equal(scoreRound(0, 0), 6);
  assert.equal(scoreRound(0, 1), -6);
  assert.equal(scoreRound(0, 5), -6);
});

test("prediction selection maximizes expected value under production scoring", () => {
  // Confident of zero tricks: Mountaintop (+6) beats bidding one (a miss still scores 0).
  assert.equal(bestPrediction([0.9, 0.1]), 0);
  // A coin flip between zero and one trick: bidding one risks nothing, Mountaintop risks −6.
  assert.equal(bestPrediction([0.5, 0.5]), 1);
  // Strongly expecting two tricks picks the exact bid over the safer neighbours.
  assert.equal(bestPrediction([0.05, 0.2, 0.6, 0.15]), 2);
});

test("lead and win text use the correct grammar for human and computer players", () => {
  assert.equal(leadText({ name: "You", human: true }), "You lead");
  assert.equal(leadText({ name: "Mira", human: false }), "Mira leads");
  assert.equal(winText({ name: "You", human: true }), "You win the trick");
  assert.equal(winText({ name: "Mira", human: false }), "Mira wins the trick");
});

test("player count is capped to the range that renders on a phone", () => {
  assert.equal(MIN_PLAYERS, 2);
  assert.equal(MAX_PLAYERS, 5);
  assert.equal(createPlayers(MAX_PLAYERS).length, MAX_PLAYERS);
  assert.ok(createPlayers(MIN_PLAYERS)[0].human);
  assert.throws(() => createPlayers(MAX_PLAYERS + 1), RangeError);
  assert.throws(() => createPlayers(MIN_PLAYERS - 1), RangeError);
  assert.throws(() => createPlayers(2.5), RangeError);
});
