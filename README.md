# Mountaintop

A browser-based version of the Huber brothers' trick-taking card game. Play an
11-round game against one to seven computer opponents, make simultaneous bids,
and try to reach the summit of the scoreboard.

## Run locally

The game has no runtime dependencies. Start a local server and open
<http://localhost:4173>:

```bash
npm run dev
```

## Checks

```bash
npm test
npm run build
```

The production-ready static files are written to `dist/`.

## Rules summary

The one-card round is a blind call: see opponents' cards and trump, but keep
your own card hidden until all bids are locked. Choose Mountaintop (zero) or
one trick. Computer players use only the other players' cards and the public
trump card to estimate their chances; they cannot use their own hidden card.

- Every player predicts how many tricks they will win. A prediction of zero is
  called **Mountaintop**.
- Players must follow the led suit when possible. The highest trump wins; if no
  trump is played, the highest card of the led suit wins.
- An exact nonzero prediction scores five bonus points plus one per trick. A
  missed prediction scores one point per trick.
- A successful Mountaintop scores 10 points and a failed one scores −10.
- Rounds use 6, 5, 4, 3, 2, 1, 2, 3, 4, 5, and 6 cards. The dealer rotates
  clockwise after every round.
