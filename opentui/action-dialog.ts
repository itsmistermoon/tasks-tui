import { BoxRenderable, InputRenderable, RGBA, StyledText, TextareaRenderable, TextRenderable, fg, type CliRenderer } from "@opentui/core";
import { formatCommand } from "./actions";
import { currentField, flowCommands, pickerOptions, type Flow } from "./action-flow";
import { activeBorder } from "./panel-theme";
import { truncateText } from "./truncate";

// Draws the action flow inside the modal box; typing in a field is reported through onType.
const muted = "#858796", label = "#b8bac5", body = "#d8d8de";
const pickerRows = 8;

export function flowTitle(flow: Flow): string {
  if (flow.stage === "menu" || flow.stage === "form") return flow.stage === "menu" ? flow.title : `${flow.action.label} · ${flow.title}`;
  if (flow.stage === "confirm") return flow.action.question || flow.action.label;
  return `about ${flow.action.label}`;
}

const rows = (value: string, width: number) => value.split("\n").reduce((sum, row) => sum + Math.max(1, Math.ceil(Bun.stringWidth(row) / Math.max(1, width))), 0);
const affected = (flow: Flow) => (flow.stage === "confirm" ? flow.action.affected?.(flow.values) || [] : []);
const fieldHasValue = (flow: Extract<Flow, { stage: "form" }>, field: NonNullable<ReturnType<typeof currentField>>) =>
  field.type === "picker" ? !!flow.filter : !!flow.values[field.name];

export function flowSize(flow: Flow, terminalWidth: number): { width: number; height: number } {
  if (flow.stage === "menu") {
    const width = Math.max(Bun.stringWidth(flow.title), Bun.stringWidth("j/k choose · ↵ run · ? about · esc close"), ...flow.actions.map((action) => Bun.stringWidth(action.label + (action.confirm || action.fields.length ? "…" : "")) + 6)) + 4;
    return { width, height: flow.actions.length + 6 };
  }
  const width = 76, inner = Math.min(terminalWidth - 2, width) - 4;
  if (flow.stage === "explain") return { width, height: rows(flow.action.explain, inner) + 6 };
  if (flow.stage === "confirm") {
    const commands = flowCommands(flow).map(formatCommand).join("\n");
    const tasks = affected(flow);
    return { width, height: rows(commands, inner) + rows(flow.action.warning || "", inner) + (tasks.length ? rows("tasks: " + tasks.join(", "), inner) : 0) + 9 };
  }
  const field = currentField(flow)!;
  const done = flow.field;
  const editor = field.type === "multiline" ? Math.max(8, Math.min(22, flow.values[field.name].split("\n").length + 4)) : field.type === "choice" ? field.options!.length : field.type === "picker" ? Math.min(pickerRows, Math.max(1, pickerOptions(flow).length)) + 1 : 1;
  return { width, height: done + editor + 7 };
}

export function renderFlow(renderer: CliRenderer, panel: BoxRenderable, flow: Flow, width: number, onType: (value: string) => void): void {
  const text = (id: string, content: any, color: any, options: any = {}) => new TextRenderable(renderer, { id, content, fg: color, wrapMode: "word", width: "100%", ...options });
  const line = (id: string, content: any, color: any) => text(id, content, color, { height: 1 });
  const hints = (id: string, items: string[]) => {
    const bar = new BoxRenderable(renderer, { id, flexDirection: "row", justifyContent: "flex-end", width: "100%", height: 1, flexShrink: 0 });
    bar.add(new TextRenderable(renderer, { id: id + "-text", content: items.join(" · "), fg: muted, height: 1 }));
    return bar;
  };
  const spacer = (id: string) => new BoxRenderable(renderer, { id, flexGrow: 1, minHeight: 1 });
  const inner = Math.max(1, width - 4);
  if (flow.stage === "menu") {
    flow.actions.forEach((action, i) => {
      const row = new BoxRenderable(renderer, { id: "action-" + i, flexDirection: "row", width: "100%", height: 1 });
      const selected = i === flow.index;
      const name = line("action-label-" + i, truncateText((selected ? "› " : "  ") + action.label + (action.confirm || action.fields.length ? "…" : ""), Math.max(1, inner - 3), 1), selected ? activeBorder : body);
      name.attributes = selected ? 1 : 0;
      name.flexGrow = 1;
      row.add(name);
      row.add(new TextRenderable(renderer, { id: "action-key-" + i, content: action.key, fg: muted, width: 1, height: 1, flexShrink: 0 }));
      panel.add(row);
    });
    panel.add(spacer("actions-spacer"));
    panel.add(hints("actions-hint", ["j/k choose", "↵ run", "? about", "esc close"]));
    return;
  }
  if (flow.stage === "explain") {
    panel.add(text("explain-text", flow.action.explain, body));
    panel.add(spacer("explain-spacer"));
    panel.add(hints("explain-hint", ["press any key to return"]));
    return;
  }
  if (flow.stage === "confirm") {
    const tasks = affected(flow);
    if (flow.action.warning) panel.add(text("confirm-warning", flow.action.warning, RGBA.fromIndex(9)));
    if (flow.action.backlog) panel.add(text("confirm-backlog", new StyledText([fg(body)("backlog: "), fg("#86aaf5")(flow.action.backlog)]), RGBA.defaultForeground()));
    if (tasks.length) panel.add(text("confirm-tasks", new StyledText([fg(body)("tasks: "), fg("#86aaf5")(tasks.join(", "))]), RGBA.defaultForeground()));
    panel.add(line("confirm-gap", " ", RGBA.fromIndex(8)));
    panel.add(text("confirm-command", flowCommands(flow).map(formatCommand).join("\n"), RGBA.fromIndex(14), { wrapMode: "char" }));
    panel.add(spacer("confirm-spacer"));
    const decision = new BoxRenderable(renderer, { id: "confirm-hint", flexDirection: "row", justifyContent: "flex-end", width: "100%", height: 1, flexShrink: 0 });
    decision.add(line("confirm-keys", new StyledText([fg(muted)("? about   "), fg(activeBorder)("[y]"), fg(body)(` ${flow.action.verb}   `), fg(activeBorder)("[n]"), fg(body)(" cancel")]), RGBA.defaultForeground()));
    panel.add(decision);
    return;
  }
  // Earlier answers stay visible above the field being edited.
  flow.action.fields.slice(0, flow.field).forEach((field, i) => {
    const value = field.type === "choice" ? field.options!.find((option) => option.value === flow.values[field.name])?.label || "" : flow.values[field.name] || "-";
    panel.add(line("field-done-" + i, truncateText(`${field.label} ${value.split("\n")[0]}`, inner, 1), muted));
  });
  const field = currentField(flow)!;
  panel.add(line("field-label", field.label, label));
  if (field.type === "choice") {
    field.options!.forEach((option, i) => {
      const selected = i === flow.pick;
      const row = line("choice-" + i, `${selected ? "› " : "  "}${option.key ? option.key + "  " : ""}${option.label}`, selected ? activeBorder : body);
      row.attributes = selected ? 1 : 0;
      panel.add(row);
    });
    panel.add(spacer("field-spacer"));
    panel.add(hints("field-hint", ["press a key or ↵ choose", "? about", "esc cancel"]));
    return;
  }
  if (field.type === "multiline") {
    const editor = new TextareaRenderable(renderer, { id: "notes-editor", width: "100%", flexGrow: 1, minHeight: 3, initialValue: flow.values[field.name], wrapMode: "word", backgroundColor: "transparent", focusedBackgroundColor: "transparent" });
    panel.add(editor);
    editor.focus();
    const hint = hints("field-hint", ["↵ new line", "ctrl+s review", ...(fieldHasValue(flow, field) ? [] : ["? about"]), "esc cancel"]);
    const hintText = hint.findDescendantById("field-hint-text") as TextRenderable;
    editor.on("input", (value: string) => {
      onType(value);
      hintText.content = ["↵ new line", "ctrl+s review", ...(value ? [] : ["? about"]), "esc cancel"].join(" · ");
    });
    panel.add(hint);
    return;
  }
  const input = new InputRenderable(renderer, { id: "action-input", width: "100%", value: flow.filter, placeholder: field.type === "picker" ? "type to search" : "", backgroundColor: "transparent", focusedBackgroundColor: "transparent" });
  const last = flow.field === flow.action.fields.length - 1;
  const hintItems = (value: string) => [...(field.type === "picker" ? ["↑↓ choose"] : []), last ? (flow.action.confirm ? "↵ review" : "↵ run") : "↵ next", ...(!value ? ["? about"] : []), "esc cancel"];
  const hint = hints("field-hint", hintItems(flow.filter));
  const hintText = hint.findDescendantById("field-hint-text") as TextRenderable;
  input.on("input", (value: string) => {
    onType(value);
    hintText.content = hintItems(value).join(" · ");
  });
  panel.add(input);
  input.focus();
  if (field.type === "picker") {
    const options = pickerOptions(flow);
    const first = Math.max(0, Math.min(flow.pick - pickerRows + 1, options.length - pickerRows));
    if (!options.length) panel.add(line("picker-empty", field.custom ? "type a value" : "no matches", muted));
    options.slice(first, first + pickerRows).forEach((option, i) => {
      const selected = first + i === flow.pick;
      const row = line("picker-" + (first + i), truncateText((selected ? "› " : "  ") + option.label, inner, 1), selected ? activeBorder : body);
      row.attributes = selected ? 1 : 0;
      panel.add(row);
    });
  }
  panel.add(spacer("field-spacer"));
  panel.add(hint);
}
