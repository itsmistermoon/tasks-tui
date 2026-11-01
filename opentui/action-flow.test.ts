import { expect, test } from "bun:test";
import { createAction, taskActions, type ActionContext } from "./actions";
import { chooseAction, flowKey, openMenu, pickerOptions, typeValue, type Flow, type FlowKey } from "./action-flow";
import type { Task } from "./tasks";

const task = (data: Record<string, any>): Task => ({ Key: `/one/backlog.md:${data.id}`, Source: "/one/backlog.md", Archived: false, Data: { title: "Title", state: "queued", held: "no", deps: "none", body: "", ...data } });
const context = (tasks: Task[]): ActionContext => ({ tasks, backlogs: ["/one/backlog.md", "/two/backlog.md"], name: (path) => path.split("/")[1] });
const press = (flow: Flow, ...keys: (string | FlowKey)[]) => {
  let step = { flow: flow as Flow | null, effect: undefined as any, handled: true };
  for (const key of keys) step = flowKey(step.flow!, typeof key === "string" ? { name: key.length === 1 ? key : key, sequence: key.length === 1 ? key : "" } : key);
  return step;
};

test("a menu key without fields runs the action at once", () => {
  const a = task({ id: "a" });
  const step = press(openMenu("actions · a", taskActions([a], context([a]))), "s");
  expect(step.flow).toBeNull();
  expect(step.effect?.action.label).toBe("start");
});

test("fields are filled in order and confirmation runs only on y", () => {
  const a = task({ id: "a" });
  let step = press(openMenu("actions · a", taskActions([a], context([a]))), "t");
  expect(step.flow?.stage).toBe("form");
  step = { ...step, flow: typeValue(step.flow!, "New title") };
  step = press(step.flow!, "return");
  expect(step.flow?.stage).toBe("confirm");
  expect(press(step.flow!, "x").flow?.stage).toBe("confirm");
  expect(press(step.flow!, "n").flow).toBeNull();
  const run = press(step.flow!, "y");
  expect(run.effect?.action.commands(run.effect.values)).toEqual([["update", "a", "--title", "New title", "--file", "/one/backlog.md"]]);
});

test("? explains the action and returns to the same dialog with its values", () => {
  const a = task({ id: "a" });
  const flow = press(openMenu("actions · a", taskActions([a], context([a]))), "h").flow!;
  const explained = press(flow, "?").flow!;
  expect(explained.stage).toBe("explain");
  const back = press(explained, "x").flow!;
  expect(back).toEqual(flow);
  expect(press(openMenu("m", taskActions([a], context([a]))), "?").flow?.stage).toBe("explain");
});

test("editable fields explain on ? only while empty; escape cancels and q remains text", () => {
  const a = task({ id: "a" });
  let text = press(openMenu("actions · a", taskActions([a], context([a]))), "h").flow!;
  expect(press(text, "?").flow?.stage).toBe("explain");
  expect(press(text, "q").handled).toBe(false);
  expect(press(text, "escape").flow).toBeNull();
  text = typeValue(text, "wait");
  expect(press(text, "?").handled).toBe(false);
  text = typeValue(text, "");
  expect(press(text, "?").flow?.stage).toBe("explain");

  const b = task({ id: "b" });
  let picker = press(openMenu("actions · a", taskActions([a], context([a, b]))), "b").flow!;
  expect(press(picker, "?").flow?.stage).toBe("explain");
  picker = typeValue(picker, "b");
  expect(press(picker, "?").handled).toBe(false);
  expect(press(picker, "q").handled).toBe(false);
  picker = typeValue(picker, "");
  expect(press(picker, "?").flow?.stage).toBe("explain");
  expect(press(picker, "escape").flow).toBeNull();

  const notesAction = { ...taskActions([a], context([a])).find((action) => action.key === "n")! };
  let notes = chooseAction(notesAction, "actions · a").flow!;
  expect(press(notes, "?").flow?.stage).toBe("explain");
  expect(press(notes, "q").handled).toBe(false);
  notes = typeValue(notes, "existing note");
  expect(press(notes, "?").handled).toBe(false);
  notes = typeValue(notes, "");
  expect(press(notes, "?").flow?.stage).toBe("explain");
  expect(press(notes, "escape").flow).toBeNull();
});

test("required fields stay open until filled; optional ones can be skipped", () => {
  const a = task({ id: "a" });
  let flow = press(openMenu("actions · a", taskActions([a], context([a]))), "h").flow!;
  expect(press(flow, "return").flow).toEqual(flow);
  flow = press(typeValue(flow, "waiting"), "return").flow!;
  const run = press(flow, "return");
  expect(run.effect?.action.commands(run.effect.values)).toEqual([["hold", "a", "--reason", "waiting", "--file", "/one/backlog.md"]]);
});

test("pickers search their options and accept a typed path when allowed", () => {
  const a = task({ id: "a" }), b = task({ id: "b", title: "Bravo" }), c = task({ id: "c", title: "Charlie" });
  let flow = press(openMenu("actions · a", taskActions([a], context([a, b, c]))), "b").flow!;
  flow = typeValue(flow, "char");
  expect(pickerOptions(flow).map((option) => option.value)).toEqual(["c"]);
  expect(press(flow, "return").effect?.values.other).toBe("c");
  let move = press(openMenu("actions · a", taskActions([a], context([a]))), "m").flow!;
  move = typeValue(move, "/three");
  expect(pickerOptions(move).at(-1)).toEqual({ value: "/three", label: "use /three" });
  expect(press(move, "return").flow?.stage).toBe("confirm");
});

test("choice fields take their option keys", () => {
  let flow = chooseAction(createAction("/one/backlog.md", context([])), "one").flow!;
  for (const [value, key] of [["Fix", "return"], ["", "return"]]) flow = press(typeValue(flow, value), key).flow!;
  flow = press(flow, "s").flow!;
  flow = press(flow, "return", "return").flow!;
  const run = press(flow, "2");
  expect(run.effect?.action.commands(run.effect.values)).toEqual([["add", "Fix", "--mint", "--start", "--priority", "2", "--file", "/one/backlog.md"]]);
});
