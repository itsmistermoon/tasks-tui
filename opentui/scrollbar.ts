import {
  RGBA,
  type ScrollBarOptions,
  type ScrollBoxRenderable,
} from "@opentui/core";

export const scrollbarOptions: Omit<ScrollBarOptions, "orientation"> = {
  showArrows: false,
  trackOptions: {
    foregroundColor: RGBA.fromIndex(8),
    backgroundColor: "transparent",
  },
};

export function hideScrollbars<T extends ScrollBoxRenderable>(scroll: T): T {
  scroll.verticalScrollBar.visible = false;
  scroll.horizontalScrollBar.visible = false;
  return scroll;
}

// A rebuilt scroll box has no scroll range until it is laid out, so restore its
// offset once its size is known. Scroll keys should call scrollBy on the existing
// box instead of rebuilding it; see docs/adr/0001-scroll-in-place.md.
export function restoreScrollTop(scroll: ScrollBoxRenderable, offset: number): void {
  if (offset <= 0) return;
  let restored = false;
  const restore = () => {
    if (restored || scroll.isDestroyed || scroll.viewport.height <= 0 || scroll.scrollHeight <= 0) return;
    scroll.scrollTop = offset;
    restored = true;
  };
  for (const node of [scroll.content, scroll.viewport]) {
    const original = node.onSizeChange;
    node.onSizeChange = () => {
      original?.call(node);
      restore();
    };
  }
  setTimeout(restore, 0);
}
