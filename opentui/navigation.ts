import {
  BoxRenderable,
  TextRenderable,
  type ScrollBoxRenderable,
} from "@opentui/core";
import { selectionBackground } from "./panel-theme";
import { truncateText } from "./truncate";
import type { Task } from "./tasks";

// Keep the existing scroll container and change only the two affected titles.
export function selectTask(
  scroll: ScrollBoxRenderable | null,
  previous: number,
  next: number,
) {
  if (!scroll || previous === next) return;
  const oldTitle = scroll.content.findDescendantById(`selection-${previous}`);
  const newTitle = scroll.content.findDescendantById(`selection-${next}`);
  if (oldTitle instanceof BoxRenderable) oldTitle.shouldFill = false;
  if (newTitle instanceof BoxRenderable) {
    newTitle.backgroundColor = selectionBackground;
    newTitle.shouldFill = true;
  }
  scroll.scrollChildIntoView(`task-${next}`);
}

export function restoreTaskViewport(
  scroll: ScrollBoxRenderable,
  offset: number,
  selectedIndex?: number,
): number {
  scroll.scrollTop = offset;
  if (selectedIndex !== undefined && selectedIndex >= 0)
    scroll.scrollChildIntoView(`task-${selectedIndex}`);
  return scroll.scrollTop;
}

export function navigationTarget(
  scroll: ScrollBoxRenderable | null,
  current: number,
  count: number,
  key: string,
  prefix = "task",
): number {
  if (!count) return -1;
  if (key === "home") return 0;
  if (key === "end") return count - 1;
  if (key === "up") return Math.max(0, current - 1);
  if (key === "down") return Math.min(count - 1, current + 1);
  if (!scroll || (key !== "pageup" && key !== "pagedown")) return current;
  const direction = key === "pagedown" ? 1 : -1;
  const currentTask = scroll.getRenderable(`${prefix}-${current}`);
  if (!currentTask) return current;
  const limit =
    currentTask.y + direction * Math.max(1, scroll.viewport.height - 1);
  let target = current;
  for (let i = current + direction; i >= 0 && i < count; i += direction) {
    const item = scroll.getRenderable(`${prefix}-${i}`);
    if (!item) break;
    target = i;
    if (direction > 0 ? item.y >= limit : item.y <= limit) break;
  }
  return target;
}

// Update the existing sidebar in place so moving the cursor never resets its viewport.
export function selectBrowse(
  scroll: ScrollBoxRenderable | null,
  previous: number,
  next: number,
  labels: string[],
  width: number,
  activeIndex: number,
) {
  if (!scroll) return;
  for (const index of [previous, next]) {
    const row = scroll.getRenderable(`nav-${index}`);
    const item = scroll.content.findDescendantById(`nav-label-${index}`);
    if (row instanceof BoxRenderable) row.shouldFill = index === activeIndex;
    if (item instanceof TextRenderable) {
      item.attributes = index === activeIndex ? 1 : 0;
      item.content = truncateText(
        (index === next ? "› " : "  ") + labels[index],
        width,
        1,
      );
      item.fg =
        index === activeIndex
          ? "#191a29"
          : index === next
            ? "#a99cfa"
            : "#b8bac5";
    }
  }
  scroll.scrollChildIntoView(`nav-${next}`);
}

export type FocusState = {
  panel: "browse" | "cards" | "list" | "inspector";
  cardIndex: number;
  home: boolean;
  width: number;
};

export function moveFocus(state: FocusState, direction: "left" | "right" | "down"): FocusState {
  if (state.panel === "cards") {
    if (direction === "down") return { ...state, panel: "list" };
    const next = state.cardIndex + (direction === "right" ? 1 : -1);
    if (next < 0) return { ...state, panel: "browse" };
    return { ...state, cardIndex: Math.min(state.width < 150 ? 3 : 5, next) };
  }
  if (direction === "down") return state;
  if (state.panel === "browse" && direction === "right")
    return state.home ? { ...state, panel: "cards", cardIndex: 0 } : { ...state, panel: "list" };
  if (state.panel === "list") return { ...state, panel: direction === "left" ? "browse" : "inspector" };
  if (state.panel === "inspector" && direction === "left") return { ...state, panel: "list" };
  return state;
}

export function panelLayout(width: number, mode: string, cardsFocused: boolean, inspecting: boolean, expanded: boolean): { sidebar: boolean; inspector: boolean } {
  return {
    sidebar: (mode === "browse" && (width >= 80 || !cardsFocused)) || width >= 150,
    inspector: !expanded && (width >= 150 || (inspecting && width >= 80 && mode !== "browse")),
  };
}

export type InspectorTab = "detail" | "links" | "history";
export function tabAfterTaskSelection(previous: string | undefined, next: string, tab: InspectorTab): InspectorTab {
  return previous === next ? tab : "detail";
}

export function taskSelection(task: Task | null, previous: Task | null, tab: InspectorTab) {
  return {
    selected: task?.Key || "",
    opened: task ? structuredClone(task) : null,
    inspectorMode: task ? tabAfterTaskSelection(previous?.Key, task.Key, tab) : "detail" as InspectorTab,
    inspecting: !!task,
  };
}

export function selectionAfterRemoval(task: Task | null, previous: Task | null, tab: InspectorTab, mode: string) {
  const selection = taskSelection(task, previous, tab);
  return { ...selection, mode: ["detail", "links", "history"].includes(mode) ? (task ? selection.inspectorMode : "list") : mode };
}
