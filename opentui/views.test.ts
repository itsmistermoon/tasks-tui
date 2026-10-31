import { expect, test } from "bun:test";
import { projectView } from "./views";
import type { Task } from "./tasks";
const task = (id: string, state: string, source = "a"): Task => ({ Key: id, Source: source, Archived: false, Data: { id, title: id, state, kind: "task", repo: "demo" } });
test("Browse counts and Backlog share the selected source and completion setting", () => {
  const tasks = [task("one", "queued"), task("two", "done"), task("three", "queued", "b")];
  const view = projectView(tasks, ["a", "b"], { source: "a", group: "status:All", query: "", showDone: false });
  expect(view.tasks.map((t) => t.Key)).toEqual(["one"]);
  expect(view.browse.find((v) => v.group === "status:All")?.count).toBe(1);
  expect(view.browse.find((v) => v.source === "a" && v.group === "")?.count).toBe(1);
  const shown = projectView(tasks, ["a", "b"], { source: "a", group: "status:All", query: "", showDone: true });
  expect(shown.tasks.map((t) => t.Key)).toEqual(["one", "two"]);
  expect(shown.browse.find((v) => v.group === "status:All")?.count).toBe(2);
});

test("Home filters both recent sections before limiting them", () => {
  const tasks = ["done", "archived"].flatMap((state) =>
    Array.from({ length: 6 }, (_, i) => ({
      ...task(`${state}-${i}`, state),
      Archived: state === "archived",
      ArchivedAt: `2026-01-0${i + 1}`,
      Data: { id: `${state}-${i}`, title: i === 0 ? "needle" : "other", state, closed: `2026-01-0${i + 1}` },
    })),
  );
  const view = projectView(tasks, [], { source: "", group: "home", query: "NEEDLE", showDone: false });
  expect(view.tasks.map((t) => t.Key)).toEqual(["done-0", "archived-0"]);
});
