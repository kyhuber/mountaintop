import test from "node:test";
import assert from "node:assert/strict";
import { MAX_PLAYERS, MIN_PLAYERS, createPlayers } from "../src/game.js";
import { card, fixture, withApp } from "./helpers/app-harness.js";

// Three players, trump ♠. Two cards are already on the table and the human is about to play last.
function lastToPlay() {
  const players = createPlayers(3).map((p) => ({ ...p, prediction: 1, tricks: 0 }));
  players[0].hand = [card("A♠"), card("3♥"), card("4♦")];
  players[1].hand = [card("5♣"), card("6♣")];
  players[2].hand = [card("7♣"), card("8♣")];
  return { players, round: 3, dealer: 0, leader: 1, turn: 0, phase: "play", trumpCard: card("2♠"), roundScores: [], message: "",
    plays: [{ playerIndex: 1, card: card("9♣") }, { playerIndex: 2, card: card("10♣") }] };
}

test("a completed trick waits for a tap, blocks further plays, and resumes with the winner leading", async () => {
  await withApp(lastToPlay(), ({ app, cards, saved, control }) => {
    assert.equal(cards().length, 3);
    cards()[0].click(); // A♠ trumps the trick
    let game = saved();
    assert.equal(game.phase, "trickEnd");
    assert.equal(game.plays.length, 3);
    assert.equal(game.players[0].tricks, 1);
    assert.equal(game.message, "You win the trick.");
    assert.match(app.innerHTML, /Tap to continue/);
    // Every hand card is disabled while the finished trick is on the table, and a stray tap is ignored.
    assert.equal((app.innerHTML.match(/class="card (?:black|red) disabled" disabled/g) || []).length, 2);
    cards()[0].click();
    assert.equal(saved().phase, "trickEnd");
    assert.equal(saved().plays.length, 3);
    assert.equal(saved().players[0].hand.length, 2);
    control("#felt").click();
    game = saved();
    assert.equal(game.phase, "play");
    assert.deepEqual(game.plays, []);
    assert.equal(game.turn, 0);
    assert.equal(game.leader, 0);
    assert.equal(game.message, "You lead.");
    assert.equal(cards().length, 2);
  });
});

test("a saved trick-end state resumes on the same tap prompt instead of locking up", async () => {
  const game = lastToPlay();
  game.plays.push({ playerIndex: 0, card: card("A♠") });
  game.players[0].hand = [card("3♥"), card("4♦")];
  game.players[0].tricks = 1;
  game.phase = "trickEnd";
  game.message = "You win the trick.";
  await withApp(game, ({ app, saved, control }) => {
    assert.match(app.innerHTML, /You win the trick\. <b>Tap to continue/);
    control("#felt").click();
    assert.equal(saved().phase, "play");
    assert.equal(saved().plays.length, 0);
  });
});

test("the last trick of a round scores immediately and ranks the summary by total", async () => {
  const game = lastToPlay();
  game.players[0].hand = [card("A♠")];
  game.players[1].hand = [];
  game.players[2].hand = [];
  game.players[1].score = 20;
  game.players[1].tricks = 1;
  await withApp(game, ({ app, cards, saved, control }) => {
    cards()[0].click();
    control("#felt").click();
    const result = saved();
    assert.equal(result.phase, "roundEnd");
    // Human bid 1 and took 1 (+6); Mira bid 1 and took 1 (+6); Theo bid 1 and took 0 (0).
    assert.deepEqual(result.roundScores, [6, 6, 0]);
    assert.deepEqual(result.players.map((p) => p.score), [6, 26, 0]);
    assert.ok(app.innerHTML.indexOf("<strong>Mira</strong>") < app.innerHTML.indexOf("<strong>You</strong>"));
    assert.match(app.innerHTML, /Bid 1 · 1 trick<\/span>/);
    assert.match(app.innerHTML, /Bid 1 · 0 tricks<\/span>/);
  });
});

test("bot grammar is used for computer trick winners", async () => {
  const game = lastToPlay();
  game.plays = [{ playerIndex: 1, card: card("9♣") }, { playerIndex: 2, card: card("A♣") }];
  await withApp(game, ({ cards, saved }) => {
    cards()[1].click(); // 3♥ cannot beat A♣
    assert.equal(saved().message, "Theo wins the trick.");
    assert.equal(saved().players[2].tricks, 1);
  });
});

test("malformed or stale saves fall back to the setup screen", async () => {
  const stale = [
    null,
    { players: [] },
    { ...fixture(0), phase: "deal" },
    { ...fixture(0), trumpCard: null },
    { ...fixture(0), round: 11 },
    { ...fixture(0, 4), turn: 4 },
    { ...fixture(0), players: fixture(0).players.map((p) => ({ ...p, hand: [{ id: "A♠" }] })) },
  ];
  for (const save of stale) {
    await withApp(save, ({ app, saved }) => {
      assert.match(app.innerHTML, /How many players\?/, JSON.stringify(save)?.slice(0, 60));
      assert.equal(saved(), null);
    });
  }
  const game = fixture(5, MAX_PLAYERS);
  const tooMany = { ...game, players: [...game.players, { ...game.players[1], name: "Extra" }] };
  await withApp(tooMany, ({ app }) => assert.match(app.innerHTML, /How many players\?/));
  await withApp(game, ({ app }) => assert.match(app.innerHTML, /Make a blind call/));
});

test("the setup stepper is clamped to the supported player range", async () => {
  await withApp(null, ({ control }) => {
    const count = control("#count");
    const plus = control("#plus");
    const minus = control("#minus");
    assert.equal(count.textContent, 4);
    for (let i = 0; i < 10; i += 1) plus.click();
    assert.equal(count.textContent, MAX_PLAYERS);
    assert.equal(plus.disabled, true);
    assert.equal(control("#bot-count").textContent, `${MAX_PLAYERS - 1} computer players`);
    for (let i = 0; i < 10; i += 1) minus.click();
    assert.equal(count.textContent, MIN_PLAYERS);
    assert.equal(minus.disabled, true);
    assert.equal(control("#bot-count").textContent, "1 computer player");
  });
});

test("starting a game deals the chosen table and new game clears the save", async () => {
  await withApp(null, ({ app, control, saved }) => {
    control("#plus").click();
    control("#start").click();
    const game = saved();
    assert.equal(game.players.length, 5);
    assert.equal(game.phase, "predict");
    assert.ok(game.players.every((p) => p.hand.length === 6));
    assert.match(app.innerHTML, /How many tricks\?/);
    control("#new-game").click();
    assert.equal(saved(), null);
    assert.match(app.innerHTML, /How many players\?/);
  });
});
