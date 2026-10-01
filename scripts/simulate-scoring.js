import { mkdir, writeFile } from "node:fs/promises";
import { Worker } from "node:worker_threads";
import { SCORING_VARIANTS } from "../src/simulation.js";

function option(name, fallback) {
  const prefix = `--${name}=`;
  const value = process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
  return value == null ? fallback : Number(value);
}

const gamesPerPlayerCount = option("games", 10_000);
const seed = option("seed", 20261001);
const output = process.argv.find((argument) => argument.startsWith("--output="))?.slice("--output=".length) || "analysis/scoring-results.json";
if (!Number.isInteger(gamesPerPlayerCount) || gamesPerPlayerCount < 1) throw new Error("--games must be a positive integer");
if (!Number.isInteger(seed)) throw new Error("--seed must be an integer");

const workerUrl = new URL("./scoring-worker.js", import.meta.url);
const startedAt = Date.now();
const results = await Promise.all(SCORING_VARIANTS.map((variant) => new Promise((resolve, reject) => {
  const worker = new Worker(workerUrl, { workerData: { variant, gamesPerPlayerCount, seed } });
  worker.once("message", resolve);
  worker.once("error", reject);
  worker.once("exit", (code) => { if (code !== 0) reject(new Error(`Worker for ${variant.id} exited with code ${code}`)); });
})));

const report = {
  methodology: {
    seed,
    gamesPerPlayerCount,
    playerCounts: [2, 3, 4, 5, 6, 7, 8],
    variantsRunInParallel: SCORING_VARIANTS.length,
    totalGames: results.reduce((total, result) => total + result.samples.totalGames, 0),
    caveat: "Automated agents use a shared expected-value bidding approximation and the production card-play heuristic; simulation metrics are balance proxies, not direct measurements of human fun.",
  },
  results,
};
await mkdir(new URL("../analysis/", import.meta.url), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);

const percent = (value) => `${(value * 100).toFixed(1)}%`;
console.table(results.map(({ variant, metrics }) => ({
  variant: variant.id,
  margin: metrics.averageWinnerMargin.toFixed(2),
  spread: metrics.averageFinalSpread.toFixed(2),
  contenders: metrics.averageFinalRoundContendersWithin10.toFixed(2),
  competitive: percent(metrics.competitiveFinalRate),
  inReach: metrics.averageFinalRoundContendersInReach.toFixed(2),
  reachableFinal: percent(metrics.competitiveFinalReachRate),
  comeback: percent(metrics.midpointLastPlaceComebackRate),
  mountainCallRate: percent(metrics.mountainCallRate),
  mountainSuccess: percent(metrics.mountainSuccessRate),
  recallAfterFailure: percent(metrics.postFailureRecallRate),
  winAfterFailure: percent(metrics.failedMountainPlayerWinRate),
})));
console.log(`Simulated ${report.methodology.totalGames.toLocaleString()} games across ${SCORING_VARIANTS.length} parallel variants in ${((Date.now() - startedAt) / 1000).toFixed(1)}s.`);
console.log(`Wrote ${output}`);
