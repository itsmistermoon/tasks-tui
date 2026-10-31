import { expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { commandArgs, formatCommand, runTasksAxi, taskActions } from "./actions";
import type { Task } from "./tasks";

const task = (data: Record<string, any>, archived = false): Task => ({
  Key: `/one/backlog.md:${data.id}`,
  Source: "/one/backlog.md",
  Archived: archived,
  Data: { title: "Title", state: "queued", held: "no", deps: "none", body: "", ...data },
});
const keys = (t: Task) => taskActions(t).map((action) => action.key);

test("offers actions that match the task state", () => {
  expect(keys(task({ id: "a" }))).toEqual(["s", "d", "h", "b", "t", "n", "m", "P", "D"]);
  expect(keys(task({ id: "a", state: "in_flight", held: "yes", deps: "blocked-by:b" }))).toEqual(["d", "r", "h", "b", "u", "t", "n", "m", "P", "D"]);
  expect(keys(task({ id: "a", state: "done" }))).toEqual(["r", "t", "n", "m", "P", "D"]);
  expect(keys(task({ id: "a" }, true))).toEqual([]);
});

test("only irreversible or bulk actions require confirmation", () => {
  const confirmed = taskActions(task({ id: "a" })).filter((action) => action.confirm).map((action) => action.args("x")[0]);
  expect(confirmed).toEqual(["update", "update", "mv", "prune", "rm"]);
  expect(taskActions(task({ id: "a" })).every((action) => !action.confirm || (!!action.warning && !!action.question && !!action.verb))).toBe(true);
});

test("builds the tasks-axi command for the task's backlog", () => {
  const t = task({ id: "a", state: "in_flight", deps: "blocked-by:b,blocked-by:c" });
  const unblock = taskActions(t).find((action) => action.key === "u")!;
  expect(unblock.input?.initial).toBe("b");
  expect(commandArgs(unblock, t, "c")).toEqual(["unblock", "a", "--by", "c", "--file", "/one/backlog.md", "--json"]);
  expect(formatCommand(["hold", "a", "--reason", "it's late", "--file", "/one/backlog.md"])).toBe(
    `tasks-axi hold a --reason 'it'\\''s late' --file /one/backlog.md`,
  );
});

test("runs tasks-axi and reports its result or its error unchanged", async () => {
  const file = join(await mkdtemp(join(tmpdir(), "tasks-tui-actions-")), "backlog.md");
  expect((await runTasksAxi(["add", "a1", "Alpha", "--file", file, "--json"])).ok).toBe(true);
  const t = task({ id: "a1", title: "Alpha" });
  t.Source = file;
  const start = taskActions(t).find((action) => action.key === "s")!;
  expect(await runTasksAxi(commandArgs(start, t))).toEqual({ ok: true, message: "✔ start a1" });
  expect(await readFile(file, "utf8")).toContain("## In flight\n- [ ] a1 - Alpha");
  const failed = await runTasksAxi(["start", "missing", "--file", file, "--json"]);
  expect(failed.ok).toBe(false);
  expect(failed.message).toStartWith('error: "Task \\"missing\\" not found in this backlog"\ncode: NOT_FOUND');
  expect(await runTasksAxi(["start", "a1"], join(tmpdir(), "no-such-tasks-axi"))).toMatchObject({ ok: false });
});
