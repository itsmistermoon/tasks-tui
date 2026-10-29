import { homedir } from "node:os";

export type Task = {
  Data: Record<string, any>;
  Source: string;
  Key: string;
  Archived: boolean;
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
      if (query)
        return JSON.stringify(task.Data)
          .toLowerCase()
          .includes(query.toLowerCase());
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
