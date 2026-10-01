import test from "node:test";
import assert from "node:assert/strict";
import { createDeck, createPlayers, ROUND_SIZES, estimateBlindPrediction } from "../src/game.js";

const deck = createDeck();
const card = (id) => deck.find((c) => c.id === id);

test("blind bots call Mountaintop when a visible opponent holds the highest trump", () => {
  assert.equal(estimateBlindPrediction({
    visiblePlays: [{ playerIndex: 0, card: card("A♠") }],
    playerIndex: 1, leader: 0, trumpCard: card("2♠"),
  }), 0);
});

test("blind bots bid one when leading against a visible low non-trump card", () => {
  assert.equal(estimateBlindPrediction({
    visiblePlays: [{ playerIndex: 0, card: card("2♥") }],
    playerIndex: 1, leader: 1, trumpCard: card("2♠"),
  }), 1);
});

function fixture(round = 5, count = 4) {
  const players = createPlayers(count).map((p, i) => ({ ...p,
    hand: deck.slice(i * ROUND_SIZES[round], (i + 1) * ROUND_SIZES[round]),
    prediction: null, tricks: 0,
  }));
  return { players, round, dealer: count - 1, leader: 0, turn: 0,
    phase: "predict", trumpCard: card("A♣"), plays: [], message: "", roundScores: [] };
}

let importId = 0;
async function withApp(saved, run) {
  const originals = Object.fromEntries(["document", "localStorage", "setTimeout"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const app = { innerHTML: "" };
  const buttons = Array.from({ length: ROUND_SIZES[saved.round] + 1 }, (_, bid) => ({
    dataset: { bid: String(bid) }, addEventListener(_, callback) { this.click = callback; },
  }));
  let stored = structuredClone(saved);
  globalThis.document = { querySelector: (selector) => selector === "#app" ? app : null,
    querySelectorAll: (selector) => selector === "[data-bid]" ? buttons : [] };
  globalThis.localStorage = { getItem: () => JSON.stringify(stored), setItem: (_, value) => { stored = JSON.parse(value); } };
  // Freeze the bot delay so assertions can inspect the instant bids are locked.
  globalThis.setTimeout = () => 0;
  try {
    await import(`../src/app.js?blind-test=${++importId}`);
    return await run({ app, buttons, saved: () => stored });
  } finally {
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

test("a restored blind bid hides the human card everywhere and reveals it only after commitment", async () => {
  for (const count of [2, 4, 8]) {
    for (const bid of [0, 1]) {
      const game = fixture(5, count);
      await withApp(game, ({ app, buttons, saved }) => {
        assert.match(app.innerHTML, /Make a blind call/);
        assert.match(app.innerHTML, /Opponents’ cards/);
        assert.match(app.innerHTML, /scores \+6 if you take no tricks, but −6 if you take any/);
        assert.doesNotMatch(app.innerHTML, /2_of_spades\.svg|aria-label="2 of spades"|data-card-index=/);
        assert.equal((app.innerHTML.match(/class="card card-back"/g) || []).length, 2);
        for (const opponent of game.players.slice(1)) assert.ok(app.innerHTML.includes(`${opponent.hand[0].rank}_of_spades.svg`));
        assert.match(app.innerHTML, /ace_of_clubs\.svg/);
        assert.equal((app.innerHTML.match(/data-bid=/g) || []).length, 2);
        assert.ok(saved().players.every((p) => p.prediction === null));
        buttons[bid].click();
        assert.equal(saved().phase, "play");
        assert.equal(saved().players[0].prediction, bid);
        assert.ok(saved().players.every((p) => p.prediction !== null));
        assert.match(app.innerHTML, /2_of_spades\.svg/);
        assert.doesNotMatch(app.innerHTML, /card-back|data-bid=/);
      });
    }
  }
});

test("a bot's blind bid is independent of its own card and the human's bid", async () => {
  const results = [];
  for (const ownCard of [card("A♠"), card("2♥")]) {
    for (const humanBid of [0, 1]) {
      const game = fixture();
      game.players[1].hand = [ownCard];
      results.push(await withApp(game, ({ buttons, saved }) => {
        buttons[humanBid].click();
        return saved().players[1].prediction;
      }));
    }
  }
  assert.ok(results.every((bid) => bid === results[0]));
});

test("all other rounds retain visible-hand bidding, even with one card left during play", async () => {
  for (let round = 0; round < ROUND_SIZES.length; round++) {
    if (ROUND_SIZES[round] === 1) continue;
    await withApp(fixture(round), ({ app }) => {
      assert.match(app.innerHTML, /2_of_spades\.svg/);
      assert.doesNotMatch(app.innerHTML, /card-back|Make a blind call|Opponents’ cards/);
      assert.equal((app.innerHTML.match(/data-bid=/g) || []).length, ROUND_SIZES[round] + 1);
    });
  }
  const playing = fixture(0);
  playing.phase = "play";
  playing.players.forEach((p) => { p.hand = p.hand.slice(0, 1); p.prediction = 1; });
  await withApp(playing, ({ app }) => {
    assert.match(app.innerHTML, /2_of_spades\.svg/);
    assert.doesNotMatch(app.innerHTML, /card-back/);
  });
});
