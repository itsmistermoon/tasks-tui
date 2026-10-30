import type { Task } from "./tasks";

export function parseArgs(args: string[]): {
  taskId?: string;
  sources: string[];
} {
  const sources: string[] = [];
  let taskId: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--task") {
      taskId = args[++i];
      if (!taskId || taskId.startsWith("--"))
        throw new Error("--task requires an id");
    } else {
      sources.push(args[i]);
    }
  }
  return { taskId, sources };
}

export function resolveTask(tasks: Task[], id?: string): Task | undefined {
  return id ? tasks.find((task) => String(task.Data.id) === id) : undefined;
}
