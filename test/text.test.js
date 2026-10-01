import test from "node:test";
import assert from "node:assert/strict";
import { MOUNTAINTOP_POINTS, ROUND_SIZES, scoreRound } from "../src/game.js";
import {
  COACH_HINTS,
  EXACT_BONUS,
  STRATEGY_TIPS,
  bidText,
  bidsSummary,
  fallText,
  mountainRule,
  pointsText,
  rulesSections,
  scoreReason,
  scoringRule,
  strategyTip,
  trailhead,
} from "../src/text.js";

// Every number a player reads about scoring must come from scoreRound, so a rule change cannot leave stale copy.
test("exact-bid bonus is derived from the scoring function", () => {
  for (let tricks = 1; tricks <= 6; tricks += 1) assert.equal(scoreRound(tricks, tricks) - tricks, EXACT_BONUS);
  assert.match(scoringRule(), new RegExp(`${EXACT_BONUS} points`));
  assert.match(mountainRule(), new RegExp(`\\+${MOUNTAINTOP_POINTS} .* −${MOUNTAINTOP_POINTS}`));
});

test("score reasons quote the points that scoreRound awards", () => {
  for (let bid = 0; bid <= 6; bid += 1) {
    for (let tricks = 0; tricks <= 6; tricks += 1) {
      const { tag, detail } = scoreReason(bid, tricks);
      const points = scoreRound(bid, tricks);
      if (bid === 0) {
        assert.equal(tag, tricks === 0 ? "Summit" : "Fell");
        assert.ok(detail.endsWith(pointsText(points)), detail);
      } else if (bid === tricks) {
        assert.equal(tag, "Exact");
        const [bonus, taken] = detail.split(" · ")[1].split(" + ").map(Number);
        assert.equal(bonus + taken, points);
      } else {
        assert.equal(tag, "Missed");
        assert.equal(Number(detail.split(" · ")[1].split(" ")[0]), points);
      }
    }
  }
  assert.equal(pointsText(-6), "−6");
  assert.equal(pointsText(0), "0");
  assert.equal(pointsText(8), "+8");
});

test("bid summary reads the table correctly", () => {
  assert.equal(bidsSummary(7, 6), "Bids 7 of 6: someone will miss.");
  assert.equal(bidsSummary(5, 6), "Bids 5 of 6: a spare trick is loose.");
  assert.equal(bidsSummary(3, 6), "Bids 3 of 6: 3 spare tricks are loose.");
  assert.equal(bidsSummary(6, 6), "Bids 6 of 6: every trick is claimed.");
});

test("bid, fall and strategy copy use the right voice", () => {
  assert.equal(bidText({ name: "Mira", prediction: 0 }), "Mira calls Mountaintop.");
  assert.equal(bidText({ name: "Mira", prediction: 2 }), "Mira bids 2.");
  assert.equal(fallText({ name: "Kai", human: true }), "You take the trick. Your Mountaintop falls.");
  assert.equal(fallText({ name: "Theo", human: false }), "Theo takes the trick. Theo’s Mountaintop falls.");
  assert.equal(STRATEGY_TIPS.length, 3);
  assert.equal(strategyTip(0, 2).id, "small-table");
  assert.equal(strategyTip(0, 4).id, "suits");
  assert.equal(strategyTip(2, 4).id, "small-table");
  assert.equal(strategyTip(3, 4), null);
  assert.match(STRATEGY_TIPS.find((tip) => tip.id === "courage").text, new RegExp(`${MOUNTAINTOP_POINTS} points`));
});

test("trailhead, rules and coach copy follow the scoring constants", () => {
  const cards = trailhead();
  assert.equal(cards.length, 3);
  assert.match(cards[0].body, new RegExp(`${ROUND_SIZES.length} rounds`));
  assert.match(cards[2].body, new RegExp(`\\+${MOUNTAINTOP_POINTS}`));
  assert.ok(cards.every(({ body }) => body.split(" ").length <= 45), "trailhead cards stay short");
  assert.equal(rulesSections().length, 4);
  assert.ok(rulesSections().at(-1).body.includes(scoringRule()));
  assert.ok(COACH_HINTS.summary.includes(scoringRule()) && COACH_HINTS.summary.includes(mountainRule()));
});
