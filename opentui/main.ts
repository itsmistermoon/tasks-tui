import { createCliRenderer } from "@opentui/core";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { mountApp } from "./app";

const args = process.argv.slice(2);
if (args.some((x) => x === "--help" || x === "-h")) {
  console.log(
    "Usage: tasks-tui [--task <id>] [backlog.md | directory ...]\nTask viewer and manager for tasks-axi backlogs using OpenTUI. Press ? for help.",
  );
  process.exit(0);
}
const settingsFile = join(
  process.platform === "darwin"
    ? join(homedir(), "Library/Application Support")
    : process.env.XDG_CONFIG_HOME || join(homedir(), ".config"),
  "tasks-tui/settings.json",
);
const renderer = await createCliRenderer({ exitOnCtrlC: true, useMouse: false });
try {
  await mountApp({
    renderer,
    args,
    settingsFile,
    backend: join(dirname(import.meta.dir), "bin/tasks-backend"),
    tasksAxi: "tasks-axi",
  });
} catch (error) {
  renderer.destroy();
  console.error(String(error instanceof Error ? error.message : error));
  process.exit(1);
}
