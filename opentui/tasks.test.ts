import { expect, test } from "bun:test";
import { filterTasks, status, type Task } from "./tasks";

const task = (id: string, state: string, extra: Partial<Task> = {}): Task => ({
  Key: id,
  Source: "/one/backlog.md",
  Archived: false,
  Data: { id, title: id, state, repo: "demo", priority: "-" },
  ...extra,
});
const filters = { query: "", source: "", group: "", showDone: false };

test("status views distinguish active, held, blocked, done and archived work", () => {
  const tasks = [
    task("done", "done"),
    task("blocked", "queued", { Data: { state: "queued", blocked: "yes" } }),
    task("active", "in_flight"),
    task("archived", "done", { Archived: true }),
    task("queued", "queued"),
  ];
  expect(filterTasks(tasks, filters).map((t) => t.Key)).toEqual([
    "active",
    "queued",
    "blocked",
  ]);
  expect(
    filterTasks(tasks, { ...filters, group: "status:Archived" }).map(
      (t) => t.Key,
    ),
  ).toEqual(["archived"]);
  expect(
    status(task("held", "queued", { Data: { state: "queued", held: "yes" } })),
  ).toBe("Held");
});

test("search reaches completed and archived data regardless of active filters", () => {
  const tasks = [
    task("first", "queued"),
    task("finished", "done", {
      Data: { state: "done", body: "unique search term" },
    }),
  ];
  expect(
    filterTasks(tasks, {
      ...filters,
      query: "SEARCH TERM",
      source: "/different",
      group: "status:Queued",
    }).map((t) => t.Key),
  ).toEqual(["finished"]);
});
