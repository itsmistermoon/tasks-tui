import { expect, test } from "bun:test";
import { parseArgs, resolveTask } from "./cli";
import type { Task } from "./tasks";

const task = (id: string): Task => ({
  Key: `/one/backlog.md:${id}`,
  Source: "/one/backlog.md",
  Archived: false,
  Data: { id, title: id },
});

test("parses task id alongside backlog sources", () => {
  expect(parseArgs(["--task", "T-12", "backlog.md", "~/project"])).toEqual({
    taskId: "T-12",
    count: false,
    json: false,
    sources: ["backlog.md", "~/project"],
  });
});

test("parses count output and requires count for JSON", () => {
  expect(parseArgs(["--count", "--json", "backlog.md"])).toEqual({
    count: true,
    json: true,
    sources: ["backlog.md"],
  });
  expect(() => parseArgs(["--json"])).toThrow("--json requires --count");
});

test("count command arguments preserve source and output mode", () => {
  expect(parseArgs(["--count", "--json", "/one/backlog.md"])).toEqual({
    count: true,
    json: true,
    sources: ["/one/backlog.md"],
  });
});

test("requires an id after --task", () => {
  expect(() => parseArgs(["--task", "--help"])).toThrow("--task requires an id");
});

test("resolves a task by its id and returns no match for an unknown id", () => {
  const tasks = [task("T-1"), task("T-2")];
  expect(resolveTask(tasks, "T-2")).toBe(tasks[1]);
  expect(resolveTask(tasks, "missing")).toBeUndefined();
});
