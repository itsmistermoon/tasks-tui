import { access } from "node:fs/promises";
import { basename, dirname, isAbsolute, resolve } from "node:path";

export function resolveLink(link: string, source: string): string {
  if (/^https?:\/\//i.test(link)) return link;
  const directory = dirname(source);
  const root = basename(directory) === "data" ? dirname(directory) : directory;
  return isAbsolute(link) ? link : resolve(root, link);
}

// Capture child output: it must never write into the active terminal screen.
export async function openLink(
  link: string,
  source: string,
  opener = process.platform === "darwin" ? "open" : "xdg-open",
): Promise<string | null> {
  const target = resolveLink(link, source);
  if (!/^https?:\/\//i.test(target)) {
    try {
      await access(target);
    } catch {
      return `File not found: ${target}`;
    }
  }
  try {
    const child = Bun.spawn([opener, target], {
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
    const [out, err, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    if (code !== 0)
      return `Unable to open: ${(err || out).trim().slice(0, 400) || `exit ${code}`}`;
    return null;
  } catch (error) {
    return `Unable to open: ${String(error)}`;
  }
}
