import { ROUND_SIZES, createDeck, createPlayers } from "../../src/game.js";

export const SAVE_KEY = "mountaintop-game-v2";
export const deck = createDeck();
export const card = (id) => deck.find((c) => c.id === id);

export function fixture(round = 5, count = 4) {
  const players = createPlayers(count).map((p, i) => ({ ...p,
    hand: deck.slice(i * ROUND_SIZES[round], (i + 1) * ROUND_SIZES[round]),
    prediction: null, tricks: 0,
  }));
  return { players, round, dealer: count - 1, leader: 0, turn: 0,
    phase: "predict", trumpCard: card("A♣"), plays: [], message: "", roundScores: [] };
}

function stub(attributes = {}) {
  const handlers = {};
  return {
    ...attributes,
    dataset: attributes.dataset ?? {},
    disabled: false,
    textContent: "",
    addEventListener(type, callback) { handlers[type] = callback; },
    removeEventListener() {},
    click() { handlers.click?.({ target: this }); },
    focus() {},
  };
}

// A tiny stand-in for the DOM: app.innerHTML is real markup, and clickable controls are stubbed
// from that markup so tests can drive the game without a browser.
let importId = 0;
export async function withApp(saved, run) {
  const originals = Object.fromEntries(["document", "localStorage", "setTimeout", "confirm"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  // Stubs live exactly as long as the markup that produced them: replacing innerHTML discards them,
  // just as a browser would, so handlers bound during one render never leak into the next.
  let markup = "";
  let stubs = {};
  const app = {
    get innerHTML() { return markup; },
    set innerHTML(value) { markup = value; stubs = {}; },
    insertAdjacentHTML() {},
  };
  let stored = saved == null ? null : structuredClone(saved);
  const count = (pattern) => (markup.match(pattern) || []).length;
  globalThis.document = {
    querySelector(selector) {
      if (selector === "#app") return app;
      if (!selector.startsWith("#") || selector.includes(",")) return null;
      if (!markup.includes(`id="${selector.slice(1)}"`)) return null;
      return (stubs[selector] ??= stub());
    },
    querySelectorAll(selector) {
      if (selector === "[data-bid]") return (stubs[selector] ??= Array.from({ length: count(/data-bid=/g) }, (_, bid) => stub({ dataset: { bid: String(bid) } })));
      if (selector === "[data-card-index]") return (stubs[selector] ??= Array.from({ length: count(/data-card-index=/g) }, (_, index) => stub({ dataset: { cardIndex: String(index) } })));
      return [];
    },
    addEventListener() {},
    removeEventListener() {},
  };
  globalThis.localStorage = {
    getItem: (key) => (key === SAVE_KEY && stored != null ? JSON.stringify(stored) : null),
    setItem: (key, value) => { if (key === SAVE_KEY) stored = JSON.parse(value); },
    removeItem: (key) => { if (key === SAVE_KEY) stored = null; },
  };
  // Freeze every delay so assertions can inspect the instant an action is committed.
  globalThis.setTimeout = () => 0;
  globalThis.confirm = () => true;
  try {
    await import(`../../src/app.js?harness=${++importId}`);
    return await run({
      app,
      saved: () => stored,
      bids: () => globalThis.document.querySelectorAll("[data-bid]"),
      cards: () => globalThis.document.querySelectorAll("[data-card-index]"),
      // Every render re-binds its controls, so the stub found here carries the latest handler.
      control: (id) => { const element = globalThis.document.querySelector(id); if (!element) throw new Error(`${id} is not rendered`); return element; },
    });
  } finally {
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}
