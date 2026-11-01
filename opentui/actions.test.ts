import { expect, test } from "bun:test";
import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { backlogActions, connectedTasks, createAction, formatCommand, runTasksAxi, taskActions, type ActionContext } from "./actions";
import type { Task } from "./tasks";

const task = (data: Record<string, any>, archived = false, source = "/one/backlog.md"): Task => ({
  Key: `${source}:${data.id}`,
  Source: source,
  Archived: archived,
  Data: { title: "Title", state: "queued", held: "no", deps: "none", body: "", ...data },
});
const context = (tasks: Task[] = []): ActionContext => ({ tasks, backlogs: ["/one/backlog.md", "/two/backlog.md"], name: (path) => path.split("/")[1] });
const keys = (...selection: Task[]) => taskActions(selection, context(selection)).map((action) => action.key);

test("offers actions that match the task state", () => {
  expect(keys(task({ id: "a" }))).toEqual(["s", "d", "l", "h", "b", "p", "t", "n", "m", "D"]);
  expect(keys(task({ id: "a", state: "in_flight", held: "yes", deps: "blocked-by:b" }))).toEqual(["d", "l", "r", "h", "b", "u", "p", "t", "n", "m", "D"]);
  expect(keys(task({ id: "a", state: "done" }))).toEqual(["l", "r", "p", "t", "n", "m", "D"]);
  expect(keys(task({ id: "a" }, true))).toEqual([]);
});

test("several marked tasks share only the actions that apply to all of them", () => {
  const queued = task({ id: "a" }), flying = task({ id: "b", state: "in_flight" });
  expect(keys(queued, flying)).toEqual(["d", "h", "p", "m", "D"]);
  const done = taskActions([queued, flying], context([queued, flying])).find((action) => action.key === "d")!;
  expect(done.confirm).toBe(true);
  expect(done.affected!({})).toEqual(["a", "b"]);
  expect(done.commands({})).toEqual([["done", "a", "--no-prune", "--file", "/one/backlog.md"], ["done", "b", "--no-prune", "--file", "/one/backlog.md"]]);
  expect(done.inverse).toBeUndefined();
});

test("irreversible actions ask first and reversible ones carry their undo", () => {
  const t = task({ id: "a", state: "in_flight" });
  const actions = taskActions([t], context([t]));
  expect(actions.filter((action) => action.confirm).map((action) => action.key)).toEqual(["t", "n", "m", "D"]);
  expect(actions.every((action) => action.explain && (!action.confirm || (action.warning && action.question && action.verb)))).toBe(true);
  const find = (key: string) => actions.find((action) => action.key === key)!;
  expect(find("d").inverse!({})).toEqual([["reopen", "a", "--file", "/one/backlog.md"], ["start", "a", "--file", "/one/backlog.md"]]);
  expect(find("r").inverse!({})).toEqual([["start", "a", "--file", "/one/backlog.md"]]);
  expect(find("h").commands({ reason: "it's late", until: "2026-12-01" })).toEqual([["hold", "a", "--reason", "it's late", "--until", "2026-12-01", "--file", "/one/backlog.md"]]);
  expect(find("D").inverse).toBeUndefined();
  expect(find("m").inverse).toBeUndefined();
  expect(formatCommand(find("h").commands({ reason: "it's late" })[0])).toBe(`tasks-axi hold a --reason 'it'\\''s late' --file /one/backlog.md`);
});

test("pickers offer tasks of the same backlog and the current blockers", () => {
  const a = task({ id: "a", deps: "blocked-by:b" }), b = task({ id: "b" }), c = task({ id: "c" }), other = task({ id: "x" }, false, "/two/backlog.md");
  const actions = taskActions([a], context([a, b, c, other]));
  expect(actions.find((action) => action.key === "b")!.fields[0].options!.map((option) => option.value)).toEqual(["c"]);
  expect(actions.find((action) => action.key === "u")!.fields[0].options!.map((option) => option.value)).toEqual(["b"]);
  expect(actions.find((action) => action.key === "m")!.fields[0].options!.map((option) => option.value)).toEqual(["/two/backlog.md"]);
});

test("moving a task brings its connected tasks in one command", () => {
  const a = task({ id: "a", deps: "blocked-by:b" }), b = task({ id: "b" }), c = task({ id: "c", deps: "blocked-by:a" }), d = task({ id: "d" });
  expect(connectedTasks(b, [a, b, c, d]).map((t) => t.Data.id).sort()).toEqual(["a", "b", "c"]);
  const move = taskActions([a], context([a, b, c, d])).find((action) => action.key === "m")!;
  expect(move.question).toBe("move a and 2 connected tasks?");
  expect(move.affected!({}).sort()).toEqual(["a", "b", "c"]);
  expect(move.commands({ to: "/two" })).toEqual([["mv", "a", "b", "c", "--to", "/two", "--file", "/one/backlog.md"]]);
});

test("creating a task mints its id unless one is given", () => {
  const create = createAction("", context());
  expect(create.fields.map((field) => field.name)).toEqual(["title", "id", "backlog", "placement", "kind", "repo", "priority"]);
  expect(create.commands({ title: "Fix it", id: "", backlog: "/two/backlog.md", placement: "queue", priority: "" })).toEqual([["add", "Fix it", "--mint", "--file", "/two/backlog.md"]]);
  expect(createAction("/one/backlog.md", context()).commands({ title: "Fix it", id: "fx-1", placement: "start", kind: "ship", repo: "web", priority: "2" })).toEqual([["add", "fx-1", "Fix it", "--start", "--kind", "ship", "--repo", "web", "--priority", "2", "--file", "/one/backlog.md"]]);
});

test("the backlog menu adds, prunes and renders with confirmation for rewrites", () => {
  const actions = backlogActions("/one/backlog.md", context());
  expect(actions.map((action) => [action.key, action.confirm])).toEqual([["a", false], ["P", true], ["R", true]]);
  expect(actions[1].commands({ keep: "5" })).toEqual([["prune", "--keep", "5", "--state", "done", "--file", "/one/backlog.md"]]);
  expect(actions[2].commands({})).toEqual([["render", "--file", "/one/backlog.md"]]);
});

test("runs tasks-axi and reports its result or its error unchanged", async () => {
  const file = join(await mkdtemp(join(tmpdir(), "tasks-tui-actions-")), "backlog.md");
  expect((await runTasksAxi(["add", "a1", "Alpha", "--file", file])).ok).toBe(true);
  const t = task({ id: "a1", title: "Alpha" }, false, file);
  const start = taskActions([t], context([t])).find((action) => action.key === "s")!;
  expect(await runTasksAxi(start.commands({})[0])).toMatchObject({ ok: true, code: 0, summary: "✔ start a1 -> In flight" });
  expect(await readFile(file, "utf8")).toContain("## In flight\n- [ ] a1 - Alpha");
  const failed = await runTasksAxi(["start", "missing", "--file", file]);
  expect(failed).toMatchObject({ ok: false, code: 1 });
  expect(failed.output).toStartWith('error: "Task \\"missing\\" not found in this backlog"\ncode: NOT_FOUND');
  expect(await runTasksAxi(["start", "a1"], join(tmpdir(), "no-such-tasks-axi"))).toMatchObject({ ok: false });
});

test("preserves combined command output ordering and trailing text", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasks-tui-output-"));
  const bin = join(dir, "tasks-axi");
  await writeFile(bin, "#!/bin/sh\nprintf 'first\\n'\nprintf 'second\\n' >&2\nprintf 'tail  '\nexit 1\n");
  await chmod(bin, 0o755);
  const result = await runTasksAxi([], bin);
  expect(result.output).toBe("first\nsecond\ntail  ");
});
