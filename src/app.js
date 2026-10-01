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
} from "./game.js";

const app = document.querySelector("#app");
// Bump the suffix whenever the saved shape changes so stale saves are discarded instead of crashing.
const SAVE_KEY = "mountaintop-game-v2";
const PHASES = new Set(["predict", "play", "trickEnd", "roundEnd", "gameEnd"]);
const BOT_DELAY = 650;
let state = loadGame();
let timerToken = 0;

const suitName = { "♠": "spades", "♥": "hearts", "♦": "diamonds", "♣": "clubs" };
const rankName = { A: "ace", J: "jack", Q: "queen", K: "king" };
const isRed = (suit) => suit === "♥" || suit === "♦";

// Resolves with false when a newer action (new game, reload) has cancelled the wait.
function wait(ms) {
  const token = ++timerToken;
  return new Promise((resolve) => setTimeout(() => resolve(token === timerToken), ms));
}

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
    return isValidSave(saved) ? saved : null;
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

function newGame(playerCount) {
  const players = createPlayers(playerCount);
  state = {
    players,
    round: 0,
    dealer: Math.floor(Math.random() * playerCount),
    phase: "deal",
    trumpCard: null,
    plays: [],
    leader: 0,
    turn: 0,
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
  state.leader = (state.dealer + 1) % state.players.length;
  state.turn = state.leader;
  state.phase = "predict";
  state.message = handSize === 1 ? "Blind round: predict without seeing your card." : "Choose how many tricks you’ll take.";
  render();
}

function cardMarkup(card, options = {}) {
  const classes = ["card", isRed(card.suit) ? "red" : "black", options.small ? "small" : "", options.disabled ? "disabled" : ""].filter(Boolean).join(" ");
  const tag = options.displayOnly ? "span" : "button";
  const label = `${rankName[card.rank] || card.rank} of ${suitName[card.suit]}`;
  const artwork = new URL(`./cards/${label.replaceAll(" ", "_")}.svg`, import.meta.url).href;
  return `<${tag} class="${classes}" ${options.displayOnly ? 'role="img"' : options.disabled ? "disabled" : ""} ${!options.displayOnly && options.index != null ? `data-card-index="${options.index}"` : ""} aria-label="${label}">
    <img class="card-art" src="${artwork}" alt="" draggable="false" />
  </${tag}>`;
}

function hiddenCardMarkup() {
  return '<span class="card card-back" role="img" aria-label="Your card is hidden until all bids are locked"><span aria-hidden="true">▲</span></span>';
}

function bidLabel(prediction) {
  return prediction == null ? "–" : prediction === 0 ? "M" : prediction;
}

function playerMarkup(player, index) {
  const active = state.phase === "play" && state.turn === index;
  const dealer = state.dealer === index;
  return `<article class="player ${active ? "active" : ""} ${player.human ? "human-seat" : ""}">
    <div class="avatar">${player.name[0]}</div>
    <div class="player-info"><strong>${player.name}</strong><span>${player.score} pts</span></div>
    ${dealer ? '<span class="dealer" title="Dealer">D</span>' : ""}
    <div class="player-stats"><span>Bid <b>${bidLabel(player.prediction)}</b></span><span>Tricks <b>${player.tricks ?? 0}</b></span></div>
  </article>`;
}

function setupMarkup() {
  return `<section class="setup-screen">
    <div class="brand-mark">▲</div>
    <p class="eyebrow">A Huber Brothers game</p>
    <h1>Mountaintop</h1>
    <p class="intro">Climb carefully. Call your tricks, play your hand, and risk it all on the Mountaintop.</p>
    <div class="setup-card">
      <label for="player-count">How many players?</label>
      <div class="stepper"><button id="minus" aria-label="Fewer players">−</button><output id="count" for="minus plus">4</output><button id="plus" aria-label="More players">+</button></div>
      <p>You’ll play against <span id="bot-count">3 computer players</span>.</p>
      <button class="primary" id="start">Deal the cards <span>→</span></button>
    </div>
    <button class="text-button" id="rules-button">How to play</button>
  </section>`;
}

function tableCenterMarkup() {
  if (state.plays.length) {
    return state.plays.map((play) => `<div class="played-card"><span>${state.players[play.playerIndex].name}</span>${cardMarkup(play.card, { small: true })}</div>`).join("");
  }
  return `<div class="empty-trick"><span>♠</span><p>${state.phase === "predict" ? "Predictions first" : "Waiting for the lead"}</p></div>`;
}

function gameMarkup() {
  const human = state.players[0];
  const blindBid = state.phase === "predict" && ROUND_SIZES[state.round] === 1;
  const humanTurn = state.phase === "play" && state.turn === 0;
  const legalIds = new Set(humanTurn ? legalCards(human.hand, state.plays[0]?.card.suit).map((card) => card.id) : []);
  const predictionOptions = Array.from({ length: human.hand.length + 1 }, (_, i) => `<button class="bid ${i === 0 ? "mountain-bid" : ""}" data-bid="${i}">${i === 0 ? "<span>▲</span> Mountaintop" : i}</button>`).join("");
  const opponents = state.players.slice(1).map((player, i) => playerMarkup(player, i + 1)).join("");
  const roundLabel = `Round ${state.round + 1} of ${ROUND_SIZES.length}`;
  const trickEnd = state.phase === "trickEnd";

  return `<div class="game-shell">
    <header><div class="logo"><span>▲</span><div><b>Mountaintop</b><small>Huber Brothers</small></div></div><div class="round-progress"><span>${roundLabel}</span><div>${ROUND_SIZES.map((_, i) => `<i class="${i <= state.round ? "done" : ""}"></i>`).join("")}</div></div><button class="icon-button" id="new-game" aria-label="New game">↻</button></header>
    <section class="opponents">${opponents}</section>
    <section class="felt ${trickEnd ? "tappable" : ""}" ${trickEnd ? 'id="felt"' : ""}>
      <div class="trump"><span>Trump</span>${cardMarkup(state.trumpCard, { small: true })}</div>
      <div class="table-center">${tableCenterMarkup()}</div>
      ${trickEnd
        ? `<button class="status-pill continue-pill" id="continue-trick">${state.message} <b>Tap to continue →</b></button>`
        : `<div class="status-pill" role="status">${state.message}</div>`}
    </section>
    ${playerMarkup(human, 0)}
    <section class="hand" aria-label="Your hand">${blindBid ? hiddenCardMarkup() : human.hand.map((card, index) => cardMarkup(card, { index, disabled: !legalIds.has(card.id) })).join("")}</section>
    ${state.phase === "predict" ? `<div class="modal-backdrop bid-backdrop"><section class="bid-panel" role="dialog" aria-modal="true" aria-labelledby="bid-title">
      <p class="eyebrow">Make your prediction · ${roundLabel}</p>
      <h2 id="bid-title">${blindBid ? "Make a blind call" : "How many tricks?"}</h2>
      <p>${blindBid ? "Your card is hidden. Study your opponents’ cards and trump, then make your call." : "Review your hand and trump, then choose your bid."}</p>
      <div class="bid-trump">${cardMarkup(state.trumpCard, { small: true, displayOnly: true })}<div><h3>Trump: ${suitName[state.trumpCard.suit]}</h3><p>${state.trumpCard.suit} beats every other suit.</p></div></div>
      ${blindBid ? `<h3 id="visible-cards-label">Opponents’ cards</h3><div class="blind-opponents" role="group" aria-labelledby="visible-cards-label">${state.players.slice(1).map((player) => `<div class="blind-opponent"><span>${player.name}</span>${cardMarkup(player.hand[0], { displayOnly: true })}</div>`).join("")}</div><p class="blind-lead">${leadText(state.players[state.leader])} the trick. Bids are revealed together.</p>` : ""}
      <h3 id="bid-hand-label">${blindBid ? "Your card · hidden until bids are locked" : "Your hand"}</h3>
      <div class="bid-hand" role="group" aria-labelledby="bid-hand-label">${blindBid ? hiddenCardMarkup() : human.hand.map((card) => cardMarkup(card, { displayOnly: true })).join("")}</div>
      <div class="bid-options">${predictionOptions}</div>
      <small>Hit your bid for 5 points plus each trick; miss it and you score only the tricks you took. <b>Mountaintop</b> scores +${MOUNTAINTOP_POINTS} if you take no tricks, but −${MOUNTAINTOP_POINTS} if you take any.</small>
    </section></div>` : ""}
    ${state.phase === "roundEnd" || state.phase === "gameEnd" ? summaryMarkup() : ""}
  </div>`;
}

function summaryMarkup() {
  const isEnd = state.phase === "gameEnd";
  const ranked = state.players.map((player, index) => ({ player, points: state.roundScores[index] })).sort((a, b) => b.player.score - a.player.score);
  const high = ranked[0].player.score;
  const winners = ranked.filter(({ player }) => player.score === high).map(({ player }) => player.name);
  const rows = ranked.map(({ player, points }) => `<div><strong>${player.name}</strong><span>Bid ${bidLabel(player.prediction)} · ${player.tricks} trick${player.tricks === 1 ? "" : "s"}</span><b class="${points < 0 ? "negative" : ""}">${points > 0 ? "+" : ""}${points}</b><em>${player.score} total</em></div>`).join("");
  return `<div class="modal-backdrop"><section class="score-panel" role="dialog" aria-modal="true" aria-labelledby="summary-title">
    <span class="panel-icon">${isEnd ? "◆" : "✓"}</span><p class="eyebrow">${isEnd ? "Journey complete" : `Round ${state.round + 1} complete`}</p>
    <h2 id="summary-title">${isEnd ? `${winners.join(" & ")} ${winners.length > 1 ? "share the summit" : "reached the summit"}!` : "The cards are in"}</h2>
    <div class="score-table">${rows}</div>
    <button class="primary" id="continue">${isEnd ? "Play again" : "Next round"} <span>→</span></button>
  </section></div>`;
}

function rulesMarkup() {
  return `<div class="modal-backdrop" id="rules-modal"><section class="rules-panel" role="dialog" aria-modal="true" aria-labelledby="rules-title"><button class="close" aria-label="Close">×</button><p class="eyebrow">The trail guide</p><h2 id="rules-title">How to play</h2><h3>Predict</h3><p>Everyone secretly predicts how many tricks they’ll win. A bid of zero is called Mountaintop.</p><h3>One-card blind round</h3><p>Your card stays hidden while you bid Mountaintop or 1. You can see your opponents’ cards and trump. Each computer also bids without seeing its own card. All bids lock together, then your card is revealed.</p><h3>Play</h3><p>Follow the led suit if you can. The highest trump wins; otherwise, the highest card in the led suit wins. The trick winner leads next.</p><h3>Score</h3><p>Hit your bid for 5 points plus each trick. Miss it and you score only the tricks you took. A successful Mountaintop is +${MOUNTAINTOP_POINTS}; a failed one is −${MOUNTAINTOP_POINTS}.</p></section></div>`;
}

function render() {
  saveGame();
  app.innerHTML = state ? gameMarkup() : setupMarkup();
  bindEvents();
  // Move focus into whichever control the player needs next so keyboard and screen-reader users are not stranded.
  document.querySelector(".bid-panel [data-bid], #continue-trick, #continue")?.focus({ preventScroll: true });
}

function openRules() {
  app.insertAdjacentHTML("beforeend", rulesMarkup());
  const modal = document.querySelector("#rules-modal");
  const close = () => { modal.remove(); document.removeEventListener("keydown", onKey); document.querySelector("#rules-button")?.focus(); };
  const onKey = (event) => { if (event.key === "Escape") close(); };
  modal.querySelector(".close").addEventListener("click", close);
  modal.addEventListener("click", (event) => { if (event.target === modal) close(); });
  document.addEventListener("keydown", onKey);
  modal.querySelector(".close").focus();
}

function bindEvents() {
  document.querySelector("#new-game")?.addEventListener("click", () => { if (confirm("Leave this game and start over?")) { timerToken += 1; state = null; render(); } });
  document.querySelectorAll("[data-bid]").forEach((button) => button.addEventListener("click", () => makePredictions(Number(button.dataset.bid))));
  document.querySelectorAll("[data-card-index]").forEach((button) => button.addEventListener("click", () => humanPlay(Number(button.dataset.cardIndex))));
  document.querySelector("#continue")?.addEventListener("click", nextRound);
  document.querySelector("#felt")?.addEventListener("click", continueAfterTrick);
  if (!state) {
    let count = 4;
    const update = () => {
      document.querySelector("#count").textContent = count;
      document.querySelector("#bot-count").textContent = `${count - 1} computer player${count === 2 ? "" : "s"}`;
      document.querySelector("#minus").disabled = count <= MIN_PLAYERS;
      document.querySelector("#plus").disabled = count >= MAX_PLAYERS;
    };
    document.querySelector("#minus").addEventListener("click", () => { count = Math.max(MIN_PLAYERS, count - 1); update(); });
    document.querySelector("#plus").addEventListener("click", () => { count = Math.min(MAX_PLAYERS, count + 1); update(); });
    document.querySelector("#start").addEventListener("click", () => newGame(count));
    document.querySelector("#rules-button").addEventListener("click", openRules);
    update();
  }
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
  state.phase = "play";
  state.message = `${leadText(state.players[state.leader])} the first trick.`;
  render();
  if (await wait(500)) runBotTurns();
}

function humanPlay(index) {
  if (state.phase !== "play" || state.turn !== 0 || state.plays.length >= state.players.length) return;
  const card = state.players[0].hand[index];
  const legal = legalCards(state.players[0].hand, state.plays[0]?.card.suit);
  if (!card || !legal.includes(card)) return;
  playCard(0, card);
}

function playCard(playerIndex, card) {
  const player = state.players[playerIndex];
  player.hand.splice(player.hand.indexOf(card), 1);
  state.plays.push({ playerIndex, card });
  state.message = `${player.name} played ${card.rank}${card.suit}.`;
  state.turn = (state.turn + 1) % state.players.length;
  if (state.plays.length === state.players.length) finishTrick();
  else {
    render();
    runBotTurns();
  }
}

async function runBotTurns() {
  if (state.phase !== "play" || state.turn === 0 || state.plays.length >= state.players.length) return;
  const index = state.turn;
  if (!(await wait(BOT_DELAY))) return;
  if (state.phase !== "play" || state.turn !== index) return;
  const player = state.players[index];
  const card = chooseBotCard({ hand: player.hand, plays: state.plays, trumpSuit: state.trumpCard.suit, prediction: player.prediction, tricks: player.tricks });
  playCard(index, card);
}

// The completed trick stays on the table until the player taps, so nothing can be missed and a reload here simply resumes.
function finishTrick() {
  const winner = trickWinner(state.plays, state.trumpCard.suit);
  state.players[winner.playerIndex].tricks += 1;
  state.leader = winner.playerIndex;
  state.turn = winner.playerIndex;
  state.phase = "trickEnd";
  state.message = `${winText(state.players[winner.playerIndex])}.`;
  render();
}

function continueAfterTrick() {
  if (state.phase !== "trickEnd") return;
  state.plays = [];
  if (state.players.every((player) => player.hand.length === 0)) {
    finishRound();
    return;
  }
  state.phase = "play";
  state.message = `${leadText(state.players[state.leader])}.`;
  render();
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
  if (state.phase === "gameEnd") { state = null; render(); return; }
  state.round += 1;
  state.dealer = (state.dealer + 1) % state.players.length;
  startRound();
}

render();
if (state?.phase === "play") runBotTurns();
