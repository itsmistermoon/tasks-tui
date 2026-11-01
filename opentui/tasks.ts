import { basename, dirname } from "node:path";

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
  | "In flight"
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
  "In flight",
  "Queued",
  "Blocked",
  "Held",
  "Done",
  "Archived",
];

export const icons: Record<TaskStatus, string> = {
  "In flight": "●",
  Queued: "○",
  Blocked: "!",
  Held: "⏸",
  Done: "✔",
  Archived: "◌",
};
const rank: Record<TaskStatus, number> = {
  "In flight": 0,
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
  return task.Data.state === "in_flight" ? "In flight" : "Queued";
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

// A backlog is named after its project folder: the root holding backlog.md, data/backlog.md or .tasks.toml.
function projectRoot(path: string): string {
  let root = dirname(path);
  if (basename(root) === "data") root = dirname(root);
  return root;
}

// Short backlog names; the parent folder is added only where two projects share a name.
export function backlogNames(paths: string[]): (path: string) => string {
  const roots = [...new Set(paths.map(projectRoot))];
  const depth = new Map(roots.map((root) => [root, 1]));
  const label = (root: string, count: number) => {
    const parts: string[] = [];
    let current = root;
    while (parts.length < count) {
      const part = basename(current);
      if (!part) break;
      parts.unshift(part);
      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
    }
    return parts.join("/");
  };
  for (;;) {
    const labels = new Map<string, string[]>();
    for (const root of roots) {
      const name = label(root, depth.get(root)!);
      labels.set(name, [...(labels.get(name) || []), root]);
    }
    const collisions = [...labels.values()].filter((group) => group.length > 1);
    if (!collisions.length) break;
    for (const root of collisions.flat()) depth.set(root, depth.get(root)! + 1);
  }
  const names = new Map(roots.map((root) => [root, label(root, depth.get(root)!)]));
  return (path) => names.get(projectRoot(path)) || basename(projectRoot(path));
}

const searchedFields = ["title", "id", "body", "repo", "kind", "hold_reason"];

// Search matches what the task says, not the names of its fields.
export function matchesQuery(task: Task, query: string): boolean {
  if (!query) return true;
  const needle = query.toLowerCase();
  return searchedFields.some((field) => {
    const value = task.Data[field];
    return value !== undefined && value !== null && value !== "-" && String(value).toLowerCase().includes(needle);
  });
}

export function filterTasks(
  tasks: Task[],
  filters: { query: string; source: string; group: string; showDone: boolean },
): Task[] {
  const { query, source, group, showDone } = filters;
  return tasks
    .filter((task) => {
      if (!matchesQuery(task, query)) return false;
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
