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
