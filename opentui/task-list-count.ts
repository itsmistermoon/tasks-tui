import { countTasks, type Task } from "./tasks";

export function taskListCountLabel(
  tasks: Task[],
  visibleCount: number,
  filtered: boolean,
): string {
  return `${filtered ? visibleCount : countTasks(tasks).total} tasks`;
}
