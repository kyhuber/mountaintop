import { parentPort, workerData } from "node:worker_threads";
import { simulateVariant } from "../src/simulation.js";

parentPort.postMessage(simulateVariant(workerData));
