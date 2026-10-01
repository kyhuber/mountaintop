import { ROUND_SIZES, createDeck, createPlayers } from "../../src/game.js";

export const SAVE_KEY = "mountaintop-game-v2";
export const PROFILE_KEY = "mountaintop-profile-v1";
export const deck = createDeck();
export const card = (id) => deck.find((c) => c.id === id);

// A returning player with coaching off, so tests of game mechanics are not affected by onboarding.
export const RETURNING_PROFILE = { name: "", seenIntro: true, tips: false, hintsSeen: {}, pace: "relaxed", gamesStarted: 1, lastPlayerCount: 4 };

export function fixture(round = 5, count = 4) {
  const players = createPlayers(count).map((p, i) => ({ ...p,
    hand: deck.slice(i * ROUND_SIZES[round], (i + 1) * ROUND_SIZES[round]),
    prediction: null, tricks: 0,
  }));
  return { players, round, dealer: count - 1, leader: 0, turn: 0,
    phase: "predict", trumpCard: card("A♣"), plays: [], message: "", roundScores: [] };
}

const unescape = (text) => text.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const camel = (name) => name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

function stub(attributes = {}) {
  const handlers = {};
  return {
    dataset: {},
    disabled: false,
    checked: false,
    value: "",
    textContent: "",
    ...attributes,
    addEventListener(type, callback) { handlers[type] = callback; },
    removeEventListener() {},
    setAttribute(name, value) { this[`attr:${name}`] = value; },
    trigger(type) { handlers[type]?.({ target: this, key: "" }); },
    click() { this.trigger("click"); },
    focus() {},
    remove() { this.onRemove?.(); },
    // Children looked up by id share the document's stubs; anything else gets a throwaway stub.
    querySelector(selector) { return selector.startsWith("#") ? globalThis.document.querySelector(selector) : stub(); },
  };
}

// A tiny stand-in for the DOM: app.innerHTML is real markup, and controls are stubbed from that
// markup so tests can drive src/app.js without a browser. Timers are queued and fired by hand.
let importId = 0;
export async function withApp(saved, run, { profile = RETURNING_PROFILE } = {}) {
  const originals = Object.fromEntries(["document", "localStorage", "setTimeout", "confirm"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  let markup = "";
  let stubs = {};
  const inserted = [];
  const app = {
    get innerHTML() { return markup; },
    set innerHTML(value) { markup = value; stubs = {}; inserted.length = 0; },
    insertAdjacentHTML(_, html) { markup += html; inserted.push(html); },
  };
  const storage = new Map();
  if (saved != null) storage.set(SAVE_KEY, JSON.stringify(saved));
  if (profile != null) storage.set(PROFILE_KEY, JSON.stringify(profile));
  const timers = [];
  const attributesOf = (id) => {
    const tag = markup.match(new RegExp(`<[a-z]+[^>]*\\bid="${id}"[^>]*>`))?.[0] ?? "";
    return { value: unescape(tag.match(/\bvalue="([^"]*)"/)?.[1] ?? ""), checked: /\bchecked\b/.test(tag) };
  };
  globalThis.document = {
    querySelector(selector) {
      if (selector === "#app") return app;
      if (!selector.startsWith("#") || selector.includes(",")) return null;
      const id = selector.slice(1);
      if (!markup.includes(`id="${id}"`)) return null;
      if (!stubs[selector]) {
        stubs[selector] = stub(attributesOf(id));
        if (id === "rules-modal") stubs[selector].onRemove = () => { const html = inserted.pop(); markup = markup.replace(html, ""); delete stubs[selector]; };
      }
      return stubs[selector];
    },
    querySelectorAll(selector) {
      const attribute = selector.match(/^\[data-([a-z-]+)\]$/)?.[1];
      if (!attribute) return [];
      return (stubs[selector] ??= Array.from(markup.matchAll(new RegExp(`data-${attribute}="([^"]*)"`, "g")), ([, value]) => stub({ dataset: { [camel(attribute)]: value } })));
    },
    addEventListener() {},
    removeEventListener() {},
  };
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  };
  globalThis.setTimeout = (callback) => { timers.push(callback); return timers.length; };
  globalThis.confirm = () => true;
  const tick = async () => { const due = timers.splice(0); due.forEach((callback) => callback()); await new Promise((resolve) => setImmediate(resolve)); };
  const flush = async (limit = 80) => { for (let i = 0; i < limit && timers.length; i += 1) await tick(); return timers.length === 0; };
  try {
    await import(`../../src/app.js?harness=${++importId}`);
    return await run({
      app,
      saved: () => JSON.parse(storage.get(SAVE_KEY) ?? "null"),
      profile: () => JSON.parse(storage.get(PROFILE_KEY) ?? "null"),
      bids: () => globalThis.document.querySelectorAll("[data-bid]"),
      cards: () => globalThis.document.querySelectorAll("[data-card-index]"),
      all: (attribute) => globalThis.document.querySelectorAll(`[data-${attribute}]`),
      // Every render re-binds its controls, so the stub found here carries the latest handler.
      control: (id) => { const element = globalThis.document.querySelector(id); if (!element) throw new Error(`${id} is not rendered`); return element; },
      pendingTimers: () => timers.length,
      tick,
      flush,
    });
  } finally {
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}
