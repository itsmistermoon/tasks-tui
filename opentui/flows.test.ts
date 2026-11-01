import { afterEach, expect, test } from "bun:test";
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { mountApp } from "./app";
import { runTasksAxi } from "./actions";

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
  const frame = (text: string) => setup.waitForFrame((value) => value.includes(text), { maxPasses: 400 });
  const keys = async (...keys: string[]) => {
    for (const key of keys) {
      setup.mockInput.pressKey(key);
      await setup.renderOnce();
    }
  };
  return { ...setup, frame, keys };
}

test("the app opens Home and lists the tasks of the given backlogs", async () => {
  const file = await backlog("alpha", ["add", "a1", "Write the plan", "--start"]);
  const app = await mount([file]);
  await app.frame("home · recent activity");
  await app.keys("j", "RETURN");
  expect(await app.frame("Write the plan")).toContain("in flight");
});
