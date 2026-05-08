/** Small DOM builder helpers so screens can stay declarative. */

type AttrValue = string | number | boolean | null | undefined;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, AttrValue> | null,
  ...children: (Node | string | null | undefined)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === null || value === undefined || value === false) continue;
      if (key === "class") node.className = String(value);
      else if (key === "text") node.textContent = String(value);
      else if (key === "html") node.innerHTML = String(value);
      else if (key.startsWith("on") && typeof value === "string") {
        // ignore string event handlers
      } else if (key === "value" && node instanceof HTMLInputElement) {
        node.value = String(value);
      } else {
        node.setAttribute(key, String(value));
      }
    }
  }
  for (const child of children) {
    if (child === null || child === undefined) continue;
    node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

export function card(title: string, body: Node): HTMLElement {
  return el(
    "section",
    { class: "card" },
    el("div", { class: "card-header" }, title),
    el("div", { class: "card-body" }, body),
  );
}

export function screenHeader(title: string, subtitle?: string, back?: { label: string; hash: string }): HTMLElement {
  const header = el("header", { class: "screen-header" });
  if (back) {
    const backLink = el(
      "a",
      { class: "screen-back", href: back.hash },
      el("span", { "aria-hidden": "true" }, "←"),
      " ",
      back.label,
    );
    header.appendChild(backLink);
  }
  header.appendChild(el("h1", { class: "screen-title" }, title));
  if (subtitle) header.appendChild(el("div", { class: "screen-subtitle" }, subtitle));
  return header;
}

export function emptyState(title: string, subtitle?: string): HTMLElement {
  const container = el("div", { class: "empty-state" });
  container.appendChild(el("div", { class: "empty-state-title" }, title));
  if (subtitle) container.appendChild(el("div", null, subtitle));
  return container;
}
