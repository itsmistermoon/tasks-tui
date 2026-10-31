import { expect, test } from "bun:test";
import { countTasks, filterTasks, recentTasks, status, type Task } from "./tasks";

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

test("filter respects the selected source and status", () => {
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
  ).toEqual([]);
  expect(filterTasks(tasks, { ...filters, query: "SEARCH TERM", group: "status:Done" }).map((t) => t.Key)).toEqual(["finished"]);
});

test("counts every displayed status and totals tasks by backlog", () => {
  const tasks = [
    task("active", "in_flight"),
    task("queued", "queued"),
    task("blocked", "queued", { Data: { state: "queued", blocked: "yes" } }),
    task("held", "queued", { Data: { state: "queued", held: "yes" } }),
    task("done", "done"),
    task("archived", "queued", { Archived: true }),
    { ...task("other", "done"), Source: "/two/backlog.md" },
  ];
  expect(countTasks(tasks)).toEqual({
    total: 4,
    total_all: 7,
    statuses: {
      "In flight": 1,
      Queued: 1,
      Blocked: 1,
      Held: 1,
      Done: 2,
      Archived: 1,
    },
    sources: {
      "/one/backlog.md": {
        total: 4,
        total_all: 6,
        statuses: {
          "In flight": 1,
          Queued: 1,
          Blocked: 1,
          Held: 1,
          Done: 1,
          Archived: 1,
        },
      },
      "/two/backlog.md": {
        total: 0,
        total_all: 1,
        statuses: {
          "In flight": 0,
          Queued: 0,
          Blocked: 0,
          Held: 0,
          Done: 1,
          Archived: 0,
        },
      },
    },
  });
});


test("recent tasks use closure and archive dates, with undated entries last", () => {
  const tasks = [
    task("undated", "done"),
    task("closed-old", "done", { Data: { state: "done", closed: "2025-01-01", created: "2026-01-01" } }),
    task("closed-new", "done", { Data: { state: "done", closed: "2026-01-01" } }),
    task("archived-old", "done", { Archived: true, ArchivedAt: "2024-01-01" }),
    task("archived-new", "done", { Archived: true, ArchivedAt: "2026-02-01" }),
  ];
  expect(recentTasks(tasks, 2).map((t) => t.Key)).toEqual(["closed-new", "closed-old", "archived-new", "archived-old"]);
});
