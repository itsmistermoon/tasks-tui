import type { Task } from "./tasks";

// Writes are delegated to tasks-axi, which owns the backlog format, locking and atomic writes.
export type TaskAction = {
  key: string;
  label: string;
  confirm: boolean;
  // Shown before an irreversible or bulk action runs.
  question?: string;
  warning?: string;
  input?: { label: string; initial: string };
  args: (value: string) => string[];
};
export type ActionResult = { ok: boolean; message: string };

const blank = (value: unknown) => value === undefined || value === null || value === "" || value === "-" || value === "none";

export function blockers(task: Task): string[] {
  return String(task.Data.deps || "")
    .split(",")
    .filter((dep) => dep.startsWith("blocked-by:"))
    .map((dep) => dep.slice("blocked-by:".length));
}

export function taskActions(task: Task): TaskAction[] {
  if (task.Archived) return [];
  const id = String(task.Data.id);
  const state = task.Data.state;
  const actions: TaskAction[] = [];
  if (state === "queued") actions.push({ key: "s", label: "start", confirm: false, args: () => ["start", id] });
  // --no-prune keeps done reversible; archiving older tasks is the separate prune action.
  if (state !== "done") actions.push({ key: "d", label: "mark done", confirm: false, args: () => ["done", id, "--no-prune"] });
  if (state !== "queued") actions.push({ key: "r", label: "reopen", confirm: false, args: () => ["reopen", id] });
  if (state !== "done") {
    if (task.Data.held === "yes") actions.push({ key: "h", label: "remove hold", confirm: false, args: () => ["unhold", id] });
    else actions.push({ key: "h", label: "hold", confirm: false, input: { label: "hold reason:", initial: "" }, args: (reason) => ["hold", id, "--reason", reason] });
    actions.push({ key: "b", label: "block by task", confirm: false, input: { label: "blocking task id:", initial: "" }, args: (other) => ["block", id, "--by", other] });
    const current = blockers(task);
    if (current.length) actions.push({ key: "u", label: "unblock", confirm: false, input: { label: "blocking task id to remove:", initial: current[0] }, args: (other) => ["unblock", id, "--by", other] });
  }
  actions.push(
    { key: "t", label: "edit title", confirm: true, question: `replace the title of ${id}?`, warning: "The current title is replaced and is not kept.", input: { label: "new title:", initial: String(task.Data.title ?? "") }, args: (title) => ["update", id, "--title", title] },
    { key: "n", label: "replace notes", confirm: true, question: `replace the notes of ${id}?`, warning: "The current notes are replaced; the previous version is kept only in the note archive.", input: { label: "new notes (previous notes are archived):", initial: blank(task.Data.body) ? "" : String(task.Data.body) }, args: (body) => ["update", id, "--body", body, "--archive-body"] },
    { key: "m", label: "move to backlog", confirm: true, question: `move ${id} to another backlog?`, warning: "The task leaves this backlog and is written to the destination backlog.", input: { label: "destination backlog file or directory:", initial: "" }, args: (path) => ["mv", id, "--to", path] },
    { key: "P", label: "prune: archive done tasks", confirm: true, question: "archive older done tasks in this backlog?", warning: "Moves every done task in this backlog, except the most recent ones you keep, to done-archive.md. It affects all done tasks, not just this one.", input: { label: "done tasks to keep:", initial: "10" }, args: (keep) => ["prune", "--keep", keep, "--state", "done"] },
    { key: "D", label: "delete task", confirm: true, question: `delete task ${id}?`, warning: "The task is permanently removed from the backlog. This cannot be undone.", args: () => ["rm", id] },
  );
  return actions;
}

export function commandArgs(action: TaskAction, task: Task, value = ""): string[] {
  return [...action.args(value), "--file", task.Source, "--json"];
}

export function formatCommand(args: string[]): string {
  return ["tasks-axi", ...args].map((arg) => (/^[\w@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replaceAll("'", `'\\''`)}'`)).join(" ");
}

function summary(result: any): string {
  const parts = ["ok:", result.action, result.task?.id ?? result.id];
  if (result.action === "mv") parts.push("→", result.to);
  if (result.action === "prune") parts.push(`archived ${result.archived}, kept ${result.kept}`);
  return parts.filter((part) => part !== undefined && part !== null).join(" ");
}

// tasks-axi reports failures on stdout or stderr; show them unchanged.
export async function runTasksAxi(args: string[], bin = "tasks-axi"): Promise<ActionResult> {
  let child;
  try {
    child = Bun.spawn([bin, ...args], { stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  } catch (error) {
    return { ok: false, message: String(error) };
  }
  const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  if (code === 0) {
    try {
      const result = JSON.parse(stdout);
      if (result.ok) return { ok: true, message: summary(result) };
    } catch {}
  }
  return { ok: false, message: [stdout.trim(), stderr.trim()].filter(Boolean).join("\n") || `tasks-axi exited with code ${code}` };
}
