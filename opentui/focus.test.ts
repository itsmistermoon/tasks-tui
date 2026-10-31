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

const first = { Key: "one", Source: "a", Archived: false, Data: { title: "one" } };
const second = { Key: "two", Source: "a", Archived: false, Data: { title: "two" } };
const state = { selected: "one", opened: first, inspectorMode: "history" as const, inspecting: true, expanded: false, mode: "browse" as const, modalReturnMode: "list" as const, cardsFocused: false, cardIndex: 0 };

test("inspector tabs share focus and heading color rules", async () => {
  const { isInspectorTab } = await import("./navigation");
  const { inspectorHeadingColor, stateColors } = await import("./panel-theme");
  for (const tab of ["detail", "links", "history"]) {
    expect(isInspectorTab(tab)).toBe(true);
    expect(inspectorHeadingColor("Done", isInspectorTab(tab))).toEqual(stateColors.Done);
    for (const mode of ["browse", "list", "help", "add"]) {
      expect(isInspectorTab(mode)).toBe(false);
      expect(inspectorHeadingColor("Done", isInspectorTab(mode))).toBe("#858796");
    }
  }
});

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

test("a linked task outside the view survives subsequent data synchronization", async () => {
  const { transitionNavigation } = await import("./navigation");
  const linked = transitionNavigation(state, { type: "select", task: second, mode: "inspector" });
  const refreshed = transitionNavigation(linked, { type: "sync", tasks: [first], preserve: second, width: 160, preview: true });
  expect([refreshed.selected, refreshed.opened?.Key, refreshed.mode]).toEqual(["two", "two", "detail"]);
  const same = transitionNavigation({ ...refreshed, inspectorMode: "links", mode: "links" }, { type: "select", task: second, mode: "inspector" });
  expect(same.inspectorMode).toBe("links");
});

test("changing focus or choosing the same task preserves its snapshot until reload", async () => {
  const { transitionNavigation } = await import("./navigation");
  const updated = { ...first, Data: { title: "updated" } };
  const focused = transitionNavigation({ ...state, mode: "history" }, { type: "focus", mode: "list" });
  const list = transitionNavigation(focused, { type: "select", task: updated });
  const inspector = transitionNavigation(list, { type: "select", task: updated, mode: "inspector" });
  const view = transitionNavigation(inspector, { type: "select", task: updated, mode: "list" });
  expect(view.opened).toBe(first);
  expect(view.opened?.Data.title).toBe("one");
  expect(view.inspectorMode).toBe("history");
  const reloaded = transitionNavigation(view, { type: "select", task: updated, mode: "inspector", reload: true });
  expect(reloaded.opened?.Data.title).toBe("updated");
  expect(reloaded.inspectorMode).toBe("history");
  const other = transitionNavigation(reloaded, { type: "select", task: second });
  expect(other.opened?.Key).toBe("two");
  expect(other.inspectorMode).toBe("detail");
});

test("reduced cards preserve Done and Archived navigation", () => {
  for (const cardIndex of [4, 5]) {
    const focused = { ...initial, panel: "cards" as const, width: 90, cardIndex };
    expect(moveFocus(focused, "right").cardIndex).toBe(Math.min(5, cardIndex + 1));
    expect(moveFocus(focused, "left").cardIndex).toBe(cardIndex - 1);
  }
});

test("changing task while either modal is open resets all dependent navigation", async () => {
  const { transitionNavigation } = await import("./navigation");
  for (const modal of ["help", "add"] as const) {
    const history = { ...state, mode: "history" as const, expanded: true, cardIndex: 5 };
    const overlay = transitionNavigation(history, { type: "modal", modal });
    const next = transitionNavigation(overlay, { type: "sync", tasks: [second], width: 160, preview: true });
    expect([next.selected, next.opened?.Key, next.inspectorMode, next.inspecting, next.expanded, next.mode, next.modalReturnMode, next.cardsFocused, next.cardIndex]).toEqual(["two", "two", "detail", true, false, modal, "detail", false, 5]);
    expect(transitionNavigation(next, { type: "dismiss" }).mode).toBe("detail");
  }
});

test("resizing preserves the focused Done or Archived card", async () => {
  const { transitionNavigation } = await import("./navigation");
  for (const cardIndex of [4, 5]) {
    const next = transitionNavigation({ ...state, cardsFocused: true, cardIndex }, { type: "resize", width: 90 });
    expect([next.cardsFocused, next.cardIndex]).toEqual([true, cardIndex]);
  }
});
