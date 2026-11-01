import type { Field, Option, TaskAction, Values } from "./actions";

// The action dialogs as a pure state machine: menu → fields → confirmation → run, with ? explanations.
export type Flow =
  | { stage: "menu"; title: string; actions: TaskAction[]; index: number }
  | { stage: "form"; title: string; action: TaskAction; values: Values; field: number; filter: string; pick: number }
  | { stage: "confirm"; title: string; action: TaskAction; values: Values }
  | { stage: "explain"; title: string; action: TaskAction; back: Flow };
export type FlowEffect = { type: "run"; action: TaskAction; values: Values };
export type FlowKey = { name: string; sequence: string; ctrl?: boolean };
export type FlowStep = { flow: Flow | null; effect?: FlowEffect; handled: boolean };

export function openMenu(title: string, actions: TaskAction[]): Flow {
  return { stage: "menu", title, actions, index: 0 };
}

// Starts an action at its first field, its confirmation, or runs it directly.
export function chooseAction(action: TaskAction, title: string, values: Values = {}): FlowStep {
  const initial = Object.fromEntries(action.fields.map((field) => [field.name, field.initial ?? (field.type === "choice" ? field.options?.[0]?.value ?? "" : "")]));
  return enterField(action, title, { ...initial, ...values }, 0);
}

function enterField(action: TaskAction, title: string, values: Values, index: number): FlowStep {
  const field = action.fields[index];
  if (field) {
    const pick = field.type === "choice" ? Math.max(0, field.options!.findIndex((option) => option.value === values[field.name])) : 0;
    return { flow: { stage: "form", title, action, values, field: index, filter: field.type === "picker" ? "" : values[field.name], pick }, handled: true };
  }
  if (action.confirm) return { flow: { stage: "confirm", title, action, values }, handled: true };
  return { flow: null, effect: { type: "run", action, values }, handled: true };
}

export function currentField(flow: Flow): Field | undefined {
  return flow.stage === "form" ? flow.action.fields[flow.field] : undefined;
}

// Picker options that match the typed filter, followed by the typed value when the field accepts it.
export function pickerOptions(flow: Flow): Option[] {
  const field = currentField(flow);
  if (flow.stage !== "form" || field?.type !== "picker") return [];
  const filter = flow.filter.trim().toLowerCase();
  const matches = (field.options || []).filter((option) => !filter || option.label.toLowerCase().includes(filter));
  return field.custom && filter && !matches.some((option) => option.value === flow.filter.trim()) ? [...matches, { value: flow.filter.trim(), label: `use ${flow.filter.trim()}` }] : matches;
}

// Text typed into the current field, or into the picker's search.
export function typeValue(flow: Flow, value: string): Flow {
  if (flow.stage !== "form") return flow;
  const field = currentField(flow)!;
  if (field.type === "picker") return { ...flow, filter: value, pick: 0 };
  return { ...flow, filter: value, values: { ...flow.values, [field.name]: value } };
}

function submitField(flow: Extract<Flow, { stage: "form" }>, value: string): FlowStep {
  const field = currentField(flow)!;
  if (!field.optional && !value.trim()) return { flow, handled: true };
  return enterField(flow.action, flow.title, { ...flow.values, [field.name]: value }, flow.field + 1);
}

const explain = (flow: Flow, action: TaskAction): FlowStep => ({ flow: { stage: "explain", title: flow.title, action, back: flow }, handled: true });

export function flowKey(flow: Flow, key: FlowKey): FlowStep {
  const name = key.name;
  if (flow.stage === "explain") return { flow: flow.back, handled: true };
  if (flow.stage === "menu") {
    const move = key.sequence === "j" || name === "down" ? 1 : key.sequence === "k" || name === "up" ? -1 : 0;
    if (move) return { flow: { ...flow, index: Math.max(0, Math.min(flow.actions.length - 1, flow.index + move)) }, handled: true };
    if (name === "escape" || key.sequence === "q") return { flow: null, handled: true };
    if (key.sequence === "?") return explain(flow, flow.actions[flow.index]);
    const action = name === "return" ? flow.actions[flow.index] : flow.actions.find((item) => item.key === key.sequence);
    return action ? chooseAction(action, flow.title) : { flow, handled: true };
  }
  if (flow.stage === "confirm") {
    if (key.sequence === "y") return { flow: null, effect: { type: "run", action: flow.action, values: flow.values }, handled: true };
    if (key.sequence === "n" || key.sequence === "q" || name === "escape") return { flow: null, handled: true };
    if (key.sequence === "?") return explain(flow, flow.action);
    // Any other key leaves the confirmation open.
    return { flow, handled: true };
  }
  const field = currentField(flow)!;
  if (name === "escape") return { flow: null, handled: true };
  // Text fields keep ? as text; ctrl+g opens the explanation there.
  if ((key.ctrl && name === "g") || (key.sequence === "?" && field.type === "choice")) return explain(flow, flow.action);
  if (field.type === "choice") {
    const options = field.options!;
    const move = key.sequence === "j" || name === "down" ? 1 : key.sequence === "k" || name === "up" ? -1 : 0;
    if (move) return { flow: { ...flow, pick: Math.max(0, Math.min(options.length - 1, flow.pick + move)) }, handled: true };
    const option = name === "return" ? options[flow.pick] : options.find((item) => item.key === key.sequence);
    return option ? submitField(flow, option.value) : { flow, handled: true };
  }
  if (field.type === "picker") {
    const options = pickerOptions(flow);
    if (name === "down" || name === "up") return { flow: { ...flow, pick: Math.max(0, Math.min(options.length - 1, flow.pick + (name === "down" ? 1 : -1))) }, handled: true };
    if (name === "return") return options[flow.pick] ? submitField(flow, options[flow.pick].value) : field.optional ? submitField(flow, "") : { flow, handled: true };
    return { flow, handled: false };
  }
  // Enter adds a line in the notes editor, so ctrl+s submits it.
  if (field.type === "multiline") return key.ctrl && name === "s" ? submitField(flow, flow.values[field.name] ?? "") : { flow, handled: false };
  if (name === "return") return submitField(flow, flow.values[field.name] ?? "");
  return { flow, handled: false };
}

// Every tasks-axi command the action will run with these values.
export function flowCommands(flow: Flow): string[][] {
  if (flow.stage === "menu") return [];
  if (flow.stage === "explain") return flowCommands(flow.back);
  return flow.action.commands(flow.values);
}
