# Scoring Simulation Report

## Question

This experiment compares the production scoring rule with a symmetric miss penalty and tests four Mountaintop reward/penalty schedules. The goal is to identify candidates that keep games competitive while preserving meaningful, exciting Mountaintop decisions.

## Method

- **Ordinary scoring models**:
  - `current`: exact bids score `5 + tricks`; misses score the tricks taken.
  - `symmetric`: exact bids score `5 + tricks`; misses score `-abs(bid - tricks)`.
- **Mountaintop schedules**: `+10/-10`, `+8/-8`, `+6/-6`, and `+10/-6`.
- **Sample**: 5,000 complete eleven-round games for each player count from two through eight, for each of eight variants. That is 35,000 games per variant and 280,000 games overall.
- **Pairing and reproducibility**: every variant used seed `20261001` and the same deterministic deal for the same player-count/game/round coordinates.
- **Parallelism**: all eight variants ran concurrently in Node worker threads. The recorded run completed in 84.5 seconds.
- **Agent behavior**: simulated players select the bid with the highest expected score using a common hand-strength probability approximation. Blind-round agents enumerate possible hidden cards without looking at their own card. Card play uses the production `chooseBotCard` policy.

The complete machine-readable output is in [`scoring-results.json`](./scoring-results.json).

## Aggregate Results

“Competitive final” means at least two players started the last round within 10 points of the leader. “Reachable final” uses a scale-aware threshold instead: at least two players were within the maximum possible head-to-head scoring swing in the six-card final round. “Recall after failure” is the share of later bidding opportunities in which a player who had already failed a Mountaintop called it again.

| Variant | Winner margin | Final spread | Competitive finals | Reachable finals | Mountaintop call rate | Recall after failure | Failed caller win rate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Current, +10/-10 | 12.29 | 38.22 | 58.4% | 84.5% | 42.1% | 40.8% | 11.7% |
| Current, +8/-8 | 9.78 | 30.75 | 67.8% | 88.1% | 40.7% | 39.2% | 11.2% |
| **Current, +6/-6** | **7.66** | **24.26** | **76.7%** | **91.5%** | 38.2% | 36.0% | 10.8% |
| Current, +10/-6 | 11.14 | 34.75 | 61.4% | 80.9% | 48.4% | 47.2% | 13.0% |
| Symmetric, +10/-10 | 14.07 | 42.73 | 52.6% | 80.5% | 44.6% | 43.2% | 13.1% |
| Symmetric, +8/-8 | 11.66 | 35.36 | 60.8% | 83.7% | 43.2% | 41.9% | 13.4% |
| **Symmetric, +6/-6** | **9.67** | **29.10** | **68.1%** | **86.0%** | 42.0% | 40.5% | **14.5%** |
| Symmetric, +10/-6 | 13.14 | 40.06 | 54.8% | 75.3% | **52.3%** | **51.7%** | 14.4% |

Mountaintop success rates were between 82.9% and 86.8% across these automated policies. The high rate is a warning that call frequency should not be interpreted as a forecast of human behavior: the agents use a consistent probability model and call Mountaintop only when it has the best modeled expected score.

## Findings

### 1. Symmetric misses did not improve simulated closeness

At every matching Mountaintop value, symmetric scoring increased the winner's margin and final score spread and reduced the share of competitive finals. With Mountaintop at `+10/-10`, competitive finals fell from 58.4% to 52.6%, while the average winner margin rose from 12.29 to 14.07.

This does **not** prove symmetric scoring is less fun. It adds an accuracy consequence and may make trick-by-trick decisions more meaningful, qualities the closeness metrics cannot measure. It does show that symmetric scoring should not be adopted on the assumption that it naturally keeps more players in contention.

### 2. Lowering both Mountaintop outcomes had the largest competitiveness effect

Moving from `+10/-10` to `+6/-6` produced the closest games in both ordinary-scoring families. Under current ordinary scoring, competitive finals rose from 58.4% to 76.7% and average winner margin fell from 12.29 to 7.66. Under symmetric scoring, competitive finals rose from 52.6% to 68.1% and margin fell from 14.07 to 9.67.

The tradeoff is that a smaller reward made rational agents call Mountaintop less often and made prior failures less likely to be followed by another call. That can improve score balance while weakening the dramatic identity of the bid.

### 3. Keeping +10 while reducing only the loss encouraged risk, not closeness

The `+10/-6` schedule generated the most Mountaintop calls and the highest recall after a prior failure. It also slightly improved failed callers' eventual win rate. However, its large successful reward preserved wide score spreads: it was only modestly more competitive than `+10/-10` under current scoring and remained the second-least competitive symmetric variant.

This schedule is a strong candidate if the primary design goal is to keep Mountaintop prominent and psychologically approachable. It is not the best candidate if close final rounds are the priority.

### 4. The simulator reveals a real design tradeoff

No tested rule dominates every desired outcome:

- **Current +6/-6** maximizes late-game closeness.
- **Symmetric +6/-6** adds bid-accuracy consequences while remaining materially closer than either `+10/-10` baseline.
- **Current +10/-6** preserves the existing ordinary rule and encourages repeat Mountaintop risk with a moderate competitiveness improvement.
- **Symmetric +10/-6** most strongly encourages Mountaintop calls and repeat calls, but produces relatively wide games.

## Recommendation

Do not change the production rules based on simulation alone. Advance these three variants to structured human playtests alongside the current control:

1. **Current +10/-10** — control.
2. **Current +6/-6** — strongest simulated competitiveness.
3. **Symmetric +6/-6** — best symmetric compromise and strongest failed-caller recovery result.
4. **Current +10/-6** — strongest compromise for preserving a dramatic `+10` reward while reducing reluctance after failure.

For human sessions, record perceived tension, clarity, whether unwanted tricks felt strategically meaningful, willingness to call Mountaintop after a failure, and how many players felt capable of winning before the final round. Those observations should decide whether the strategic texture of symmetric scoring is worth its larger simulated score separation.

## Limitations

- Simulated competitiveness is measurable; “fun” is not. The metrics are proxies that narrow the playtest candidates.
- The bidding distribution is an approximation, not a learned model of human judgment.
- All agents optimize expected points. Human players may value risk, table drama, or loss avoidance differently.
- The production card-play heuristic is intentionally lightweight and may not exploit every strategic consequence of symmetric penalties.
- Results describe the tested full-game schedule and player counts; they should not be generalized to other formats without rerunning the experiment.

## Reproduction

```bash
npm run simulate:scoring -- --games=5000 --seed=20261001
```

The command overwrites `analysis/scoring-results.json` with a deterministic report and prints the principal comparison table.
