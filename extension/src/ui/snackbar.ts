/** Lightweight toast queue. Requires a `<div id="snackbar-root">` in the DOM. */

export interface SnackbarOptions {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
}

const DEFAULT_DURATION = 3500;

let queue: SnackbarOptions[] = [];
let active = false;

export function showSnackbar(opts: SnackbarOptions): void {
  queue.push(opts);
  if (!active) next();
}

function next(): void {
  const opts = queue.shift();
  if (!opts) {
    active = false;
    return;
  }
  active = true;
  const root = document.getElementById("snackbar-root");
  if (!root) {
    // Fallback to console if host page lacks a root.
    console.info("[fast-travel]", opts.message);
    active = false;
    return;
  }
  const el = document.createElement("div");
  el.className = "snackbar";
  el.setAttribute("role", "status");

  const text = document.createElement("span");
  text.textContent = opts.message;
  el.appendChild(text);

  let actionClicked = false;
  if (opts.actionLabel && opts.onAction) {
    const btn = document.createElement("button");
    btn.className = "snackbar-action";
    btn.type = "button";
    btn.textContent = opts.actionLabel;
    btn.addEventListener("click", () => {
      actionClicked = true;
      opts.onAction?.();
      dismiss();
    });
    el.appendChild(btn);
  }

  root.appendChild(el);

  const timer = setTimeout(dismiss, opts.durationMs ?? DEFAULT_DURATION);

  function dismiss(): void {
    clearTimeout(timer);
    if (el.classList.contains("leaving")) return;
    el.classList.add("leaving");
    setTimeout(() => {
      el.remove();
      next();
    }, 220);
    void actionClicked;
  }
}
