import test from "node:test";
import assert from "node:assert/strict";
import { MAX_PLAYERS, ROUND_SIZES, estimateBlindPrediction } from "../src/game.js";
import { card, fixture, withApp } from "./helpers/app-harness.js";

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

test("a restored blind bid hides the human card everywhere and reveals it only after commitment", async () => {
  for (const count of [2, 4, MAX_PLAYERS]) {
    for (const bid of [0, 1]) {
      const game = fixture(5, count);
      await withApp(game, ({ app, bids, saved }) => {
        assert.match(app.innerHTML, /Make a blind call/);
        assert.match(app.innerHTML, /Opponents’ cards/);
        assert.match(app.innerHTML, /scores \+6 if you take no tricks, but −6 if you take any/);
        assert.doesNotMatch(app.innerHTML, /2_of_spades\.svg|aria-label="2 of spades"|data-card-index=/);
        assert.equal((app.innerHTML.match(/class="card card-back"/g) || []).length, 2);
        for (const opponent of game.players.slice(1)) assert.ok(app.innerHTML.includes(`${opponent.hand[0].rank}_of_spades.svg`));
        assert.match(app.innerHTML, /ace_of_clubs\.svg/);
        assert.equal(bids().length, 2);
        assert.ok(saved().players.every((p) => p.prediction === null));
        bids()[bid].click();
        // Bids lock the instant the human commits; the seats then reveal them one at a time.
        assert.equal(saved().phase, "reveal");
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
      results.push(await withApp(game, ({ bids, saved }) => {
        bids()[humanBid].click();
        return saved().players[1].prediction;
      }));
    }
  }
  assert.ok(results.every((bid) => bid === results[0]));
});

test("all other rounds retain visible-hand bidding, even with one card left during play", async () => {
  for (let round = 0; round < ROUND_SIZES.length; round++) {
    if (ROUND_SIZES[round] === 1) continue;
    await withApp(fixture(round), ({ app, bids }) => {
      assert.match(app.innerHTML, /2_of_spades\.svg/);
      assert.doesNotMatch(app.innerHTML, /card-back|Make a blind call|Opponents’ cards/);
      assert.equal(bids().length, ROUND_SIZES[round] + 1);
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
