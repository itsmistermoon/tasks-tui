import { bold, fg, StyledText } from "@opentui/core";

export type HelpPanel = "browse" | "cards" | "list" | "detail" | "links" | "history";
type Binding = [string, string];

export function helpBindings(panel: HelpPanel, width: number): { title: string; bindings: Binding[] }[] {
  const commonList: Binding[] = [["↑ ↓ j k", "move selection"], ["home end", "first / last"], ["pgup pgdn", "page"]];
  let title: string;
  let bindings: Binding[];
  if (panel === "browse") {
    title = "browse";
    bindings = [...commonList, ["enter", "open selected view"]];
  } else if (panel === "cards") {
    title = "status cards";
    bindings = [["← → h l", "select status"], ["↓ j", "go to task list"], ["enter", "open selected status"]];
  } else if (panel === "list") {
    title = "backlog";
    bindings = [...commonList, ["enter", "open inspector"], ["↑ k", "from first task, go to cards in Home"]];
  } else {
    title = `inspector · ${panel}`;
    bindings = [["u i o", "detail / links / history"], ["pgup pgdn", "previous / next task"], ["↑ ↓ j k", panel === "links" ? "select link" : "scroll"]];
    if (panel === "links") bindings.push(["enter", "open selected link"]);
    if (width < 150) bindings.push(["e", "toggle inspector expansion"]);
    bindings.push(["↑ k", "from top, go to cards in Home"]);
  }
  return [{ title, bindings }, { title: "everywhere", bindings: [
    ["← → h l", "move between panels"], ["/", "filter current view"],
    ["d", "show or hide completed tasks"], ["a", "add a backlog source"],
    ["r", "refresh or reload detail"], ["?", "open help"],
    ["q ctrl+c", "quit"],
  ] }];
}

export function helpContent(panel: HelpPanel, width: number): StyledText {
  const chunks = [];
  const sections = helpBindings(panel, width);
  sections.forEach(({ title, bindings }, index) => {
    if (index) chunks.push(fg("#d8d8de")("\n"));
    chunks.push(fg("#a99cfa")(bold(title + "\n")));
    for (const [key, action] of bindings)
      chunks.push(fg("#86aaf5")(bold(key.padEnd(16))), fg("#d8d8de")(action + "\n"));
  });
  return new StyledText(chunks);
}

export function helpDimensions(panel: HelpPanel, terminalWidth: number, terminalHeight: number) {
  const sections = helpBindings(panel, terminalWidth);
  const lines = sections.flatMap(({ title, bindings }, i) => [ ...(i ? [""] : []), title, ...bindings.map(([key, action]) => key.padEnd(16) + action) ]);
  lines.push("", "press any key to close");
  const desired = Math.max(...lines.map((line) => Bun.stringWidth(line)), 4) + 4;
  const width = Math.max(1, Math.min(terminalWidth - 2, desired));
  const contentWidth = Math.max(1, width - 4);
  const contentHeight = lines.reduce((sum, line) => sum + Math.max(1, Math.ceil(Bun.stringWidth(line) / contentWidth)), 0);
  const height = Math.max(3, Math.min(terminalHeight - 2, contentHeight + 4));
  return { width, height };
}

export function footerHints(panel: HelpPanel, width: number, filtering: boolean): string[] {
  if (width < 105) return ["? help", "q quit"];
  if (filtering) return ["enter apply", "esc clear"];
  if (width < 150) return ["/ filter", "d show done", "a add source", "r refresh", "? help", "q quit"];
  const panelHints: Record<HelpPanel, string[]> = {
    browse: ["j/k choose", "enter open", "h/l move"],
    cards: ["h/l choose", "j list", "enter open"],
    list: ["j/k choose", "enter inspect", "h/l move"],
    detail: ["j/k scroll", "u/i/o tabs", "h back"],
    links: ["j/k choose", "enter open", "u/i/o tabs", "h back"],
    history: ["j/k scroll", "u/i/o tabs", "h back"],
  };
  return [...panelHints[panel], "/ filter", "? help", "q quit"];
}
