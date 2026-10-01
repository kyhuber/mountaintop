import {
  ROUND_SIZES,
  MIN_PLAYERS,
  MAX_PLAYERS,
  MOUNTAINTOP_POINTS,
  createDeck,
  createPlayers,
  shuffle,
  sortHand,
  legalCards,
  trickWinner,
  scoreRound,
  estimatePrediction,
  estimateBlindPrediction,
  chooseBotCard,
  leadText,
  winText,
  playText,
  bidStatus,
  mountainJustFell,
} from "./game.js";
import {
  COACH_HINTS,
  bidText,
  bidsSummary,
  blindTip,
  fallText,
  mountainRule,
  pointsText,
  rulesSections,
  scoreReason,
  scoringRule,
  strategyTip,
  trailhead,
} from "./text.js";
import { collectTrick, flyIn, rectOf } from "./motion.js";

const app = document.querySelector("#app");
// Bump a suffix whenever the saved shape changes so stale saves are discarded instead of crashing.
const SAVE_KEY = "mountaintop-game-v2";
const PROFILE_KEY = "mountaintop-profile-v1";
const PHASES = new Set(["predict", "reveal", "play", "trickEnd", "roundEnd", "gameEnd"]);
const PACES = {
  relaxed: { label: "Relaxed", bot: 1000, reveal: 520, fly: 320, collect: 420 },
  brisk: { label: "Brisk", bot: 450, reveal: 220, fly: 180, collect: 240 },
};
const DEFAULT_PROFILE = { name: "", seenIntro: false, tips: true, hintsSeen: {}, pace: "relaxed", gamesStarted: 0, lastPlayerCount: 3 };
const NAME_LIMIT = 14;
const FIRST_GAME_PLAYERS = 3;

let profile = loadProfile();
let state = loadGame();
let timerToken = 0;
let introStep = 0;
// A one-render visual cue (such as a Mountaintop falling) that is not part of the saved state.
let lastEvent = null;

const suitName = { "♠": "spades", "♥": "hearts", "♦": "diamonds", "♣": "clubs" };
const rankName = { A: "ace", J: "jack", Q: "queen", K: "king" };
const isRed = (suit) => suit === "♥" || suit === "♦";

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

export function sanitizeName(value) {
  return String(value ?? "").replace(/[\p{C}]/gu, "").replace(/\s+/g, " ").trim().slice(0, NAME_LIMIT);
}

// Resolves with false when a newer action (new game, reload) has cancelled the wait.
function wait(ms) {
  const token = ++timerToken;
  return new Promise((resolve) => setTimeout(() => resolve(token === timerToken), ms));
}

function pace() {
  return PACES[profile.pace] ?? PACES.relaxed;
}

/* ---------- Persistence ---------- */

function isCard(card) {
  return Boolean(card) && typeof card.id === "string" && typeof card.suit === "string" && Number.isInteger(card.value);
}

function isValidSave(saved) {
  if (!saved || typeof saved !== "object" || !PHASES.has(saved.phase)) return false;
  if (!Number.isInteger(saved.round) || saved.round < 0 || saved.round >= ROUND_SIZES.length) return false;
  if (!Array.isArray(saved.players) || saved.players.length < MIN_PLAYERS || saved.players.length > MAX_PLAYERS) return false;
  if (!saved.players[0]?.human || !saved.players.every((p) => typeof p.name === "string" && Array.isArray(p.hand) && p.hand.every(isCard) && Number.isInteger(p.score))) return false;
  if (!isCard(saved.trumpCard) || !Array.isArray(saved.plays) || !saved.plays.every((play) => isCard(play.card) && Number.isInteger(play.playerIndex))) return false;
  const count = saved.players.length;
  return [saved.dealer, saved.leader, saved.turn].every((index) => Number.isInteger(index) && index >= 0 && index < count);
}

function loadGame() {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (!isValidSave(saved)) return null;
    // A reload in the middle of the bid reveal simply finishes the reveal.
    if (saved.phase === "reveal") completeReveal(saved);
    return saved;
  } catch {
    return null;
  }
}

function saveGame() {
  try {
    if (state) localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    else localStorage.removeItem(SAVE_KEY);
  } catch {
    // Private browsing or a full quota: the game still plays, it just will not resume.
  }
}

function loadProfile() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(PROFILE_KEY)) ?? {};
  } catch {
    saved = {};
  }
  const merged = { ...DEFAULT_PROFILE, ...(typeof saved === "object" && saved ? saved : {}) };
  return {
    name: sanitizeName(merged.name),
    seenIntro: Boolean(merged.seenIntro),
    tips: Boolean(merged.tips),
    hintsSeen: merged.hintsSeen && typeof merged.hintsSeen === "object" ? merged.hintsSeen : {},
    pace: merged.pace in PACES ? merged.pace : DEFAULT_PROFILE.pace,
    gamesStarted: Number.isInteger(merged.gamesStarted) && merged.gamesStarted >= 0 ? merged.gamesStarted : 0,
    lastPlayerCount: Number.isInteger(merged.lastPlayerCount) && merged.lastPlayerCount >= MIN_PLAYERS && merged.lastPlayerCount <= MAX_PLAYERS ? merged.lastPlayerCount : DEFAULT_PROFILE.lastPlayerCount,
  };
}

function saveProfile() {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {
    // Same as saveGame: preferences simply will not persist.
  }
}

function humanName() {
  return profile.name || "You";
}

function tipsOn() {
  return profile.tips;
}

function firstGame() {
  return profile.gamesStarted <= 1;
}

function hintPending(key) {
  return tipsOn() && !profile.hintsSeen[key];
}

function markHint(...keys) {
  let changed = false;
  for (const key of keys) {
    if (!profile.hintsSeen[key]) { profile.hintsSeen[key] = true; changed = true; }
  }
  if (changed) saveProfile();
}

/* ---------- Game flow ---------- */

function newGame(playerCount) {
  const players = createPlayers(playerCount);
  players[0].name = humanName();
  profile.gamesStarted += 1;
  profile.lastPlayerCount = playerCount;
  saveProfile();
  state = {
    players,
    round: 0,
    dealer: Math.floor(Math.random() * playerCount),
    phase: "deal",
    trumpCard: null,
    plays: [],
    leader: 0,
    turn: 0,
    revealed: 0,
    message: "",
    roundScores: [],
  };
  startRound();
}

function startRound() {
  const handSize = ROUND_SIZES[state.round];
  const deck = shuffle(createDeck());
  state.players.forEach((player) => {
    player.hand = deck.splice(0, handSize);
    player.prediction = null;
    player.tricks = 0;
  });
  state.trumpCard = deck.shift();
  state.players.forEach((player) => { player.hand = sortHand(player.hand, state.trumpCard.suit); });
  state.plays = [];
  state.revealed = 0;
  state.leader = (state.dealer + 1) % state.players.length;
  state.turn = state.leader;
  state.phase = "predict";
  state.message = handSize === 1 ? "Blind round: predict without seeing your card." : "Choose how many tricks you’ll take.";
  render();
}

async function makePredictions(humanBid) {
  if (state.phase !== "predict" || !Number.isInteger(humanBid) || humanBid < 0 || humanBid > ROUND_SIZES[state.round]) return;
  const blindRound = ROUND_SIZES[state.round] === 1;
  const predictions = state.players.map((player, index) => {
    if (index === 0) return humanBid;
    if (blindRound) return estimateBlindPrediction({
      visiblePlays: state.players.flatMap((other, otherIndex) => otherIndex === index ? [] : [{ playerIndex: otherIndex, card: other.hand[0] }]),
      playerIndex: index,
      leader: state.leader,
      trumpCard: state.trumpCard,
    });
    return estimatePrediction(player.hand, state.trumpCard.suit, state.players.length, state.dealer === index);
  });
  state.players.forEach((player, index) => { player.prediction = predictions[index]; });
  // Bids are locked at once but shown one seat at a time, like turning over cards at the table.
  state.phase = "reveal";
  state.revealed = 0;
  state.message = humanBid === 0 ? "You call Mountaintop. Bids are locked." : `You bid ${humanBid}. Bids are locked.`;
  render();
  for (let index = 1; index < state.players.length; index += 1) {
    if (!(await wait(pace().reveal))) return;
    state.revealed = index;
    state.message = bidText(state.players[index]);
    render();
  }
  if (!(await wait(pace().reveal))) return;
  completeReveal(state);
  render();
  if (await wait(pace().bot)) runBotTurns();
}

function completeReveal(game) {
  const totalBids = game.players.reduce((total, player) => total + player.prediction, 0);
  game.phase = "play";
  game.revealed = game.players.length - 1;
  game.message = `${bidsSummary(totalBids, ROUND_SIZES[game.round])} ${leadText(game.players[game.leader])}.`;
}

function humanPlay(index) {
  if (state.phase !== "play" || state.turn !== 0 || state.plays.length >= state.players.length) return;
  const card = state.players[0].hand[index];
  const legal = legalCards(state.players[0].hand, state.plays[0]?.card.suit);
  if (!card || !legal.includes(card)) return;
  markHint("play", ...(state.plays.length === state.players.length - 1 ? ["lastToPlay"] : []));
  playCard(0, card);
}

function playCard(playerIndex, card) {
  const player = state.players[playerIndex];
  const from = rectOf(playerIndex === 0
    ? document.querySelector(`[data-card-index="${player.hand.indexOf(card)}"]`)
    : document.querySelector(`[data-seat="${playerIndex}"] .avatar`));
  player.hand.splice(player.hand.indexOf(card), 1);
  state.plays.push({ playerIndex, card });
  state.message = playText(player, card);
  state.turn = (state.turn + 1) % state.players.length;
  if (state.plays.length === state.players.length) finishTrick();
  else {
    render();
    runBotTurns();
  }
  flyIn(document.querySelector(".table-center .played-card:last-child .card"), from, pace().fly);
}

async function runBotTurns() {
  if (state.phase !== "play" || state.turn === 0 || state.plays.length >= state.players.length) return;
  const index = state.turn;
  if (!(await wait(pace().bot))) return;
  if (state.phase !== "play" || state.turn !== index) return;
  const player = state.players[index];
  const card = chooseBotCard({ hand: player.hand, plays: state.plays, trumpSuit: state.trumpCard.suit, prediction: player.prediction, tricks: player.tricks });
  playCard(index, card);
}

// The completed trick stays on the table until the player taps, so nothing can be missed and a reload here simply resumes.
function finishTrick() {
  const winner = trickWinner(state.plays, state.trumpCard.suit);
  const player = state.players[winner.playerIndex];
  player.tricks += 1;
  state.leader = winner.playerIndex;
  state.turn = winner.playerIndex;
  state.phase = "trickEnd";
  if (mountainJustFell(player)) {
    lastEvent = { type: "fall", playerIndex: winner.playerIndex };
    state.message = fallText(player);
  } else {
    state.message = `${winText(player)}.`;
  }
  render();
}

function continueAfterTrick() {
  if (state.phase !== "trickEnd") return;
  markHint("trickEnd");
  const cards = Array.from(document.querySelectorAll(".table-center .played-card .card")).map(rectOf).filter(Boolean);
  const winnerIndex = state.leader;
  state.plays = [];
  if (state.players.every((player) => player.hand.length === 0)) {
    finishRound();
    return;
  }
  state.phase = "play";
  state.message = `${leadText(state.players[state.leader])}.`;
  render();
  collectTrick(cards, rectOf(document.querySelector(`[data-seat="${winnerIndex}"] .pile`)), pace().collect);
  runBotTurns();
}

function finishRound() {
  state.roundScores = state.players.map((player) => {
    const points = scoreRound(player.prediction, player.tricks);
    player.score += points;
    return points;
  });
  state.phase = state.round === ROUND_SIZES.length - 1 ? "gameEnd" : "roundEnd";
  state.message = "Round complete.";
  render();
}

function nextRound() {
  markHint("summary");
  if (state.phase === "gameEnd") { state = null; render(); return; }
  state.round += 1;
  state.dealer = (state.dealer + 1) % state.players.length;
  startRound();
}

/* ---------- Markup ---------- */

function cardMarkup(card, options = {}) {
  const classes = ["card", isRed(card.suit) ? "red" : "black", options.small ? "small" : "", options.disabled ? "disabled" : "", options.wins ? "wins" : ""].filter(Boolean).join(" ");
  const tag = options.displayOnly ? "span" : "button";
  const label = `${rankName[card.rank] || card.rank} of ${suitName[card.suit]}`;
  const artwork = new URL(`./cards/${label.replaceAll(" ", "_")}.svg`, import.meta.url).href;
  return `<${tag} class="${classes}" ${options.displayOnly ? 'role="img"' : options.disabled ? "disabled" : ""} ${!options.displayOnly && options.index != null ? `data-card-index="${options.index}"` : ""} aria-label="${label}${options.wins ? " (would win the trick)" : ""}">
    <img class="card-art" src="${artwork}" alt="" draggable="false" />
  </${tag}>`;
}

function hiddenCardMarkup() {
  return '<span class="card card-back" role="img" aria-label="Your card is hidden until all bids are locked"><span aria-hidden="true">▲</span></span>';
}

function bidLabel(prediction) {
  return prediction == null ? "–" : prediction === 0 ? "M" : prediction;
}

function pileMarkup(player) {
  const tricks = player.tricks ?? 0;
  return `<div class="pile" aria-label="${tricks} trick${tricks === 1 ? "" : "s"} won">${"<i></i>".repeat(tricks)}</div>`;
}

function playerMarkup(player, index) {
  const active = state.phase === "play" && state.turn === index;
  const dealer = state.dealer === index;
  const revealed = state.phase !== "reveal" || index === 0 || index <= state.revealed;
  const status = revealed ? bidStatus(player, player.hand.length) : null;
  const mountain = revealed && player.prediction === 0;
  const fellNow = lastEvent?.type === "fall" && lastEvent.playerIndex === index;
  const classes = ["player", active ? "active" : "", player.human ? "human-seat" : "", mountain ? (player.tricks ? "mountain-fell" : "mountain-holds") : "", fellNow ? "fell-now" : ""].filter(Boolean).join(" ");
  const bid = revealed ? bidLabel(player.prediction) : '<span class="pending" aria-label="bid hidden">…</span>';
  return `<article class="${classes}" data-seat="${index}">
    <div class="avatar">${escapeHtml(player.name[0].toUpperCase())}${mountain ? '<span class="mt-badge" aria-hidden="true">▲</span>' : ""}</div>
    <div class="player-info"><strong>${escapeHtml(player.name)}</strong><span>${player.score} pts</span></div>
    ${dealer ? '<span class="dealer" title="Dealer">D</span>' : ""}
    <div class="player-stats ${status ? "has-status" : ""}"><span>Bid <b>${bid}</b></span>${status ? `<span class="status ${status.key}">${status.label}</span>` : `<span>Tricks <b>${player.tricks ?? 0}</b></span>`}</div>
    ${pileMarkup(player)}
  </article>`;
}

function nameFieldMarkup() {
  return `<label class="field-label" for="player-name">Your name</label>
    <input id="player-name" class="name-field" type="text" maxlength="${NAME_LIMIT}" autocomplete="nickname" placeholder="Optional" value="${escapeHtml(profile.name)}" />`;
}

function trailheadMarkup() {
  const cards = trailhead();
  const step = Math.min(introStep, cards.length - 1);
  const { title, body } = cards[step];
  const last = step === cards.length - 1;
  const trump = createDeck().find((card) => card.id === "3♠");
  const demo = ["9♥", "Q♥", "3♠"].map((id) => createDeck().find((card) => card.id === id));
  const examples = [[2, 2], [2, 3], [0, 0], [0, 1]].map(([bid, tricks]) => {
    const reason = scoreReason(bid, tricks);
    return `<div><i class="tag ${reason.key}">${reason.tag}</i><span>${reason.detail}</span><b class="${scoreRound(bid, tricks) < 0 ? "negative" : ""}">${pointsText(scoreRound(bid, tricks))}</b></div>`;
  }).join("");
  return `<section class="setup-screen trailhead">
    <div class="brand-mark">▲</div>
    <p class="eyebrow">The trailhead · ${step + 1} of ${cards.length}</p>
    <div class="setup-card intro-card" role="group" aria-labelledby="intro-title">
      <h2 id="intro-title">${title}</h2>
      <p class="intro-body">${body}</p>
      ${step === 0 ? nameFieldMarkup() : ""}
      ${step === 1 ? `<div class="demo-trick" aria-label="Example trick">${demo.map((card, i) => `<div class="played-card ${i === 2 ? "winner" : "dimmed"}"><span>${["Mira", "Theo", "You"][i]}</span>${cardMarkup(card, { small: true, displayOnly: true })}</div>`).join("")}</div><p class="demo-caption">Trump is ${trump.suit}: the ${trump.rank}${trump.suit} beats both hearts.</p>` : ""}
      ${step === 2 ? `<div class="score-table examples">${examples}</div>` : ""}
      <button class="primary" id="intro-next">${last ? "Deal me in" : "Next"} <span>→</span></button>
      ${step === 0 ? '<button class="text-button" id="intro-skip">I’ve played before</button>' : ""}
    </div>
    <div class="dots" aria-hidden="true">${cards.map((_, i) => `<i class="${i === step ? "on" : ""}"></i>`).join("")}</div>
  </section>`;
}

function setupMarkup() {
  const count = profile.gamesStarted === 0 ? FIRST_GAME_PLAYERS : profile.lastPlayerCount;
  return `<section class="setup-screen">
    <div class="brand-mark">▲</div>
    <p class="eyebrow">A Huber Brothers game</p>
    <h1>Mountaintop</h1>
    <p class="intro">Climb carefully. Call your tricks, play your hand, and risk it all on the Mountaintop.</p>
    <div class="setup-card">
      ${nameFieldMarkup()}
      <label class="setup-label" for="count">How many players?</label>
      <div class="stepper"><button id="minus" aria-label="Fewer players">−</button><output id="count">${count}</output><button id="plus" aria-label="More players">+</button></div>
      <p>You’ll play against <span id="bot-count">${count - 1} computer player${count === 2 ? "" : "s"}</span>.</p>
      <div class="segmented" role="group" aria-label="Pace">${Object.entries(PACES).map(([key, { label }]) => `<button data-pace="${key}" aria-pressed="${profile.pace === key}">${label}</button>`).join("")}</div>
      <button class="primary" id="start">Deal the cards <span>→</span></button>
    </div>
    <button class="text-button" id="rules-button">How to play</button>
  </section>`;
}

function tableCenterMarkup() {
  if (state.plays.length) {
    const winner = state.phase === "trickEnd" ? trickWinner(state.plays, state.trumpCard.suit) : null;
    return state.plays.map((play) => `<div class="played-card ${winner ? (winner.playerIndex === play.playerIndex ? "winner" : "dimmed") : ""}"><span>${escapeHtml(state.players[play.playerIndex].name)}</span>${cardMarkup(play.card, { small: true })}</div>`).join("");
  }
  return `<div class="empty-trick"><span>♠</span><p>${state.phase === "predict" || state.phase === "reveal" ? "Predictions first" : "Waiting for the lead"}</p></div>`;
}

function coachMarkup(key, text) {
  return `<aside class="coach" role="note"><span aria-hidden="true">▲</span><p>${text}</p><button class="coach-dismiss" data-hint="${key}">Got it</button></aside>`;
}

function playCoachMarkup(humanTurn, lastToPlay) {
  if (state.phase === "trickEnd" && hintPending("trickEnd")) return coachMarkup("trickEnd", COACH_HINTS.trickEnd);
  if (humanTurn && lastToPlay && hintPending("lastToPlay")) return coachMarkup("lastToPlay", COACH_HINTS.lastToPlay);
  if (humanTurn && hintPending("play")) return coachMarkup("play", COACH_HINTS.play);
  return "";
}

function bidPanelMarkup(human, blindBid, roundLabel) {
  const predictionOptions = Array.from({ length: human.hand.length + 1 }, (_, i) => `<button class="bid ${i === 0 ? "mountain-bid" : ""}" data-bid="${i}">${i === 0 ? "<span>▲</span> Mountaintop" : i}</button>`).join("");
  const tip = tipsOn() && firstGame() ? (blindBid ? { text: blindTip() } : strategyTip(state.round, state.players.length)) : null;
  return `<div class="modal-backdrop bid-backdrop"><section class="bid-panel" role="dialog" aria-modal="true" aria-labelledby="bid-title">
      <p class="eyebrow">Make your prediction · ${roundLabel}</p>
      <h2 id="bid-title">${blindBid ? "Make a blind call" : "How many tricks?"}</h2>
      <p>${blindBid ? "Your card is hidden. Study your opponents’ cards and trump, then make your call." : "Review your hand and trump, then choose your bid."}</p>
      <div class="bid-trump">${cardMarkup(state.trumpCard, { small: true, displayOnly: true })}<div><h3>Trump: ${suitName[state.trumpCard.suit]}</h3><p>${state.trumpCard.suit} beats every other suit.</p></div></div>
      ${blindBid ? `<h3 id="visible-cards-label">Opponents’ cards</h3><div class="blind-opponents" role="group" aria-labelledby="visible-cards-label">${state.players.slice(1).map((player) => `<div class="blind-opponent"><span>${escapeHtml(player.name)}</span>${cardMarkup(player.hand[0], { displayOnly: true })}</div>`).join("")}</div><p class="blind-lead">${leadText(state.players[state.leader])} the trick. Bids are revealed together.</p>` : ""}
      <h3 id="bid-hand-label">${blindBid ? "Your card · hidden until bids are locked" : "Your hand"}</h3>
      <div class="bid-hand" role="group" aria-labelledby="bid-hand-label">${blindBid ? hiddenCardMarkup() : human.hand.map((card) => cardMarkup(card, { displayOnly: true })).join("")}</div>
      ${tip ? `<p class="trail-tip"><b>Trail tip</b> ${tip.text}</p>` : ""}
      <div class="bid-options">${predictionOptions}</div>
      <small>${scoringRule()} <b>${mountainRule()}</b></small>
    </section></div>`;
}

function gameMarkup() {
  const human = state.players[0];
  const blindBid = state.phase === "predict" && ROUND_SIZES[state.round] === 1;
  const humanTurn = state.phase === "play" && state.turn === 0 && state.plays.length < state.players.length;
  const lastToPlay = humanTurn && state.plays.length === state.players.length - 1;
  const legalIds = new Set(humanTurn ? legalCards(human.hand, state.plays[0]?.card.suit).map((card) => card.id) : []);
  const winningIds = new Set(lastToPlay && tipsOn()
    ? human.hand.filter((card) => legalIds.has(card.id) && trickWinner([...state.plays, { card, playerIndex: 0 }], state.trumpCard.suit).playerIndex === 0).map((card) => card.id)
    : []);
  const opponents = state.players.slice(1).map((player, i) => playerMarkup(player, i + 1)).join("");
  const roundLabel = `Round ${state.round + 1} of ${ROUND_SIZES.length}`;
  const trickEnd = state.phase === "trickEnd";

  return `<div class="game-shell">
    <header><div class="logo"><span>▲</span><div><b>Mountaintop</b><small>Huber Brothers</small></div></div><div class="round-progress"><span>${roundLabel}</span><div>${ROUND_SIZES.map((_, i) => `<i class="${i <= state.round ? "done" : ""}"></i>`).join("")}</div></div><div class="header-actions"><button class="icon-button" id="help" aria-label="How to play">?</button><button class="icon-button" id="new-game" aria-label="New game">↻</button></div></header>
    <section class="opponents">${opponents}</section>
    <section class="felt ${trickEnd ? "tappable" : ""}" ${trickEnd ? 'id="felt"' : ""}>
      <div class="trump"><span>Trump</span>${cardMarkup(state.trumpCard, { small: true })}</div>
      <div class="table-center">${tableCenterMarkup()}</div>
      ${trickEnd
        ? `<button class="status-pill continue-pill" id="continue-trick">${state.message} <b>Tap to continue →</b></button>`
        : `<div class="status-pill" role="status">${state.message}</div>`}
    </section>
    ${playCoachMarkup(humanTurn, lastToPlay)}
    ${playerMarkup(human, 0)}
    <section class="hand" aria-label="Your hand">${blindBid ? hiddenCardMarkup() : human.hand.map((card, index) => cardMarkup(card, { index, disabled: !legalIds.has(card.id), wins: winningIds.has(card.id) })).join("")}</section>
    ${state.phase === "predict" ? bidPanelMarkup(human, blindBid, roundLabel) : ""}
    ${state.phase === "roundEnd" || state.phase === "gameEnd" ? summaryMarkup() : ""}
  </div>`;
}

function summaryMarkup() {
  const isEnd = state.phase === "gameEnd";
  const ranked = state.players.map((player, index) => ({ player, points: state.roundScores[index] })).sort((a, b) => b.player.score - a.player.score);
  const high = ranked[0].player.score;
  const winners = ranked.filter(({ player }) => player.score === high).map(({ player }) => (player.human ? "You" : player.name));
  const rows = ranked.map(({ player, points }, i) => {
    const reason = scoreReason(player.prediction, player.tricks);
    return `<div style="--i:${i}"><strong>${escapeHtml(player.name)}</strong><span><i class="tag ${reason.key}">${reason.tag}</i>${reason.detail}</span><b class="${points < 0 ? "negative" : ""}">${pointsText(points)}</b><em>${player.score} total</em></div>`;
  }).join("");
  return `<div class="modal-backdrop"><section class="score-panel" role="dialog" aria-modal="true" aria-labelledby="summary-title">
    <span class="panel-icon">${isEnd ? "◆" : "✓"}</span><p class="eyebrow">${isEnd ? "Journey complete" : `Round ${state.round + 1} complete`}</p>
    <h2 id="summary-title">${isEnd ? `${escapeHtml(winners.join(" & "))} ${winners.length > 1 ? "share the summit" : "reached the summit"}!` : "The cards are in"}</h2>
    <div class="score-table">${rows}</div>
    ${!isEnd && hintPending("summary") ? `<p class="trail-tip"><b>Trail tip</b> ${COACH_HINTS.summary}</p>` : ""}
    <button class="primary" id="continue">${isEnd ? "Play again" : "Next round"} <span>→</span></button>
  </section></div>`;
}

function rulesMarkup() {
  return `<div class="modal-backdrop" id="rules-modal"><section class="rules-panel" role="dialog" aria-modal="true" aria-labelledby="rules-title"><button class="close" aria-label="Close">×</button><p class="eyebrow">The trail guide</p><h2 id="rules-title">How to play</h2>${rulesSections().map(({ title, body }) => `<h3>${title}</h3><p>${body}</p>`).join("")}<label class="tips-toggle"><input type="checkbox" id="tips-toggle" ${profile.tips ? "checked" : ""} /> Show trail tips and coach hints while I play</label></section></div>`;
}

/* ---------- Rendering & events ---------- */

function render() {
  saveGame();
  app.innerHTML = state ? gameMarkup() : profile.seenIntro ? setupMarkup() : trailheadMarkup();
  lastEvent = null;
  bindEvents();
  // Move focus into whichever control the player needs next so keyboard and screen-reader users are not stranded.
  document.querySelector(".bid-panel [data-bid], #continue-trick, #continue, #intro-next")?.focus({ preventScroll: true });
}

function readName() {
  const field = document.querySelector("#player-name");
  if (!field) return;
  const name = sanitizeName(field.value);
  if (name !== profile.name) { profile.name = name; saveProfile(); }
}

function openRules() {
  app.insertAdjacentHTML("beforeend", rulesMarkup());
  const modal = document.querySelector("#rules-modal");
  const close = () => { modal.remove(); document.removeEventListener("keydown", onKey); document.querySelector("#rules-button, #help")?.focus(); };
  const onKey = (event) => { if (event.key === "Escape") close(); };
  modal.querySelector(".close").addEventListener("click", close);
  modal.addEventListener("click", (event) => { if (event.target === modal) close(); });
  modal.querySelector("#tips-toggle")?.addEventListener("change", (event) => {
    profile.tips = Boolean(event.target.checked);
    // Turning tips back on starts the coaching over.
    if (profile.tips) profile.hintsSeen = {};
    saveProfile();
  });
  document.addEventListener("keydown", onKey);
  modal.querySelector(".close").focus();
}

function bindEvents() {
  document.querySelector("#new-game")?.addEventListener("click", () => { if (confirm("Leave this game and start over?")) { timerToken += 1; state = null; render(); } });
  document.querySelector("#help")?.addEventListener("click", openRules);
  document.querySelectorAll("[data-bid]").forEach((button) => button.addEventListener("click", () => makePredictions(Number(button.dataset.bid))));
  document.querySelectorAll("[data-card-index]").forEach((button) => button.addEventListener("click", () => humanPlay(Number(button.dataset.cardIndex))));
  document.querySelectorAll("[data-hint]").forEach((button) => button.addEventListener("click", () => { markHint(button.dataset.hint); render(); }));
  document.querySelector("#continue")?.addEventListener("click", nextRound);
  document.querySelector("#felt")?.addEventListener("click", continueAfterTrick);
  if (state) return;

  document.querySelector("#intro-next")?.addEventListener("click", () => {
    readName();
    if (introStep >= trailhead().length - 1) { profile.seenIntro = true; saveProfile(); }
    else introStep += 1;
    render();
  });
  document.querySelector("#intro-skip")?.addEventListener("click", () => { readName(); profile.seenIntro = true; saveProfile(); render(); });
  if (!profile.seenIntro) return;

  let count = profile.gamesStarted === 0 ? FIRST_GAME_PLAYERS : profile.lastPlayerCount;
  const update = () => {
    document.querySelector("#count").textContent = count;
    document.querySelector("#bot-count").textContent = `${count - 1} computer player${count === 2 ? "" : "s"}`;
    document.querySelector("#minus").disabled = count <= MIN_PLAYERS;
    document.querySelector("#plus").disabled = count >= MAX_PLAYERS;
  };
  document.querySelector("#minus").addEventListener("click", () => { count = Math.max(MIN_PLAYERS, count - 1); update(); });
  document.querySelector("#plus").addEventListener("click", () => { count = Math.min(MAX_PLAYERS, count + 1); update(); });
  document.querySelectorAll("[data-pace]").forEach((button) => button.addEventListener("click", () => {
    profile.pace = button.dataset.pace in PACES ? button.dataset.pace : profile.pace;
    saveProfile();
    document.querySelectorAll("[data-pace]").forEach((other) => other.setAttribute?.("aria-pressed", String(other.dataset.pace === profile.pace)));
  }));
  document.querySelector("#start").addEventListener("click", () => { readName(); newGame(count); });
  document.querySelector("#rules-button").addEventListener("click", openRules);
  update();
}

render();
if (state?.phase === "play") runBotTurns();
