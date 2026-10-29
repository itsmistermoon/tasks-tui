// Use the installed tasks-axi grammar and projection; never maintain a second parser.
import { pathToFileURL } from "node:url";
const base = pathToFileURL(process.argv[1] + "/");
const { parseBacklog } = await import(
  new URL("src/backends/markdown-grammar.js", base)
);
const { toRow } = await import(new URL("src/view.js", base));
let input = "";
for await (const chunk of process.stdin) input += chunk;
const { live, archive } = JSON.parse(input);
function tasks(source) {
  return parseBacklog(source).sections.flatMap((section) =>
    section.entries
      .filter((entry) => entry.kind === "task")
      .map((entry) => entry.task),
  );
}
const current = tasks(live);
const blocks = archive.split(/(?=^## Archived \d{4}-\d{2}-\d{2})/m);
const historical = blocks.flatMap((block) => {
  const lines = block.split(/\r?\n/);
  const declared =
    /^## Archived \d{4}-\d{2}-\d{2} \((queued|in_flight|done)\)/.exec(
      lines[0],
    )?.[1];
  let source = "",
    state = "";
  for (const line of lines.slice(1)) {
    if (/^- (?:\[[ xX]\]|\*\*)/.test(line)) {
      const next = declared || (/^- \[x\]/i.test(line) ? "done" : "unknown");
      if (next !== state) {
        state = next;
        source += `\n## ${state === "done" ? "Done" : state === "queued" ? "Queued" : "In flight"}\n`;
      }
    }
    source += line + "\n";
  }
  return tasks(source).map((task) => ({
    task,
    unknown: !declared && task.state !== "done",
  }));
});
const historicalTasks = historical.map((x) => x.task);
process.stdout.write(
  JSON.stringify([
    ...current.map((task) => ({
      data: toRow(task, { all: current, full: true }),
      archived: false,
    })),
    ...historical.map(({ task, unknown }) => ({
      data: {
        ...toRow(task, { all: historicalTasks, full: true }),
        ...(unknown ? { state: "archived" } : {}),
      },
      archived: true,
    })),
  ]),
);
