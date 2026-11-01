import { afterEach, expect, setDefaultTimeout, test } from "bun:test";
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { mountApp } from "./app";
import { runTasksAxi } from "./actions";

setDefaultTimeout(20000);
// Each flow mounts the whole app against temporary backlogs, an isolated HOME and the installed tasks-axi.
const environment = ["HOME", "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "TASKS_AXI_FILE"] as const;
let cleanup: (() => Promise<void>) | null = null;
afterEach(async () => {
  await cleanup?.();
  cleanup = null;
});

async function backlog(name: string, ...tasks: string[][]): Promise<string> {
  const file = join(await mkdtemp(join(tmpdir(), "tasks-tui-flow-")), name, "backlog.md");
  for (const args of tasks) expect((await runTasksAxi([...args, "--file", file])).ok).toBe(true);
  return file;
}

async function mount(files: string[], { width = 160, height = 40 } = {}): Promise<TestRendererSetup & { frame: (text: string) => Promise<string>; keys: (...keys: string[]) => Promise<void> }> {
  const home = await mkdtemp(join(tmpdir(), "tasks-tui-home-"));
  const saved = Object.fromEntries(environment.map((name) => [name, process.env[name]]));
  Object.assign(process.env, { HOME: home, XDG_CONFIG_HOME: join(home, ".config"), XDG_CACHE_HOME: join(home, ".cache") });
  delete process.env.TASKS_AXI_FILE;
  const setup = await createTestRenderer({ width, height });
  cleanup = async () => {
    await setup.dispose();
    for (const name of environment) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  };
  await mountApp({
    renderer: setup.renderer,
    args: files,
    settingsFile: join(home, "settings.json"),
    backend: join(dirname(import.meta.dir), "bin/tasks-backend"),
    tasksAxi: "tasks-axi",
  });
  // Commands and refreshes run in other processes, so wait in time rather than in render passes.
  const frame = async (text: string) => {
    for (let i = 0; i < 250; i++) {
      await setup.renderOnce();
      const value = setup.captureCharFrame();
      if (value.includes(text)) return value;
      await Bun.sleep(20);
    }
    throw new Error(`"${text}" never appeared in:\n${setup.captureCharFrame()}`);
  };
  const keys = async (...keys: string[]) => {
    for (const key of keys) {
      setup.mockInput.pressKey(key);
      await setup.renderOnce();
    }
  };
  return { ...setup, frame, keys };
}

// Opens the task list of every backlog with the first task selected.
async function openList(app: Awaited<ReturnType<typeof mount>>) {
  await app.frame("home · recent activity");
  await app.keys("j", "RETURN");
  await app.frame("all backlogs ·");
}
const contents = (file: string) => readFile(file, "utf8");
const until = async (app: Awaited<ReturnType<typeof mount>>, check: () => Promise<boolean>) => {
  for (let i = 0; i < 250 && !(await check()); i++) { await app.renderOnce(); await Bun.sleep(20); }
  if (!(await check())) throw new Error(`condition never held; screen:\n${app.captureCharFrame()}`);
};

test("the app opens Home and lists the tasks of the given backlogs", async () => {
  const file = await backlog("alpha", ["add", "a1", "Write the plan", "--start"]);
  const app = await mount([file]);
  await app.frame("home · recent activity");
  await app.keys("j", "RETURN");
  expect(await app.frame("Write the plan")).toContain("in flight");
});

test("a creates a task in the filtered backlog and selects it", async () => {
  const file = await backlog("alpha", ["add", "a1", "Existing"]);
  const app = await mount([file]);
  await openList(app);
  await app.keys("a");
  await app.frame("add task · all backlogs");
  await app.mockInput.typeText("Write the docs");
  await app.keys("RETURN", "RETURN");
  await app.frame("backlog:");
  await app.keys("RETURN", "s", "RETURN", "RETURN", "-");
  await until(app, async () => (await contents(file)).includes("Write the docs"));
  expect(await contents(file)).toMatch(/## In flight\n- \[ \] write-the-docs-\w+ - Write the docs/);
  await app.frame("✔ added write-the-docs");
});

test("a reversible action can be undone with z while its summary is shown", async () => {
  const file = await backlog("alpha", ["add", "a1", "Alpha"]);
  const app = await mount([file]);
  await openList(app);
  await app.keys("RETURN", "s");
  await app.frame("z undo");
  expect(await contents(file)).toContain("## In flight\n- [ ] a1 - Alpha");
  await app.keys("z");
  await until(app, async () => (await contents(file)).includes("## Queued\n- [ ] a1 - Alpha"));
});

test("done with link offers undo and editable fields restore ? help when cleared", async () => {
  const file = await backlog("alpha", ["add", "a1", "Alpha"]);
  const app = await mount([file]);
  await openList(app);
  await app.keys("RETURN", "l");
  await app.frame("pull request URL (optional):");
  expect(app.captureCharFrame()).toContain("? about");
  await app.mockInput.typeText("https://example.test/pr/1?");
  expect(await app.frame("https://example.test/pr/1?")).not.toContain("? about");
  for (let i = 0; i < 27; i++) app.mockInput.pressKey("BACKSPACE");
  await app.frame("? about");
  await app.keys("?");
  await app.frame("Marks the task done and records what closed it");
  await app.keys("x");
  await app.keys("RETURN", "RETURN", "RETURN");
  await app.frame("z undo");
  expect(await contents(file)).toContain("## Done\n- [ ] a1 - Alpha");
  await app.keys("z");
  await until(app, async () => (await contents(file)).includes("## Queued\n- [ ] a1 - Alpha"));
});

test("a confirmation runs only after y and n cancels it", async () => {
  const file = await backlog("alpha", ["add", "a1", "Alpha"], ["add", "b2", "Bravo"]);
  const app = await mount([file]);
  await openList(app);
  await app.keys("RETURN", "D");
  await app.frame("delete task a1?");
  await app.keys("x", "n");
  expect(await contents(file)).toContain("a1 - Alpha");
  await app.keys("RETURN", "D");
  await app.frame("tasks-axi rm a1 --file");
  await app.keys("y");
  await until(app, async () => !(await contents(file)).includes("a1 - Alpha"));
});

test("a failed command opens its output, and e edits the value before Enter retries", async () => {
  const file = await backlog("alpha", ["add", "a1", "Alpha"]);
  const app = await mount([file]);
  await openList(app);
  await app.keys("RETURN", "h");
  await app.mockInput.typeText("waiting (for review)");
  await app.keys("RETURN", "RETURN");
  await app.frame("--reason must not contain parentheses");
  await app.keys("e");
  await app.frame("hold reason:");
  for (let i = 0; i < 20; i++) app.mockInput.pressKey("BACKSPACE");
  await app.mockInput.typeText("waiting for review");
  await app.keys("RETURN", "RETURN");
  await until(app, async () => (await contents(file)).includes("waiting for review"));
});

test("block picks the blocking task from a searchable list", async () => {
  const file = await backlog("alpha", ["add", "a1", "Alpha"], ["add", "b2", "Bravo"], ["add", "c3", "Charlie"]);
  const app = await mount([file]);
  await openList(app);
  await app.keys("RETURN", "b");
  await app.frame("c3 · Charlie");
  await app.mockInput.typeText("char");
  await app.keys("RETURN");
  await until(app, async () => /a1 - Alpha.*blocked-by:c3|blocked-by: c3/s.test(await contents(file)));
});

test("moving a task proposes its connected tasks and moves them together", async () => {
  const file = await backlog("alpha", ["add", "a1", "Alpha"], ["add", "b2", "Bravo", "--blocked-by", "a1"]);
  const other = await backlog("beta", ["add", "z9", "Zulu"]);
  const app = await mount([file, other]);
  await openList(app);
  await app.keys("RETURN", "m");
  await app.frame("beta ·");
  await app.keys("RETURN");
  await app.frame("and 1 connected tasks?");
  await app.keys("y");
  await until(app, async () => (await contents(other)).includes("b2 - Bravo") && (await contents(other)).includes("a1 - Alpha"));
});

test("the backlog menu in Browse prunes and renders after confirmation", async () => {
  const file = await backlog("alpha", ["add", "a1", "Alpha"], ["done", "a1", "--no-prune"], ["add", "b2", "Bravo"], ["done", "b2", "--no-prune"]);
  const app = await mount([file]);
  await app.frame("home · recent activity");
  for (let i = 0; i < 9; i++) await app.keys("j");
  await app.keys("RETURN");
  await app.frame("backlog · alpha");
  await app.keys("P");
  await app.frame("done tasks to keep:");
  for (let i = 0; i < 2; i++) app.mockInput.pressKey("BACKSPACE");
  await app.mockInput.typeText("1");
  await app.keys("RETURN");
  await app.frame("archive older done tasks in alpha?");
  await app.keys("y");
  await until(app, async () => (await contents(join(dirname(file), "done-archive.md")).catch(() => "")).includes("Alpha"));
  await app.keys("RETURN", "R");
  await app.frame("rewrite alpha in canonical form?");
  await app.keys("y");
  await app.frame("normalized");
});

test("a task moved out of the view leaves a notice that d follows", async () => {
  const file = await backlog("alpha", ["add", "a1", "Alpha"], ["add", "b2", "Bravo"]);
  const app = await mount([file]);
  await openList(app);
  await app.keys("RETURN", "d");
  await app.frame("a1 left this view (d show · esc dismiss)");
  await app.keys("j", "k");
  await app.frame("a1 left this view");
  await app.keys("d");
  expect(await app.frame("✔ done")).toContain("Alpha");
});

test("search matches task values, not field names", async () => {
  const file = await backlog("alpha", ["add", "a1", "Alpha"], ["add", "b2", "Bravo state"]);
  const app = await mount([file]);
  await openList(app);
  await app.keys("/");
  await app.mockInput.typeText("state");
  await app.keys("RETURN");
  const frame = await app.frame("Bravo state");
  expect(frame).not.toContain("Alpha");
});

test("marked tasks share one menu and one confirmation listing them", async () => {
  const file = await backlog("alpha", ["add", "a1", "Alpha"], ["add", "b2", "Bravo"], ["add", "c3", "Charlie"]);
  const app = await mount([file]);
  await openList(app);
  await app.keys(" ", " ");
  await app.frame("2 marked");
  const section = async (name: string) => (await contents(file)).split("## ").find((part) => part.startsWith(name)) || "";
  await app.keys("RETURN");
  await app.frame("actions · 2 marked tasks");
  await app.keys("s");
  await app.frame("start 2 tasks?");
  await app.frame("tasks: a1, b2");
  expect(await section("Queued")).toContain("a1 - Alpha");
  expect(await section("Queued")).toContain("b2 - Bravo");
  await app.keys("y");
  await until(app, async () => (await section("In flight")).includes("a1 - Alpha") && (await section("In flight")).includes("b2 - Bravo"));
  expect(await section("Queued")).toContain("c3 - Charlie");
});
