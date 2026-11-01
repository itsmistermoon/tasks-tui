# Scroll panels in place instead of rebuilding them

## Context

`render()` destroys and recreates the whole renderable tree. A rebuilt `ScrollBoxRenderable` has no scroll range until OpenTUI lays it out, so an offset assigned while building it is clamped to zero and has to be reapplied after layout. When a scroll key triggers `render()`, every key press draws one frame at the top and a second frame at the restored offset, and the panel visibly jitters. The task list, the Browse sidebar, and the command output panel each showed this in their first implementation.

## Decision

- Scroll keys change the existing scroll box: call `scrollBy`, `scrollTop`, or `scrollChildIntoView` on it and update only the rows whose appearance changes. `selectTask` and `selectBrowse` in `opentui/navigation.ts`, the inspector's `scroll.scrollBy`, and the command panel's scroll keys follow this rule.
- Call `render()` only when the structure changes: focus moves to another panel, a dialog opens or closes, or the data changes.
- When a rebuild is unavoidable, remember the offset and reapply it with `restoreScrollTop` from `opentui/scrollbar.ts` (or `restoreTaskViewport` for the task list), which waits until the box has a size.

## Consequences

Each scrollable panel keeps a reference to its live scroll box and its last offset. New scrollable panels must follow the same rule; a scroll key that calls `render()` is a bug.
