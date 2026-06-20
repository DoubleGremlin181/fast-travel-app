import { el, screenHeader } from "../dom.js";

export function renderAbout(main: HTMLElement): void {
  main.appendChild(screenHeader("About"));

  const card = el("section", { class: "card" });
  const body = el("div", { class: "card-body about-info" });

  body.appendChild(
    el(
      "p",
      null,
      "Fast Travel ",
      el("span", { class: "version-badge" }, "v2.0.2"),
    ),
  );
  body.appendChild(
    el("p", null, "Supercharge your search bar. Type commands to navigate the web faster."),
  );
  body.appendChild(
    el(
      "p",
      null,
      el("a", { href: "https://github.com/DoubleGremlin181/fast-travel-app", target: "_blank", rel: "noopener" }, "View on GitHub"),
      " · ",
      el("a", { href: "https://doublegremlin181.github.io/fast-travel/", target: "_blank", rel: "noopener" }, "Original v1 site"),
    ),
  );

  card.appendChild(el("div", { class: "card-header" }, "Fast Travel"));
  card.appendChild(body);
  main.appendChild(card);

  const credits = el("section", { class: "card" });
  credits.appendChild(el("div", { class: "card-header" }, "Credits"));
  credits.appendChild(
    el(
      "div",
      { class: "card-body about-info" },
      el("p", null, "Built by Kavish (GitHub @DoubleGremlin181)."),
      el("p", null, "Command catalog is community-sourced; contributions welcome via pull request."),
    ),
  );
  main.appendChild(credits);
}
