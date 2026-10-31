import { expect, test } from "bun:test";
import { helpBindings } from "./help";

test("help shows the current panel before global bindings", () => {
  for (const panel of ["browse", "cards", "list"] as const) {
    const sections = helpBindings(panel, 160);
    expect(sections[1].title).toBe("everywhere");
    expect(sections.flatMap((section) => section.bindings).some(([key]) => key === "u i o")).toBe(false);
  }
  const inspector = helpBindings("links", 100);
  expect(inspector[0].title).toBe("inspector · links");
  expect(inspector[0].bindings.map(([key]) => key)).toContain("u i o");
  expect(inspector[0].bindings.map(([key]) => key)).toContain("e");
  expect(helpBindings("detail", 160)[0].bindings.map(([key]) => key)).not.toContain("e");
});

test("help fits its measured panel and displays the close hint", async () => {
  const { helpContent, helpDimensions } = await import("./help");
  const { createTestRenderer } = await import("@opentui/core/testing");
  const { BoxRenderable, TextRenderable } = await import("@opentui/core");
  const size = helpDimensions("browse", 120, 50);
  const setup = await createTestRenderer({ width: size.width, height: size.height });
  try {
    const panel = new BoxRenderable(setup.renderer, { id: "modal", width: size.width, height: size.height, border: true, paddingLeft: 1, paddingRight: 1, flexDirection: "column" });
    setup.renderer.root.add(panel);
    panel.add(new TextRenderable(setup.renderer, { id: "title", content: "help", height: 1 }));
    panel.add(new TextRenderable(setup.renderer, { id: "gap", content: " ", height: 1 }));
    panel.add(new TextRenderable(setup.renderer, { id: "body", content: helpContent("browse", 120), width: "100%", flexGrow: 1, wrapMode: "word" }));
    const hint = new BoxRenderable(setup.renderer, { id: "hint-row", width: "100%", height: 1, flexDirection: "row", justifyContent: "flex-end" });
    hint.add(new TextRenderable(setup.renderer, { id: "hint", content: "press any key to close", height: 1 }));
    panel.add(hint);
    await setup.renderOnce();
    const hintLine = setup.captureCharFrame().split("\n").find((line) => line.includes("press any key to close"));
    expect(hintLine).toBeDefined();
    expect(hintLine!.indexOf("press any key to close")).toBe(size.width - 2 - "press any key to close".length);
  } finally { await setup.dispose(); }
});

test("footer hints match the focused panel and filter mode", async () => {
  const { footerHints } = await import("./help");
  expect(footerHints("browse", 160, false)).toContain("j/k choose");
  expect(footerHints("cards", 160, false)).toContain("enter open");
  expect(footerHints("list", 160, false)).toContain("enter inspect");
  expect(footerHints("links", 160, false)).toContain("enter open");
  expect(footerHints("detail", 160, false)).toContain("u/i/o tabs");
  expect(footerHints("browse", 160, false)).not.toContain("u/i/o tabs");
  expect(footerHints("list", 160, true)).toEqual(["enter apply", "esc clear"]);
  expect(footerHints("list", 80, false)).toEqual(["? help", "q quit"]);
});
