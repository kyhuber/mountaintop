# Mountaintop

A browser-based version of the Huber brothers' trick-taking card game. Play an
11-round game against one to four computer opponents, make simultaneous bids,
and try to reach the summit of the scoreboard.

## Playing

First-time visitors get a three-card trailhead (what the game is, how a trick
works, how scoring works), can enter a name, and start at a three-player table
with coach hints during their first game. Returning players skip straight to
setup, where they choose two to five players and a Relaxed or Brisk pace.
Finished tricks wait for a tap, bids are revealed one seat at a time, and every
seat shows its public standing against its bid.

## Run locally

The game has no build step and no runtime JavaScript dependencies. Start the
local server and open <http://localhost:4173>:

```bash
npm run dev
```

## Checks

```bash
npm test
git diff --check
```

The same checks run in GitHub Actions on every push to `main` and every pull
request.

## Deployment

GitHub Pages serves the root of the `main` branch directly at
<https://mountaintop.kaihuber.dev>. `index.html` loads `src/` as native ES
modules, so merging to `main` is the deploy.

## Scoring simulation

Run the deterministic scoring experiment across all eight scoring variants and
every supported table size:

```bash
npm run simulate:scoring -- --games=5000 --seed=20261001
```

The variants execute concurrently in worker threads and write machine-readable
results to `analysis/scoring-results.json`. See `analysis/scoring-report.md` for
the methodology, findings, and the production scoring decision.

## Rules summary

- Two to five players. Every player predicts how many tricks they will win. A
  prediction of zero is called **Mountaintop**.
- Players must follow the led suit when possible. The highest trump wins; if no
  trump is played, the highest card of the led suit wins. The trick winner
  leads the next trick.
- An exact nonzero prediction scores five bonus points plus one per trick. A
  missed prediction scores one point per trick taken.
- A successful Mountaintop scores +6 and a failed one scores −6.
- Rounds use 6, 5, 4, 3, 2, 1, 2, 3, 4, 5, and 6 cards. The dealer rotates
  clockwise after every round.
- The one-card round is a blind call: you see your opponents' cards and the
  trump card, but your own card stays hidden until all bids are locked.
  Computer players also bid without seeing their own card.
