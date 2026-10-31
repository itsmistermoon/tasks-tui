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

const first = { Key: "one", Source: "a", Archived: false, Data: { title: "one" } };
const second = { Key: "two", Source: "a", Archived: false, Data: { title: "two" } };
const state = { selected: "one", opened: first, inspectorMode: "history" as const, inspecting: true, expanded: false, mode: "browse" };

test("refresh replaces selection and resets the tab in Browse and inspector", async () => {
  const { transitionNavigation } = await import("./navigation");
  for (const mode of ["browse", "history"]) {
    const next = transitionNavigation({ ...state, mode }, { type: "sync", tasks: [second], width: 160, preview: true });
    expect([next.selected, next.opened?.Key, next.inspectorMode, next.mode]).toEqual(["two", "two", "detail", mode === "browse" ? "browse" : "detail"]);
  }
});

test("empty results and restored results synchronize the preview", async () => {
  const { transitionNavigation } = await import("./navigation");
  const empty = transitionNavigation(state, { type: "sync", tasks: [], width: 160, preview: true });
  expect([empty.selected, empty.opened]).toEqual(["", null]);
  const restored = transitionNavigation(empty, { type: "sync", tasks: [second], width: 160, preview: true });
  expect([restored.selected, restored.opened?.Key, restored.inspectorMode]).toEqual(["two", "two", "detail"]);
});

test("opening tasks enables compact expansion for all entry paths", async () => {
  const { transitionNavigation } = await import("./navigation");
  for (const mode of ["list", "inspector"] as const) {
    const opened = transitionNavigation({ ...state, selected: "", opened: null, inspecting: false }, { type: "select", task: first, mode });
    expect(opened.inspecting).toBe(true);
    const focused = transitionNavigation(opened, { type: "focus", mode: "detail" });
    expect(transitionNavigation(focused, { type: "expand" }).expanded).toBe(true);
  }
});

test("leaving any inspector tab clears expansion and restores the split", async () => {
  const { transitionNavigation, panelLayout } = await import("./navigation");
  for (const mode of ["detail", "links", "history"]) {
    const next = transitionNavigation({ ...state, mode, expanded: true }, { type: "focus", mode: "list" });
    expect(next.expanded).toBe(false);
    expect(panelLayout(90, next.mode, false, next.inspecting, next.expanded).inspector).toBe(true);
  }
});

test("resizing to full width initializes the selected preview immediately", async () => {
  const { transitionNavigation } = await import("./navigation");
  const compact = transitionNavigation({ ...state, selected: "", opened: null, inspecting: false }, { type: "sync", tasks: [first], width: 70, preview: true });
  expect(compact.opened).toBeNull();
  const resized = transitionNavigation(compact, { type: "resize", width: 160 });
  const next = transitionNavigation(resized, { type: "sync", tasks: [first], width: 160, preview: true });
  expect([next.selected, next.opened?.Key, next.inspecting]).toEqual(["one", "one", true]);
});
