import {
  BoxRenderable,
  TextRenderable,
  type ScrollBoxRenderable,
} from "@opentui/core";
import { selectionBackground } from "./panel-theme";
import { truncateText } from "./truncate";

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
