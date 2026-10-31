import type { Snapshot } from "./tasks";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export function snapshotCachePath(sources: string[], configuredSources: string[]): string {
  const directory = join(process.env.XDG_CACHE_HOME || join(homedir(), ".cache"), "tasks-tui");
  const key = createHash("sha256").update(JSON.stringify([2, process.cwd(), sources, configuredSources, process.env.TASKS_AXI_FILE || ""])).digest("hex");
  return join(directory, key + ".json");
}

// Keep the backend alive so its source cache survives between refreshes.
export class SnapshotClient {
  private process: ReturnType<typeof Bun.spawn> | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private buffer = "";
  private decoder = new TextDecoder();
  private current: Snapshot = { tasks: [], sources: [], errors: [], failed: [] };

  constructor(
    private backend: string,
    private sources: string[],
    private cacheFile: string,
  ) {}

  setCacheFile(cacheFile: string): void {
    this.cacheFile = cacheFile;
  }

  async readCached(): Promise<Snapshot | null> {
    try {
      const cached = JSON.parse(await readFile(this.cacheFile, "utf8"));
      if (![cached.tasks, cached.sources, cached.errors, cached.failed].every(Array.isArray)) return null;
      this.current = cached;
      return cached;
    } catch { return null; }
  }

  async read(): Promise<Snapshot> {
    const cacheFile = this.cacheFile;
    if (!this.process) {
      this.process = Bun.spawn([this.backend, "--serve", ...this.sources], {
        stdin: "pipe",
        stdout: "pipe",
        stderr: "ignore",
      });
      this.reader = (
        this.process.stdout as ReadableStream<Uint8Array>
      ).getReader();
      this.buffer = "";
      this.decoder = new TextDecoder();
    }
    (this.process.stdin as any).write("snapshot\n");
    while (!this.buffer.includes("\n")) {
      const part = await this.reader!.read();
      if (part.done) throw new Error("Snapshot backend stopped");
      this.buffer += this.decoder.decode(part.value, { stream: true });
    }
    const index = this.buffer.indexOf("\n");
    const line = this.buffer.slice(0, index);
    this.buffer = this.buffer.slice(index + 1);
    const snapshot = retainFailedSources(this.current, JSON.parse(line));
    this.current = snapshot;
    if (!snapshot.errors.length && cacheFile === this.cacheFile) {
      try {
        await mkdir(dirname(cacheFile), { recursive: true, mode: 0o700 });
        await writeFile(cacheFile, JSON.stringify(snapshot), { mode: 0o600 });
      } catch {}
    }
    return snapshot;
  }

  close(): void {
    this.process?.kill();
    this.process = null;
    this.reader = null;
  }
}

// Preserve the last readable tasks for sources that failed to refresh.
export function retainFailedSources(previous: Snapshot, next: Snapshot): Snapshot {
  if (!next.failed.length) return next;
  const failed = new Set(next.failed);
  const existing = new Set(next.tasks.map((task) => task.Key));
  return {
    ...next,
    tasks: [...next.tasks, ...previous.tasks.filter((task) => failed.has(task.Source) && !existing.has(task.Key))],
  };
}
