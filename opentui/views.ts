import { countTasks, filterTasks, icons, recentTasks, sourceName, status, taskStatuses, type Task } from "./tasks";

export type BrowseItem = { label: string; source: string; group: string; section?: string; count?: number };
export type ViewFilters = { source: string; group: string; query: string; showDone: boolean };

export function projectView(tasks: Task[], sources: string[], { source, group, query, showDone }: ViewFilters): { tasks: Task[]; browse: BrowseItem[] } {
  const visible = group === "home"
    ? recentTasks(tasks.filter((task) => !query || JSON.stringify(task.Data).toLowerCase().includes(query.toLowerCase())))
    : filterTasks(tasks, { query, source, group: group === "status:All" ? "" : group, showDone });
  const totals = countTasks(tasks);
  const counts = countTasks(source ? tasks.filter((task) => task.Source === source) : tasks);
  const shown = tasks.filter((task) => showDone || !["Done", "Archived"].includes(status(task)));
  const browse: BrowseItem[] = [
    { label: "home", source: "", group: "home" },
    { label: "all", count: showDone ? counts.total_all : counts.total, source, group: "status:All", section: "status" },
    ...taskStatuses.map((v) => ({ label: `${icons[v]} ${v.toLowerCase()}`, count: counts.statuses[v], source, group: `status:${v}` })),
    { label: "all backlogs", count: showDone ? totals.total_all : totals.total, source: "", group: "", section: "sources" },
    ...sources.map((p) => ({ label: sourceName(p), count: (showDone ? totals.sources[p]?.total_all : totals.sources[p]?.total) || 0, source: p, group: "" })),
  ];
  for (const [key, section] of [["kind", "types"], ["repo", "repositories"]]) {
    const value = (task: Task) => task.Data[key] && task.Data[key] !== "-" ? String(task.Data[key]) : "unspecified";
    const values = [...new Set(tasks.map(value))].sort();
    browse.push(...values.map((v, i) => ({ label: v, count: shown.filter((t) => (!source || t.Source === source) && value(t) === v).length, source, group: `${key}:${v}`, ...(i === 0 ? { section } : {}) })));
  }
  return { tasks: visible, browse };
}
