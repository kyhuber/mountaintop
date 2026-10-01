// Every player-facing sentence that depends on the scoring rule lives here and is built
// from the constants and functions in game.js. If scoreRound changes, this file follows
// automatically, and test/text.test.js checks that the numbers quoted match scoreRound.
import { MOUNTAINTOP_POINTS, ROUND_SIZES, scoreRound } from "./game.js";

export const EXACT_BONUS = scoreRound(1, 1) - 1;

export function pointsText(points) {
  return `${points > 0 ? "+" : points < 0 ? "−" : ""}${Math.abs(points)}`;
}

export function mountainRule() {
  return `Mountaintop scores +${MOUNTAINTOP_POINTS} if you take no tricks, but −${MOUNTAINTOP_POINTS} if you take any.`;
}

export function scoringRule() {
  return `Hit your bid for ${EXACT_BONUS} points plus each trick. Miss it and you score only the tricks you took.`;
}

// One line per summary row explaining the points, e.g. "Bid 2, took 3 · missed, 3 for tricks".
export function scoreReason(prediction, tricks) {
  const points = scoreRound(prediction, tricks);
  const taken = `${tricks} trick${tricks === 1 ? "" : "s"}`;
  if (prediction === 0) {
    return tricks === 0
      ? { tag: "Summit", key: "summit", detail: `Mountaintop held · ${pointsText(points)}` }
      : { tag: "Fell", key: "fell", detail: `Mountaintop, took ${taken} · ${pointsText(points)}` };
  }
  if (prediction === tricks) return { tag: "Exact", key: "exact", detail: `Bid ${prediction}, took ${tricks} · ${EXACT_BONUS} + ${tricks}` };
  return { tag: "Missed", key: "missed", detail: `Bid ${prediction}, took ${tricks} · ${tricks} for tricks` };
}

// Table talk after the bids are revealed: do the bids add up to more or fewer tricks than exist?
export function bidsSummary(totalBids, tricksAvailable) {
  const head = `Bids ${totalBids} of ${tricksAvailable}:`;
  if (totalBids > tricksAvailable) return `${head} someone will miss.`;
  if (totalBids < tricksAvailable) return `${head} ${tricksAvailable - totalBids === 1 ? "a spare trick is" : `${tricksAvailable - totalBids} spare tricks are`} loose.`;
  return `${head} every trick is claimed.`;
}

export function bidText(player) {
  return player.prediction === 0 ? `${player.name} calls Mountaintop.` : `${player.name} bids ${player.prediction}.`;
}

export function fallText(player) {
  return player.human ? "You take the trick. Your Mountaintop falls." : `${player.name} takes the trick. ${player.name}’s Mountaintop falls.`;
}

// The inventors' strategy heuristics, rotated through the first bid panels of a new player's first game.
export const STRATEGY_TIPS = [
  { id: "suits", text: "Count your suits, not just your high cards. Two suits give you more control than four, because you’ll be out of a suit more often and free to choose what to play. That matters most when you call Mountaintop." },
  { id: "small-table", text: "With fewer players, more of the deck stays out of play and hands are harder to read. A middling card like a 6 is far from a sure trick at a small table, so bid a little under what your hand suggests." },
  { id: "courage", text: `Don’t fear Mountaintop. A fall costs ${MOUNTAINTOP_POINTS} points, but a run of accurate bids wins them back quickly, and a clean Mountaintop is a quick climb.` },
];

export function strategyTip(round, playerCount) {
  const order = playerCount <= 3 ? ["small-table", "suits", "courage"] : ["suits", "courage", "small-table"];
  const id = order[round];
  return id ? STRATEGY_TIPS.find((tip) => tip.id === id) : null;
}

export function blindTip() {
  return "One card, bid blind: judge your odds from the cards you can see and where you sit in the order.";
}

// Coach hints shown once each during a new player's first game.
export const COACH_HINTS = {
  play: "Your legal cards are lit; you must follow the suit that was led when you can. Need tricks? Play high. Already at your bid? Play your highest card that still loses.",
  lastToPlay: "You play last this trick, so you can see exactly what wins. A gold dot marks a card that would take it.",
  trickEnd: "The winner collects the trick into the pile beside their seat and leads the next one. Tap the gold bar when you’re ready.",
  summary: `${scoringRule()} ${mountainRule()}`,
};

export function trailhead() {
  const first = ROUND_SIZES[0];
  return [
    { title: "Welcome to Mountaintop", body: `A trick-taking game by the Huber brothers. ${ROUND_SIZES.length} rounds, ${first} cards down to 1 and back up. Each round you predict how many tricks you’ll win, then try to hit it exactly.` },
    { title: "Tricks", body: "Everyone plays one card. The highest trump wins; otherwise the highest card of the suit that was led. You must follow suit when you can, and the winner leads the next trick." },
    { title: "Bid, then make it", body: `${scoringRule()} Call Mountaintop (zero tricks) for +${MOUNTAINTOP_POINTS}, but take a single trick and it’s −${MOUNTAINTOP_POINTS}.` },
  ];
}

export function rulesSections() {
  return [
    { title: "Predict", body: "Everyone secretly predicts how many tricks they’ll win. A bid of zero is called Mountaintop. Bids are revealed together." },
    { title: "One-card blind round", body: "Your card stays hidden while you bid Mountaintop or 1. You can see your opponents’ cards and trump. Each computer also bids without seeing its own card. All bids lock together, then your card is revealed." },
    { title: "Play", body: "Follow the led suit if you can. The highest trump wins; otherwise, the highest card in the led suit wins. The trick winner leads next." },
    { title: "Score", body: `${scoringRule()} A successful Mountaintop is +${MOUNTAINTOP_POINTS}; a failed one is −${MOUNTAINTOP_POINTS}.` },
  ];
}
