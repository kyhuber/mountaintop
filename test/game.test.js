import test from "node:test";
import assert from "node:assert/strict";
import { bestPrediction, createDeck, legalCards, trickWinner, scoreRound, leadText, ROUND_SIZES } from "../src/game.js";
import { createDeck, legalCards, trickWinner, scoreRound, leadText, ROUND_SIZES } from "../src/game.js";

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

test("round scoring handles exact bids, misses, and Mountaintop", () => {
  assert.equal(scoreRound(3, 3), 8);
  assert.equal(scoreRound(3, 2), -1);
  assert.equal(scoreRound(3, 4), -1);
  assert.equal(scoreRound(3, 1), -2);
  assert.equal(scoreRound(3, 5), -2);
  assert.equal(scoreRound(0, 0), 6);
  assert.equal(scoreRound(0, 1), -6);
  assert.equal(scoreRound(0, 5), -6);
});

test("prediction selection maximizes expected value under production scoring", () => {
  assert.equal(bestPrediction([0.8, 0.2]), 0);
  assert.equal(bestPrediction([0.2, 0.8]), 1);
});

test("lead text uses the correct grammar for human and computer players", () => {
  assert.equal(leadText({ name: "You", human: true }), "You lead");
  assert.equal(leadText({ name: "Mira", human: false }), "Mira leads");
});

test("lead text uses the correct grammar for human and computer players", () => {
  assert.equal(leadText({ name: "You", human: true }), "You lead");
  assert.equal(leadText({ name: "Mira", human: false }), "Mira leads");
});
