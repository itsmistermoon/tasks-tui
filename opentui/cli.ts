import type { Task } from "./tasks";

export function parseArgs(args: string[]): {
  taskId?: string;
  count: boolean;
  json: boolean;
  sources: string[];
} {
  const sources: string[] = [];
  let taskId: string | undefined;
  let count = false;
  let json = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--task") {
      taskId = args[++i];
      if (!taskId || taskId.startsWith("--"))
        throw new Error("--task requires an id");
    } else if (args[i] === "--count") {
      count = true;
    } else if (args[i] === "--json") {
      json = true;
    } else {
      sources.push(args[i]);
    }
  }
  if (json && !count) throw new Error("--json requires --count");
  return { taskId, count, json, sources };
}

export function resolveTask(tasks: Task[], id?: string): Task | undefined {
  return id ? tasks.find((task) => String(task.Data.id) === id) : undefined;
}
