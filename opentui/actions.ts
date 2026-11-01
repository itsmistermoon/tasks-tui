import { icons, type Task } from "./tasks";

// Writes are delegated to tasks-axi, which owns the backlog format, locking and atomic writes.
export type TaskAction = {
  key: string;
  label: string;
  confirm: boolean;
  // Shown before an irreversible or bulk action runs.
  question?: string;
  // Confirmation button label.
  verb?: string;
  warning?: string;
  input?: { label: string; initial: string };
  args: (value: string) => string[];
};
export type ActionResult = { ok: boolean; code: number | null; summary: string; output: string };

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
    { key: "t", label: "edit title", confirm: true, verb: "rename", question: `replace the title of ${id}?`, warning: "The current title is replaced and is not kept.", input: { label: "new title:", initial: String(task.Data.title ?? "") }, args: (title) => ["update", id, "--title", title] },
    { key: "n", label: "replace notes", confirm: true, verb: "replace", question: `replace the notes of ${id}?`, warning: "The current notes are replaced; the previous version is kept only in the note archive.", input: { label: "new notes (previous notes are archived):", initial: blank(task.Data.body) ? "" : String(task.Data.body) }, args: (body) => ["update", id, "--body", body, "--archive-body"] },
    { key: "m", label: "move to backlog", confirm: true, verb: "move", question: `move ${id} to another backlog?`, warning: "The task leaves this backlog and is written to the destination backlog.", input: { label: "destination backlog file or directory:", initial: "" }, args: (path) => ["mv", id, "--to", path] },
    { key: "P", label: "prune: archive done tasks", confirm: true, verb: "archive", question: "archive older done tasks in this backlog?", warning: "Moves every done task in this backlog, except the most recent ones you keep, to done-archive.md. It affects all done tasks, not just this one.", input: { label: "done tasks to keep:", initial: "10" }, args: (keep) => ["prune", "--keep", keep, "--state", "done"] },
    { key: "D", label: "delete task", confirm: true, verb: "remove", question: `delete task ${id}?`, warning: "The task is permanently removed from the backlog. This cannot be undone.", args: () => ["rm", id] },
  );
  return actions;
}

export function commandArgs(action: TaskAction, task: Task, value = ""): string[] {
  return [...action.args(value), "--file", task.Source];
}

export function formatCommand(args: string[]): string {
  return ["tasks-axi", ...args].map((arg) => (/^[\w@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replaceAll("'", `'\\''`)}'`)).join(" ");
}

// The exit code decides success; the human-readable output is kept unchanged for display.
export async function runTasksAxi(args: string[], bin = "tasks-axi"): Promise<ActionResult> {
  let child;
  try {
    child = Bun.spawn(["sh", "-c", 'exec "$@" 2>&1', "tasks-axi", bin, ...args], { stdin: "ignore", stdout: "pipe", stderr: "ignore" });
  } catch (error) {
    return { ok: false, code: null, summary: String(error), output: String(error) };
  }
  const [output, code] = await Promise.all([new Response(child.stdout).text(), child.exited]);
  const first = output.split("\n")[0];
  return { ok: code === 0, code, summary: code === 0 ? first.replace(/^ok:\s*/, icons.Done + " ") : first, output };
}
