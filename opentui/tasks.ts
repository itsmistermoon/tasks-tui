import { homedir } from "node:os";

export type Task = {
  Data: Record<string, any>;
  Source: string;
  Key: string;
  Archived: boolean;
  ArchivedAt?: string;
};
export type Snapshot = {
  tasks: Task[];
  sources: string[];
  errors: string[];
  failed: string[];
};
export type TaskStatus =
  | "In progress"
  | "Queued"
  | "Blocked"
  | "Held"
  | "Done"
  | "Archived";

export type TaskCounts = {
  total: number;
  total_all: number;
  statuses: Record<TaskStatus, number>;
  sources: Record<
    string,
    {
      total: number;
      total_all: number;
      statuses: Record<TaskStatus, number>;
    }
  >;
};

export const taskStatuses: TaskStatus[] = [
  "In progress",
  "Queued",
  "Blocked",
  "Held",
  "Done",
  "Archived",
];

export const icons: Record<TaskStatus, string> = {
  "In progress": "●",
  Queued: "○",
  Blocked: "!",
  Held: "⏸",
  Done: "✔",
  Archived: "◌",
};
const rank: Record<TaskStatus, number> = {
  "In progress": 0,
  Queued: 1,
  Blocked: 2,
  Held: 3,
  Done: 4,
  Archived: 5,
};

export function status(task: Task): TaskStatus {
  if (task.Archived) return "Archived";
  if (task.Data.state === "done") return "Done";
  if (task.Data.held === "yes") return "Held";
  if (task.Data.blocked === "yes") return "Blocked";
  return task.Data.state === "in_flight" ? "In progress" : "Queued";
}

export function countTasks(tasks: Task[]): TaskCounts {
  const counts = (): Record<TaskStatus, number> =>
    Object.fromEntries(taskStatuses.map((value) => [value, 0])) as Record<
      TaskStatus,
      number
    >;
  const result: TaskCounts = {
    total: 0,
    total_all: 0,
    statuses: counts(),
    sources: {},
  };
  for (const task of tasks) {
    const state = status(task);
    result.total_all++;
    if (state !== "Done" && state !== "Archived") result.total++;
    result.statuses[state]++;
    const source = (result.sources[task.Source] ??= {
      total: 0,
      total_all: 0,
      statuses: counts(),
    });
    source.total_all++;
    if (state !== "Done" && state !== "Archived") source.total++;
    source.statuses[state]++;
  }
  return result;
}

export function recentTasks(tasks: Task[], limit = 5): Task[] {
  return (["Done", "Archived"] as const).flatMap((state) =>
    tasks.filter((task) => status(task) === state).sort((a, b) => {
      const date = (task: Task) => {
        const value = state === "Archived" ? task.ArchivedAt : task.Data.closed;
        return value && value !== "-" ? String(value) : "";
      };
      return date(b).localeCompare(date(a));
    }).slice(0, limit),
  );
}

export function sourceName(path: string): string {
  const parts = path.replace(homedir() + "/", "").split("/");
  if (parts.at(-1) === "backlog.md") parts.pop();
  if (parts.at(-1) === "data") parts.pop();
  return parts.reverse().join(" ‹ ");
}

export function filterTasks(
  tasks: Task[],
  filters: { query: string; source: string; group: string; showDone: boolean },
): Task[] {
  const { query, source, group, showDone } = filters;
  return tasks
    .filter((task) => {
      if (query && !JSON.stringify(task.Data).toLowerCase().includes(query.toLowerCase())) return false;
      if (source && source !== task.Source) return false;
      if (
        !showDone &&
        (task.Archived || status(task) === "Done") &&
        group !== "status:Done" &&
        group !== "status:Archived"
      )
        return false;
      if (group) {
        const [key, value] = group.split(":");
        const actual =
          key === "status"
            ? status(task)
            : task.Data[key] && task.Data[key] !== "-"
              ? String(task.Data[key])
              : "unspecified";
        if (actual !== value) return false;
      }
      return true;
    })
    .sort(
      (a, b) =>
        rank[status(a)] - rank[status(b)] ||
        Number(a.Data.priority === "-" ? 9 : a.Data.priority) -
          Number(b.Data.priority === "-" ? 9 : b.Data.priority),
    );
}
