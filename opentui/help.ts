import { fg, StyledText } from "@opentui/core";

const bindings: [string, string][] = [
  ["↑ / ↓", "move between tasks"],
  ["home / end", "first or last task"],
  ["pgup / pgdn", "page; previous / next task in detail"],
  ["↵ / click", "open task or select view"],
  ["esc", "go back; clear search"],
  ["b", "browse backlogs and filters"],
  ["/", "search tasks and archives"],
  ["d", "show or hide completed tasks"],
  ["a", "add a backlog source"],
  ["i", "toggle inspector"],
  ["e", "expand inspector"],
  ["r", "refresh or reload detail"],
  ["t", "task details"],
  ["l", "links and dependencies"],
  ["h", "archived task notes"],
  ["mouse wheel", "scroll panel"],
  ["? / esc", "close help"],
  ["q / ctrl+c", "quit"],
];

export function helpContent(): StyledText {
  const chunks = [fg("#d8d8de")("key             action\n\n")];
  for (const [key, action] of bindings) {
    chunks.push(fg("#858796")(key.padEnd(16)), fg("#d8d8de")(action + "\n"));
  }
  chunks.push(
    fg("#d8d8de")(
      "\nlive: the view refreshes every two seconds\nread only: viewing tasks never changes the backlog",
    ),
  );
  return new StyledText(chunks);
}
