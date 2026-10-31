import { expect, test } from "bun:test";
import { moveFocus, type FocusState } from "./navigation";

const initial: FocusState = { panel: "browse", cardIndex: 0, home: true, width: 160 };

test("Home navigation crosses cards and returns through the first card", () => {
  const cards = moveFocus(initial, "right");
  expect(cards).toEqual({ ...initial, panel: "cards" });
  const next = moveFocus(cards, "right");
  expect(next.cardIndex).toBe(1);
  expect(moveFocus(next, "down").panel).toBe("list");
  expect(moveFocus({ ...next, panel: "list" }, "left").panel).toBe("browse");
  expect(moveFocus({ ...next, panel: "browse" }, "right").cardIndex).toBe(0);
});

test("other views move directly between Browse, Backlog and Inspector", () => {
  const browse = { ...initial, home: false, width: 90 };
  const list = moveFocus(browse, "right");
  expect(list.panel).toBe("list");
  expect(moveFocus(list, "right").panel).toBe("inspector");
  expect(moveFocus({ ...list, panel: "inspector" }, "left").panel).toBe("list");
});

test("layout follows focus and returns to full layout when width grows", async () => {
  const { panelLayout } = await import("./navigation");
  expect(panelLayout(100, "browse", false, true, false)).toEqual({ sidebar: true, inspector: false });
  expect(panelLayout(100, "list", false, true, false)).toEqual({ sidebar: false, inspector: true });
  expect(panelLayout(160, "detail", false, true, false)).toEqual({ sidebar: true, inspector: true });
  expect(panelLayout(100, "detail", false, true, true)).toEqual({ sidebar: false, inspector: false });
});

test("the inspector keeps its tab for the same task and resets for a different task", async () => {
  const { tabAfterTaskSelection } = await import("./navigation");
  expect(tabAfterTaskSelection("one", "one", "history")).toBe("history");
  expect(tabAfterTaskSelection("one", "two", "history")).toBe("detail");
  expect(tabAfterTaskSelection(undefined, "one", "links")).toBe("detail");
});
