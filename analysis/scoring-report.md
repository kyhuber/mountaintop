# Scoring Simulation Report

## Question

Which scoring rule keeps Mountaintop games competitive to the final round while preserving a meaningful, exciting Mountaintop decision? This experiment compares two ways of scoring a missed nonzero bid and four Mountaintop reward/penalty schedules, then selects a production rule from the results.

## Method

- **Ordinary scoring models**:
  - `tricks-taken` (the original rule, `current` in the result files): exact bids score `5 + tricks`; misses score the tricks taken.
  - `symmetric`: exact bids score `5 + tricks`; misses score `-abs(bid - tricks)`.
- **Mountaintop schedules**: `+10/-10`, `+8/-8`, `+6/-6`, and `+10/-6`.
- **Sample**: 5,000 complete eleven-round games for each supported table size (two through five players), for each of eight variants. That is 20,000 games per variant and 160,000 games overall. The player range matches the production cap so the evidence describes tables players can actually choose.
- **Pairing and reproducibility**: every variant used seed `20261001` and the same deterministic deal for the same player-count/game/round coordinates.
- **Parallelism**: all eight variants ran concurrently in Node worker threads. The recorded run completed in 21.5 seconds.
- **Agent behavior**: simulated players select the bid with the highest expected score under the variant being tested, using the same hand-strength probability model (`predictionDistribution`) as the production bots. Blind-round agents enumerate possible hidden cards without looking at their own card. Card play uses the production `chooseBotCard` policy.

The complete machine-readable output is in [`scoring-results.json`](./scoring-results.json).

## Aggregate Results

“Competitive final” means at least two players started the last round within 10 points of the leader. “Reachable final” uses a scale-aware threshold instead: at least two players were within the maximum possible head-to-head scoring swing in the six-card final round. “Recall after failure” is the share of later bidding opportunities in which a player who had already failed a Mountaintop called it again.

| Variant | Winner margin | Final spread | Competitive finals | Reachable finals | Mountaintop call rate | Recall after failure | Failed caller win rate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Tricks-taken misses, +10/-10 | 15.72 | 34.55 | 46.5% | 75.1% | 38.8% | 39.3% | 19.2% |
| Tricks-taken misses, +8/-8 | 12.52 | 27.70 | 55.7% | 80.3% | 37.2% | 37.6% | 18.5% |
| **Tricks-taken misses, +6/-6 (production)** | **9.62** | **21.45** | **66.4%** | **85.5%** | 34.4% | 34.1% | 17.5% |
| Tricks-taken misses, +10/-6 | 13.95 | 30.55 | 50.0% | 71.3% | 43.4% | 44.3% | 21.6% |
| Symmetric misses, +10/-10 | 17.98 | 38.68 | 41.4% | 70.2% | 40.3% | 41.0% | 21.5% |
| Symmetric misses, +8/-8 | 14.97 | 32.12 | 48.5% | 73.8% | 39.2% | 39.9% | 21.7% |
| Symmetric misses, +6/-6 | 12.37 | 26.46 | 56.0% | 77.1% | 38.5% | 39.0% | 22.7% |
| Symmetric misses, +10/-6 | 16.55 | 35.87 | 43.9% | 64.3% | 48.0% | 49.1% | 23.8% |

Mountaintop success rates were between 70.5% and 76.4% across these automated policies, so call frequency should not be read as a forecast of human behavior: the agents call Mountaintop only when it has the best modeled expected score.

### Winner margin by table size

The ranking holds at every supported player count. Smaller tables produce wider margins under every rule because fewer players share the points.

| Players | Tricks-taken +6/-6 | Symmetric +6/-6 | Tricks-taken +10/-10 (original) |
| ---: | ---: | ---: | ---: |
| 2 | 15.00 | 18.57 | 24.33 |
| 3 | 9.86 | 13.16 | 16.32 |
| 4 | 7.42 | 9.75 | 12.17 |
| 5 | 6.19 | 8.01 | 10.05 |

## Findings

### 1. Tricks-taken misses produced closer games than symmetric misses at every Mountaintop value

At every matching Mountaintop schedule, symmetric scoring widened the winner's margin and final spread and reduced the share of competitive finals. At `+6/-6`, competitive finals fell from 66.4% to 56.0% and the average winner margin rose from 9.62 to 12.37 when misses were penalized symmetrically.

Symmetric scoring does add an accuracy consequence that the closeness metrics cannot value, but the simulation gives no evidence that it keeps more players in contention. It does the opposite.

### 2. Lowering both Mountaintop outcomes had the largest competitiveness effect

Moving from `+10/-10` to `+6/-6` produced the closest games in both ordinary-scoring families. With tricks-taken misses, competitive finals rose from 46.5% to 66.4% and the average winner margin fell from 15.72 to 9.62. The cost is a modest drop in Mountaintop calls (38.8% to 34.4% of bids) and in repeat calls after a failure.

### 3. Keeping +10 while reducing only the loss encouraged risk, not closeness

The `+10/-6` schedules generated the most Mountaintop calls and the highest recall after a failure, and gave failed callers the best eventual win rate. Their large successful reward preserved wide score spreads, so they were only modestly more competitive than `+10/-10`.

### 4. No rule dominates every outcome

- **Tricks-taken +6/-6** maximizes late-game closeness on every measure.
- **Symmetric +6/-6** adds bid-accuracy consequences and gives failed callers the second-best recovery rate, but is materially less close.
- **Tricks-taken +10/-6** keeps Mountaintop most prominent while improving on the original rule.

## Production Decision

Structured human playtests are not available at this stage, so the production rule is inferred from the simulation alone. Production uses **tricks-taken misses with Mountaintop at +6/-6**. It leads every competitiveness metric at every supported table size: the smallest winner margin and final spread, the highest competitive-final rate, and the highest reachable-final rate. Its Mountaintop call rate is the lowest of the eight variants, but the gap to the others is a few percentage points, and a +6/-6 Mountaintop still swings twelve points between success and failure.

The earlier interim choice of symmetric +6/-6 was based on the strategic argument that misses should matter in both directions. That argument remains untested; the measured cost is roughly three extra points of winner margin and ten percentage points fewer competitive finals. If human feedback later shows that unwanted tricks feel inconsequential, symmetric scoring is the first alternative to revisit, and `scoreRound` in `src/game.js` is the single place the rule lives. The production bots derive their bids from `scoreRound`, so any change there re-tunes them automatically.

## Limitations

- Simulated competitiveness is measurable; “fun” is not. The metrics are proxies.
- The bidding distribution is an approximation, not a learned model of human judgment, and the bots' card play is a lightweight heuristic that always leads its lowest-risk card.
- All agents optimize expected points. Human players may value risk, table drama, or loss avoidance differently.
- Results describe the eleven-round schedule and two-to-five-player tables; rerun the experiment before generalizing to other formats or larger tables.

## Reproduction

```bash
npm run simulate:scoring -- --games=5000 --seed=20261001
```

The command overwrites `analysis/scoring-results.json` with a deterministic report and prints the principal comparison table.
