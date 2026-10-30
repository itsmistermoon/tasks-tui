import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { countTasks, type Task } from "./tasks";

const appSource = await readFile(new URL("./app.ts", import.meta.url), "utf8");

test("visible task total is available to the task list renderer", () => {
  expect(appSource).toMatch(
    /import\s*\{[^}]*\bcountTasks\b[^}]*\}\s*from\s*["']\.\/tasks["']/s,
  );

  const tasks: Task[] = [
    {
      Key: "task-1",
      Source: "/backlog.md",
      Archived: false,
      Data: { id: "task-1", title: "Visible task", state: "queued" },
    },
  ];
  expect(countTasks(tasks).total).toBe(1);
  expect(appSource).toContain("return countTasks(data.tasks).total");
});
