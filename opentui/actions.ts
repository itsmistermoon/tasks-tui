import { icons, type Task } from "./tasks";

// Writes are delegated to tasks-axi, which owns the backlog format, locking and atomic writes.
export type Option = { value: string; label: string; key?: string };
export type Field = {
  name: string;
  label: string;
  // choice: one key per option; picker: a searchable list.
  type: "text" | "multiline" | "choice" | "picker";
  initial?: string;
  optional?: boolean;
  options?: Option[];
  // A picker that also accepts a typed value.
  custom?: boolean;
};
export type Values = Record<string, string>;
export type TaskAction = {
  key: string;
  label: string;
  // Long description shown with ? in the action dialogs.
  explain: string;
  confirm: boolean;
  // Shown before an irreversible or bulk action runs.
  question?: string;
  // Confirmation button label.
  verb?: string;
  warning?: string;
  backlog?: string;
  fields: Field[];
  // Ids listed in the confirmation when the action affects more than one task.
  affected?: (values: Values) => string[];
  // Each command is the full tasks-axi argument list, including --file.
  commands: (values: Values) => string[][];
  // Commands that reverse a successful run, offered as undo.
  inverse?: (values: Values) => string[][];
  // Viewer entries that act inside the app instead of running tasks-axi.
  run?: (values: Values) => void;
};
export type ActionContext = { tasks: Task[]; backlogs: string[]; name: (path: string) => string };
export type ActionResult = { ok: boolean; code: number | null; summary: string; output: string };

const blank = (value: unknown) => value === undefined || value === null || value === "" || value === "-" || value === "none";
const id = (task: Task) => String(task.Data.id);
const withFile = (args: string[], file: string) => [...args, "--file", file];
const optional = (flag: string, value: string | undefined) => (value?.trim() ? [flag, value.trim()] : []);
const priorities: Option[] = ["0", "1", "2", "3", "4"].map((value) => ({ value, label: `priority ${value}`, key: value }));

export function blockers(task: Task): string[] {
  return String(task.Data.deps || "")
    .split(",")
    .filter((dep) => dep.startsWith("blocked-by:"))
    .map((dep) => dep.slice("blocked-by:".length).trim())
    .filter(Boolean);
}

// Tasks joined to this one by blocked-by links in its backlog, in both directions; tasks-axi moves them together.
export function connectedTasks(task: Task, tasks: Task[]): Task[] {
  const backlog = tasks.filter((other) => other.Source === task.Source && !other.Archived);
  const group = new Map([[id(task), task]]);
  for (let added = true; added; ) {
    added = false;
    for (const other of backlog) {
      if (group.has(id(other))) continue;
      const linked = blockers(other).some((blocker) => group.has(blocker)) || [...group.values()].some((member) => blockers(member).includes(id(other)));
      if (linked) { group.set(id(other), other); added = true; }
    }
  }
  return [...group.values()];
}

type Spec = {
  key: string;
  label: string;
  explain: string;
  applies: (task: Task) => boolean;
  // Offered when several tasks are marked.
  bulk?: boolean;
  confirm?: { question: string; verb: string; warning: string };
  fields?: (task: Task, context: ActionContext) => Field[];
  args: (task: Task, values: Values) => string[];
  inverse?: (task: Task, values: Values) => string[][];
};

const open = (task: Task) => !task.Archived;
const notDone = (task: Task) => open(task) && task.Data.state !== "done";

const specs: Spec[] = [
  {
    key: "s", label: "start", bulk: true, applies: (task) => open(task) && task.Data.state === "queued",
    explain: "Moves the task from Queued to In flight to show that work on it has started. Undo returns it to Queued.",
    args: (task) => ["start", id(task)],
    inverse: (task) => [["reopen", id(task)]],
  },
  {
    // --no-prune keeps done reversible; archiving older tasks is the separate prune action in the backlog menu.
    key: "d", label: "mark done", bulk: true, applies: notDone,
    explain: "Marks the task done and records today as its close date. Older done tasks are not archived. Undo reopens it in the state it had.",
    args: (task) => ["done", id(task), "--no-prune"],
    inverse: (task) => [["reopen", id(task)], ...(task.Data.state === "in_flight" ? [["start", id(task)]] : [])],
  },
  {
    key: "l", label: "done with link", applies: open,
    explain: "Marks the task done and records what closed it: a pull request URL, a report path and a closing note, each optional. Undo reopens it in the state it had; the links remain. On a task that is already done it adds the links without changing its close date.",
    fields: () => [
      { name: "pr", label: "pull request URL (optional):", type: "text", optional: true },
      { name: "report", label: "report path (optional):", type: "text", optional: true },
      { name: "note", label: "closing note (optional):", type: "text", optional: true },
    ],
    args: (task, values) => ["done", id(task), ...optional("--pr", values.pr), ...optional("--report", values.report), ...optional("--note", values.note), "--no-prune"],
    inverse: (task) => task.Data.state === "done" ? [] : [["reopen", id(task)], ...(task.Data.state === "in_flight" ? [["start", id(task)]] : [])],
  },
  {
    key: "r", label: "reopen", bulk: true, applies: (task) => open(task) && task.Data.state !== "queued",
    explain: "Returns a done or in-flight task to Queued. Undo restores the previous state.",
    args: (task) => ["reopen", id(task)],
    inverse: (task) => [task.Data.state === "done" ? ["done", id(task), "--no-prune"] : ["start", id(task)]],
  },
  {
    key: "h", label: "hold", bulk: true, applies: (task) => notDone(task) && task.Data.held !== "yes",
    explain: "Pauses the task with a reason so it is not dispatched. With a date, the hold stops applying on that day. Undo removes the hold.",
    fields: () => [
      { name: "reason", label: "hold reason:", type: "text" },
      { name: "until", label: "hold until YYYY-MM-DD (optional):", type: "text", optional: true },
    ],
    args: (task, values) => ["hold", id(task), "--reason", values.reason, ...optional("--until", values.until)],
    inverse: (task) => [["unhold", id(task)]],
  },
  {
    key: "h", label: "remove hold", bulk: true, applies: (task) => notDone(task) && task.Data.held === "yes",
    explain: "Removes the hold so the task can be dispatched again. Undo restores the same reason and date.",
    args: (task) => ["unhold", id(task)],
    inverse: (task) => [["hold", id(task), "--reason", String(task.Data.hold_reason), ...(blank(task.Data.hold_until) ? [] : ["--until", String(task.Data.hold_until)])]],
  },
  {
    key: "b", label: "block by task", applies: notDone,
    explain: "Records that another task in the same backlog must finish first. The task shows as blocked until then. Undo removes the link.",
    fields: (task, context) => [{
      name: "other", label: "blocking task:", type: "picker",
      options: context.tasks
        .filter((other) => other.Source === task.Source && !other.Archived && id(other) !== id(task) && !blockers(task).includes(id(other)))
        .map((other) => ({ value: id(other), label: `${id(other)} · ${other.Data.title}` })),
    }],
    args: (task, values) => ["block", id(task), "--by", values.other],
    inverse: (task, values) => [["unblock", id(task), "--by", values.other]],
  },
  {
    key: "u", label: "unblock", applies: (task) => notDone(task) && blockers(task).length > 0,
    explain: "Removes a blocking task from this task's dependencies. Undo restores the link.",
    fields: (task) => [{ name: "other", label: "blocking task to remove:", type: "picker", options: blockers(task).map((value) => ({ value, label: value })) }],
    args: (task, values) => ["unblock", id(task), "--by", values.other],
    inverse: (task, values) => [["block", id(task), "--by", values.other]],
  },
  {
    key: "p", label: "set priority", bulk: true, applies: open,
    explain: "Sets the priority from 0 (highest) to 4 (lowest); tasks are listed by priority within each status.",
    fields: () => [{ name: "priority", label: "priority (0 highest, 4 lowest):", type: "choice", options: priorities }],
    args: (task, values) => ["update", id(task), "--priority", values.priority],
  },
  {
    key: "t", label: "edit title", applies: open,
    confirm: { question: "", verb: "rename", warning: "The current title is replaced and is not kept." },
    explain: "Replaces the task's title. The previous title is not kept anywhere.",
    fields: (task) => [{ name: "title", label: "new title:", type: "text", initial: String(task.Data.title ?? "") }],
    args: (task, values) => ["update", id(task), "--title", values.title],
  },
  {
    key: "n", label: "replace notes", applies: open,
    confirm: { question: "", verb: "replace", warning: "The current notes are replaced; the previous version is kept only in the note archive." },
    explain: "Replaces the task's notes with the text you edit. The previous notes are kept in the note archive and shown in the history tab.",
    fields: (task) => [{ name: "body", label: "new notes (previous notes are archived):", type: "multiline", initial: blank(task.Data.body) ? "" : String(task.Data.body) }],
    args: (task, values) => ["update", id(task), "--body", values.body, "--archive-body"],
  },
  {
    key: "D", label: "delete task", bulk: true, applies: open,
    confirm: { question: "", verb: "remove", warning: "The task is permanently removed from the backlog. This cannot be undone." },
    explain: "Removes the task from its backlog permanently. It is not archived and cannot be undone.",
    args: (task) => ["rm", id(task)],
  },
];

const questions: Record<string, (subject: string) => string> = {
  t: (subject) => `replace the title of ${subject}?`,
  n: (subject) => `replace the notes of ${subject}?`,
  D: (subject) => `delete task ${subject}?`,
};

function moveAction(selection: Task[], context: ActionContext): TaskAction {
  const moved = [...new Map(selection.flatMap((task) => connectedTasks(task, context.tasks)).map((task) => [task.Key, task])).values()];
  const sources = [...new Set(moved.map((task) => task.Source))];
  const ids = moved.map(id);
  const subject = selection.length === 1 ? id(selection[0]) : `${selection.length} tasks`;
  return {
    key: "m",
    label: "move to backlog",
    explain: "Moves the selected tasks and every task linked to them by blocked-by in the same backlog, without leaving a dependency behind.",
    confirm: true,
    verb: "move",
    question: moved.length > selection.length ? `move ${subject} and ${moved.length - selection.length} connected tasks?` : `move ${subject} to another backlog?`,
    warning: moved.length > selection.length ? "These tasks are linked by blocked-by in this backlog and move together. They leave this backlog and are written to the destination." : "The tasks leave this backlog and are written to the destination backlog.",
    backlog: sources.map(context.name).join(", "),
    fields: [{
      name: "to", label: "destination backlog:", type: "picker", custom: true,
      options: context.backlogs.filter((path) => !sources.includes(path)).map((path) => ({ value: path, label: `${context.name(path)} · ${path}` })),
    }],
    affected: () => (moved.length > 1 ? ids : []),
    commands: (values) => sources.map((source) => ["mv", ...moved.filter((task) => task.Source === source).map(id), "--to", values.to, "--file", source]),
  };
}

// Actions for the selected task, or those common to every marked task.
export function taskActions(selection: Task[], context: ActionContext): TaskAction[] {
  if (!selection.length || selection.some((task) => task.Archived)) return [];
  const single = selection.length === 1;
  const actions = specs
    .filter((spec) => (single || spec.bulk) && selection.every(spec.applies))
    .map((spec): TaskAction => {
      const subject = single ? id(selection[0]) : `${selection.length} tasks`;
      return {
        key: spec.key,
        label: spec.label,
        explain: spec.explain,
        // Several tasks always ask first; the confirmation lists them with every command.
        confirm: !!spec.confirm || !single,
        question: questions[spec.key]?.(subject) || `${spec.label} ${subject}?`,
        verb: spec.confirm?.verb || spec.label.split(" ")[0],
        warning: spec.confirm?.warning || (single ? undefined : `Runs one tasks-axi command for each of the ${selection.length} marked tasks.`),
        backlog: [...new Set(selection.map((task) => context.name(task.Source)))].join(", "),
        fields: spec.fields?.(selection[0], context) || [],
        affected: single ? undefined : () => selection.map(id),
        commands: (values) => selection.map((task) => withFile(spec.args(task, values), task.Source)),
        inverse: single && spec.inverse ? (values) => spec.inverse!(selection[0], values).map((args) => withFile(args, selection[0].Source)) : undefined,
      };
    });
  const move = moveAction(selection, context);
  const index = actions.findIndex((action) => action.key === "D");
  actions.splice(index < 0 ? actions.length : index, 0, move);
  return actions;
}

// Creating a task; with no backlog filter the destination is picked from the known backlogs.
export function createAction(backlog: string, context: ActionContext): TaskAction {
  return {
    key: "a",
    label: "add task",
    explain: "Adds a task with tasks-axi add. Leave the id blank to generate one from the title. The task goes to the backlog of the current filter, starts queued or in flight, and can record a kind, repository and priority.",
    confirm: false,
    backlog: backlog ? context.name(backlog) : undefined,
    fields: [
      { name: "title", label: "title:", type: "text" },
      { name: "id", label: "id (blank: generated from the title):", type: "text", optional: true },
      ...(backlog ? [] : [{ name: "backlog", label: "backlog:", type: "picker", options: context.backlogs.map((path) => ({ value: path, label: `${context.name(path)} · ${path}` })) } as Field]),
      { name: "placement", label: "starts as:", type: "choice", options: [{ value: "queue", label: "queued", key: "q" }, { value: "start", label: "in flight", key: "s" }] },
      { name: "kind", label: "kind (optional):", type: "text", optional: true },
      { name: "repo", label: "repository (optional):", type: "text", optional: true },
      { name: "priority", label: "priority (optional):", type: "choice", optional: true, options: [{ value: "", label: "none", key: "-" }, ...priorities] },
    ],
    commands: (values) => [[
      "add",
      ...(values.id?.trim() ? [values.id.trim(), values.title] : [values.title, "--mint"]),
      ...(values.placement === "start" ? ["--start"] : []),
      ...optional("--kind", values.kind),
      ...optional("--repo", values.repo),
      ...optional("--priority", values.priority),
      "--file", backlog || values.backlog,
    ]],
  };
}

// Actions on a whole backlog, opened from its entry in Browse.
export function backlogActions(backlog: string, context: ActionContext): TaskAction[] {
  const name = context.name(backlog);
  return [
    createAction(backlog, context),
    {
      key: "P", label: "prune: archive done tasks", confirm: true, verb: "archive", backlog: name,
      question: `archive older done tasks in ${name}?`,
      warning: "Moves every done task in this backlog, except the most recent ones you keep, to done-archive.md. It affects all done tasks in the backlog.",
      explain: "Keeps the most recent done tasks in the backlog and moves the rest to done-archive.md. Nothing is deleted; archived tasks stay visible with show done.",
      fields: [{ name: "keep", label: "done tasks to keep:", type: "text", initial: "10" }],
      commands: (values) => [["prune", "--keep", values.keep, "--state", "done", "--file", backlog]],
    },
    {
      key: "R", label: "render: normalize backlog", confirm: true, verb: "render", backlog: name,
      question: `rewrite ${name} in canonical form?`,
      warning: "Rewrites the whole backlog file: every task line is rewritten in tasks-axi's canonical format. Free-form lines are left untouched.",
      explain: "Normalizes the backlog file with tasks-axi render, rewriting every task in canonical form. Use it after editing the file by hand.",
      fields: [],
      commands: () => [["render", "--file", backlog]],
    },
  ];
}

export function formatCommand(args: string[]): string {
  return ["tasks-axi", ...args].map((arg) => (/^[\w@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replaceAll("'", `'\\''`)}'`)).join(" ");
}

// The exit code decides success; the human-readable output is kept unchanged for display.
export async function runTasksAxi(args: string[], bin = "tasks-axi"): Promise<ActionResult> {
  let child;
  try {
    child = Bun.spawn(["sh", "-c", 'exec "$@" 2>&1', "tasks-axi", bin, ...args], { stdin: "ignore", stdout: "pipe", stderr: "ignore", env: process.env });
  } catch (error) {
    return { ok: false, code: null, summary: String(error), output: String(error) };
  }
  const [output, code] = await Promise.all([new Response(child.stdout).text(), child.exited]);
  const first = output.split("\n")[0];
  return { ok: code === 0, code, summary: code === 0 ? first.replace(/^ok:\s*/, icons.Done + " ") : first, output };
}
