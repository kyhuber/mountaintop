import test from "node:test";
import assert from "node:assert/strict";
import { MAX_PLAYERS, MIN_PLAYERS, createPlayers } from "../src/game.js";
import { COACH_HINTS, STRATEGY_TIPS, bidText, blindTip, scoringRule } from "../src/text.js";
import { RETURNING_PROFILE, card, fixture, withApp } from "./helpers/app-harness.js";

const FRESH_PROFILE = {};
const COACHED_PROFILE = { ...RETURNING_PROFILE, tips: true, hintsSeen: {}, gamesStarted: 1 };

// Three players, trump ♠. Two cards are already on the table and the human is about to play last.
function lastToPlay() {
  const players = createPlayers(3).map((p) => ({ ...p, prediction: 1, tricks: 0 }));
  players[0].hand = [card("A♠"), card("3♥"), card("4♦")];
  players[1].hand = [card("5♣"), card("6♣")];
  players[2].hand = [card("7♣"), card("8♣")];
  return { players, round: 3, dealer: 0, leader: 1, turn: 0, phase: "play", trumpCard: card("2♠"), roundScores: [], message: "",
    plays: [{ playerIndex: 1, card: card("9♣") }, { playerIndex: 2, card: card("10♣") }] };
}

const seatMarkup = (html, index) => html.match(new RegExp(`<article class="player[^"]*" data-seat="${index}">[\\s\\S]*?</article>`))[0];

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

test("trick end rings the winning card, dims the rest, and grows the winner's pile", async () => {
  await withApp(lastToPlay(), ({ app, cards, control }) => {
    cards()[0].click();
    assert.equal((app.innerHTML.match(/played-card winner/g) || []).length, 1);
    assert.equal((app.innerHTML.match(/played-card dimmed/g) || []).length, 2);
    assert.ok(/played-card winner"><span>You<\/span>/.test(app.innerHTML));
    assert.equal((seatMarkup(app.innerHTML, 0).match(/<i><\/i>/g) || []).length, 1);
    assert.equal((seatMarkup(app.innerHTML, 1).match(/<i><\/i>/g) || []).length, 0);
    assert.match(seatMarkup(app.innerHTML, 0), /aria-label="1 trick won"/);
    control("#felt").click();
    assert.doesNotMatch(app.innerHTML, /played-card winner/);
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

test("the last trick of a round scores immediately and ranks the summary with tags and reasons", async () => {
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
    assert.match(app.innerHTML, /<i class="tag exact">Exact<\/i>Bid 1, took 1 · 5 \+ 1<\/span><b class="">\+6<\/b>/);
    assert.match(app.innerHTML, /<i class="tag missed">Missed<\/i>Bid 1, took 0 · 0 for tricks<\/span><b class="">0<\/b>/);
    assert.match(app.innerHTML, /style="--i:2"/);
  });
});

test("a Mountaintop that falls is announced for bots and for the human", async () => {
  const bot = lastToPlay();
  bot.players[2].prediction = 0;
  await withApp(bot, ({ app, cards, saved }) => {
    assert.match(seatMarkup(app.innerHTML, 2), /mountain-holds[\s\S]*mt-badge[\s\S]*status holds">Holds/);
    cards()[1].click(); // 3♥ cannot beat Theo's 10♣
    assert.equal(saved().message, "Theo takes the trick. Theo’s Mountaintop falls.");
    assert.match(seatMarkup(app.innerHTML, 2), /class="player mountain-fell fell-now"[\s\S]*status fell">Fell/);
    assert.doesNotMatch(seatMarkup(app.innerHTML, 1), /fell-now/);
  });
  const human = lastToPlay();
  human.players[0].prediction = 0;
  await withApp(human, ({ app, cards, saved, control }) => {
    cards()[0].click(); // A♠ wins, which is exactly what a Mountaintop caller does not want
    assert.equal(saved().message, "You take the trick. Your Mountaintop falls.");
    assert.match(app.innerHTML, /Your Mountaintop falls\. <b>Tap to continue/);
    control("#felt").click();
    // The shake is a one-render cue; the fallen badge stays.
    assert.doesNotMatch(app.innerHTML, /fell-now/);
    assert.match(seatMarkup(app.innerHTML, 0), /mountain-fell/);
  });
});

test("seats show public bid status and trick piles during play", async () => {
  const game = fixture(0, 5);
  game.phase = "play";
  game.turn = 0;
  const standings = [[2, 0, 6], [3, 3, 2], [1, 2, 2], [4, 1, 2], [0, 0, 6]];
  game.players.forEach((p, i) => { const [bid, tricks, cardsLeft] = standings[i]; p.prediction = bid; p.tricks = tricks; p.hand = p.hand.slice(0, cardsLeft); });
  await withApp(game, ({ app }) => {
    const labels = [0, 1, 2, 3, 4].map((i) => seatMarkup(app.innerHTML, i).match(/class="status (\w+)">([^<]+)</).slice(1));
    assert.deepEqual(labels, [["needs", "Needs 2"], ["at", "At bid"], ["over", "Over by 1"], ["out", "Out of reach"], ["holds", "Holds"]]);
    assert.deepEqual([0, 1, 2, 3, 4].map((i) => (seatMarkup(app.innerHTML, i).match(/<i><\/i>/g) || []).length), [0, 3, 2, 1, 0]);
  });
});

test("bids are locked at once but revealed one seat at a time", async () => {
  const game = fixture(0, 4);
  await withApp(game, async ({ app, bids, saved, tick, flush }) => {
    bids()[2].click();
    let state = saved();
    assert.equal(state.phase, "reveal");
    assert.equal(state.revealed, 0);
    assert.equal(state.message, "You bid 2. Bids are locked.");
    assert.ok(state.players.every((p) => p.prediction !== null));
    assert.equal((app.innerHTML.match(/class="pending"/g) || []).length, 3);
    assert.match(seatMarkup(app.innerHTML, 0), /Bid <b>2<\/b>/);
    assert.equal((app.innerHTML.match(/class="card (?:black|red)"\s+data-card-index/g) || []).length, 0, "no card is playable during the reveal");
    assert.doesNotMatch(app.innerHTML, /data-bid=/);
    await tick();
    state = saved();
    assert.equal(state.revealed, 1);
    assert.equal(state.message, bidText(state.players[1]));
    assert.equal((app.innerHTML.match(/class="pending"/g) || []).length, 2);
    await flush();
    state = saved();
    assert.equal(state.phase, "play");
    assert.doesNotMatch(app.innerHTML, /class="pending"/);
    const total = state.players.reduce((sum, p) => sum + p.prediction, 0);
    assert.match(state.message, new RegExp(`^Bids ${total} of 6: .*\\. You lead\\.$`));
    assert.equal(state.plays.length, 0, "the human leads, so no bot has played");
    assert.equal(state.turn, 0);
    assert.match(app.innerHTML, /class="card (?:black|red)"\s+data-card-index="0"/, "the hand is live once the reveal ends");
  });
});

test("a reload during the reveal finishes it", async () => {
  const game = fixture(0, 4);
  game.players.forEach((p, i) => { p.prediction = [2, 1, 0, 2][i]; });
  game.phase = "reveal";
  game.revealed = 1;
  await withApp(game, ({ saved }) => {
    assert.equal(saved().phase, "play");
    assert.equal(saved().message, "Bids 5 of 6: a spare trick is loose. You lead.");
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
  await withApp(null, ({ app, control, saved, profile }) => {
    control("#plus").click();
    control("#start").click();
    const game = saved();
    assert.equal(game.players.length, 5);
    assert.equal(game.phase, "predict");
    assert.ok(game.players.every((p) => p.hand.length === 6));
    assert.match(app.innerHTML, /How many tricks\?/);
    assert.equal(profile().lastPlayerCount, 5);
    assert.equal(profile().gamesStarted, 2);
    control("#new-game").click();
    assert.equal(saved(), null);
    assert.match(app.innerHTML, /How many players\?/);
  });
});

test("a first visit walks through the trailhead, takes a name, and deals a three-player table", async () => {
  await withApp(null, ({ app, control, saved, profile }) => {
    assert.match(app.innerHTML, /Welcome to Mountaintop/);
    assert.match(app.innerHTML, /The trailhead · 1 of 3/);
    assert.match(app.innerHTML, /I’ve played before/);
    control("#player-name").value = "  Kai   <3 ";
    control("#intro-next").click();
    assert.match(app.innerHTML, /The trailhead · 2 of 3[\s\S]*Example trick[\s\S]*played-card winner/);
    assert.equal(profile().name, "Kai <3");
    control("#intro-next").click();
    assert.match(app.innerHTML, /The trailhead · 3 of 3[\s\S]*Mountaintop held · \+6[\s\S]*Deal me in/);
    control("#intro-next").click();
    assert.equal(profile().seenIntro, true);
    assert.match(app.innerHTML, /How many players\?/);
    assert.equal(control("#count").textContent, 3);
    assert.match(app.innerHTML, /value="Kai &lt;3"/);
    control("#start").click();
    const game = saved();
    assert.equal(game.players.length, 3);
    assert.equal(game.players[0].name, "Kai <3");
    assert.match(app.innerHTML, /<div class="avatar">K<\/div>\s*<div class="player-info"><strong>Kai &lt;3<\/strong>/);
    assert.doesNotMatch(app.innerHTML, /<strong>Kai <3/);
    assert.equal(profile().gamesStarted, 1);
    assert.equal(profile().lastPlayerCount, 3);
  }, { profile: FRESH_PROFILE });
});

test("experienced players can skip the trailhead, and the default table remembers the last count", async () => {
  await withApp(null, ({ app, control, profile }) => {
    control("#intro-skip").click();
    assert.equal(profile().seenIntro, true);
    assert.match(app.innerHTML, /How many players\?/);
    assert.equal(control("#count").textContent, 3);
  }, { profile: FRESH_PROFILE });
  await withApp(null, ({ control }) => {
    assert.equal(control("#count").textContent, 5);
  }, { profile: { ...RETURNING_PROFILE, gamesStarted: 2, lastPlayerCount: 5 } });
});

test("the human is addressed as you in headlines and messages even when named", async () => {
  const game = fixture(10, 3);
  game.phase = "gameEnd";
  game.players[0].name = "Kai";
  game.players.forEach((p, i) => { p.hand = []; p.prediction = 1; p.tricks = 1; p.score = [30, 10, 5][i]; });
  game.roundScores = [6, 6, 6];
  await withApp(game, ({ app }) => {
    assert.match(app.innerHTML, /<h2 id="summary-title">You reached the summit!<\/h2>/);
    assert.match(app.innerHTML, /<strong>Kai<\/strong>/);
  });
  const play = lastToPlay();
  play.players[0].name = "Kai";
  await withApp(play, ({ cards, saved }) => {
    cards()[0].click();
    assert.equal(saved().message, "You win the trick.");
  });
});

test("the pace setting is remembered", async () => {
  await withApp(null, ({ all, profile }) => {
    assert.equal(profile().pace, "relaxed");
    all("pace").find((button) => button.dataset.pace === "brisk").click();
    assert.equal(profile().pace, "brisk");
  });
});

test("coach hints appear once each during a coached game and can be dismissed", async () => {
  const leading = lastToPlay();
  leading.plays = [];
  leading.leader = 0;
  await withApp(leading, ({ app, all, profile }) => {
    assert.ok(app.innerHTML.includes(COACH_HINTS.play));
    all("hint")[0].click();
    assert.doesNotMatch(app.innerHTML, /class="coach"/);
    assert.equal(profile().hintsSeen.play, true);
  }, { profile: COACHED_PROFILE });
  await withApp(lastToPlay(), ({ app, cards, profile }) => {
    assert.ok(app.innerHTML.includes(COACH_HINTS.lastToPlay));
    assert.match(app.innerHTML, /class="card black wins"\s+data-card-index="0" aria-label="ace of spades \(would win the trick\)"/);
    assert.doesNotMatch(app.innerHTML, /red wins/);
    cards()[0].click();
    assert.ok(app.innerHTML.includes(COACH_HINTS.trickEnd));
    assert.deepEqual(profile().hintsSeen, { play: true, lastToPlay: true });
  }, { profile: COACHED_PROFILE });
  const ending = lastToPlay();
  ending.players[0].hand = [card("A♠")];
  ending.players[1].hand = [];
  ending.players[2].hand = [];
  await withApp(ending, ({ app, cards, control, profile }) => {
    cards()[0].click();
    control("#felt").click();
    assert.ok(app.innerHTML.includes(COACH_HINTS.summary));
    assert.ok(app.innerHTML.includes(scoringRule()));
    assert.equal(profile().hintsSeen.trickEnd, true);
    control("#continue").click();
    assert.equal(profile().hintsSeen.summary, true);
  }, { profile: COACHED_PROFILE });
  // With tips off nothing is coached and no card is marked.
  await withApp(lastToPlay(), ({ app }) => {
    assert.doesNotMatch(app.innerHTML, /class="coach"|wins/);
  });
});

test("trail tips rotate through the first bids of a first game only", async () => {
  await withApp(fixture(0, 3), ({ app }) => assert.ok(app.innerHTML.includes(STRATEGY_TIPS.find((t) => t.id === "small-table").text)), { profile: COACHED_PROFILE });
  await withApp(fixture(0, 4), ({ app }) => assert.ok(app.innerHTML.includes(STRATEGY_TIPS.find((t) => t.id === "suits").text)), { profile: COACHED_PROFILE });
  await withApp(fixture(2, 4), ({ app }) => assert.ok(app.innerHTML.includes(STRATEGY_TIPS.find((t) => t.id === "small-table").text)), { profile: COACHED_PROFILE });
  await withApp(fixture(3, 4), ({ app }) => assert.doesNotMatch(app.innerHTML, /Trail tip/), { profile: COACHED_PROFILE });
  await withApp(fixture(5, 4), ({ app }) => assert.ok(app.innerHTML.includes(blindTip())), { profile: COACHED_PROFILE });
  await withApp(fixture(0, 3), ({ app }) => assert.doesNotMatch(app.innerHTML, /Trail tip/), { profile: { ...COACHED_PROFILE, gamesStarted: 2 } });
  await withApp(fixture(0, 3), ({ app }) => assert.doesNotMatch(app.innerHTML, /Trail tip/));
});

test("the rules modal opens in-game and its tips toggle resets the coaching", async () => {
  const game = lastToPlay();
  await withApp(game, ({ app, control, profile }) => {
    control("#help").click();
    assert.match(app.innerHTML, /id="rules-modal"[\s\S]*How to play[\s\S]*id="tips-toggle"/);
    assert.doesNotMatch(app.innerHTML, /id="tips-toggle" checked/);
    const toggle = control("#tips-toggle");
    toggle.checked = true;
    toggle.trigger("change");
    assert.equal(profile().tips, true);
    assert.deepEqual(profile().hintsSeen, {});
    control("#rules-modal").querySelector(".close");
  }, { profile: { ...RETURNING_PROFILE, hintsSeen: { play: true } } });
});
