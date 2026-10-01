// Small Web Animations helpers. Every function is a no-op when motion is unavailable
// (no DOM, no element.animate) or unwanted (prefers-reduced-motion), so callers never branch.

export function prefersReducedMotion() {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function rectOf(element) {
  return typeof element?.getBoundingClientRect === "function" ? element.getBoundingClientRect() : null;
}

function centreDelta(from, to) {
  return {
    dx: from.left + from.width / 2 - (to.left + to.width / 2),
    dy: from.top + from.height / 2 - (to.top + to.height / 2),
  };
}

// FLIP: the element is already in its final place; play it arriving from `from`.
export function flyIn(element, from, duration) {
  if (!from || typeof element?.animate !== "function" || prefersReducedMotion()) return;
  const to = element.getBoundingClientRect();
  if (!to.width || !to.height) return;
  const { dx, dy } = centreDelta(from, to);
  const scale = Math.max(0.3, Math.min(1.5, from.width / to.width || 1));
  element.animate(
    [{ transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0.35 }, { transform: "none", opacity: 1 }],
    { duration, easing: "cubic-bezier(.2, .8, .2, 1)" },
  );
}

// Sweep the finished trick's cards into the winner's pile using clones in a fixed overlay,
// because the real cards are removed from the DOM by the next render.
export function collectTrick(fromRects, target, duration) {
  if (!target || !fromRects.length || prefersReducedMotion()) return Promise.resolve();
  if (typeof document === "undefined" || typeof document.body?.appendChild !== "function") return Promise.resolve();
  const layer = document.createElement("div");
  layer.className = "motion-layer";
  const finished = fromRects.map((rect, index) => {
    const chip = document.createElement("span");
    chip.className = "flying-card";
    Object.assign(chip.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    layer.appendChild(chip);
    if (typeof chip.animate !== "function") return Promise.resolve();
    const { dx, dy } = centreDelta(target, rect);
    const scale = Math.max(0.12, Math.min(0.4, target.height / rect.height || 0.2));
    const animation = chip.animate(
      [{ transform: "none", opacity: 1 }, { transform: `translate(${dx}px, ${dy}px) scale(${scale}) rotate(${(index - fromRects.length / 2) * 5}deg)`, opacity: 0.7 }],
      { duration, delay: index * 30, easing: "cubic-bezier(.4, 0, .2, 1)", fill: "forwards" },
    );
    return animation.finished.catch(() => {});
  });
  document.body.appendChild(layer);
  return Promise.all(finished).then(() => layer.remove());
}
