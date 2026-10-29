export function matchesDependency(deps: string, id: string): boolean {
  return deps
    .split(",")
    .some((dep) => dep.slice(dep.indexOf(":") + 1) === id && dep.includes(":"));
}
