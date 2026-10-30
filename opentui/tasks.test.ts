import { expect, test } from "bun:test";
import { countTasks, filterTasks, status, type Task } from "./tasks";

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
      "In progress": 1,
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
          "In progress": 1,
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
          "In progress": 0,
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
