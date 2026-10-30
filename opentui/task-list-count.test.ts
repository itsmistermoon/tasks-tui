import { expect, test } from "bun:test";
import { taskListCountLabel } from "./task-list-count";
import type { Task } from "./tasks";

const tasks: Task[] = [
  {
    Key: "active",
    Source: "/backlog.md",
    Archived: false,
    Data: { id: "active", state: "queued" },
  },
  {
    Key: "done",
    Source: "/backlog.md",
    Archived: false,
    Data: { id: "done", state: "done" },
  },
];

test("task list count label shows active totals and filtered visible counts", () => {
  expect(taskListCountLabel(tasks, 1, false)).toBe("1 tasks");
  expect(taskListCountLabel(tasks, 0, true)).toBe("0 tasks");
});
