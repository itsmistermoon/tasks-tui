import { countTasks, taskStatuses, type Snapshot } from "./tasks";

let input = "";
for await (const chunk of process.stdin) input += chunk;
const snapshot = JSON.parse(input) as Snapshot;
const counts = countTasks(snapshot.tasks);
if (process.argv.includes("--json")) {
  process.stdout.write(JSON.stringify({ ...counts, errors: snapshot.errors }) + "\n");
} else {
  const statuses = taskStatuses
    .map((status) => `${status.toLowerCase()} · ${counts.statuses[status]}`)
    .join(" · ");
  process.stdout.write(`all backlogs · ${counts.total} tasks · ${statuses}\n`);
}
