import { RGBA } from "@opentui/core";

export const selectionBackground = "#2d303c";
export const inactiveBorder = "#50556c";
export const activeBorder = "#a99cfa";
export const stateColors: Record<string, RGBA> = {
  "In progress": RGBA.fromIndex(14),
  Queued: RGBA.fromIndex(12),
  Blocked: RGBA.fromIndex(9),
  Held: RGBA.fromIndex(11),
  Done: RGBA.fromIndex(2),
  Archived: RGBA.fromIndex(8),
};
export function overviewBorder(
  panel: "browse" | "list",
  mode: string,
  focus: string,
): string {
  return (
    panel === "browse" ? mode === "browse" : mode === "list" && focus === "list"
  )
    ? activeBorder
    : inactiveBorder;
}
export function taskBorder(status: string): RGBA {
  return stateColors[status] ?? RGBA.fromIndex(8);
}
