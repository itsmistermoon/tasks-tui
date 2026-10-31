import { expect, test } from "bun:test";
import { retainFailedSources } from "./snapshot-client";
import type { Snapshot, Task } from "./tasks";

const task = (key: string, source: string): Task => ({ Key: key, Source: source, Data: { id: key }, Archived: false });

test("first refresh retains cached tasks only for failed sources", () => {
  const previous: Snapshot = { tasks: [task("old-a", "a"), task("old-b", "b")], sources: ["a", "b"], failed: [], errors: [] };
  const fresh: Snapshot = { tasks: [task("new-a", "a")], sources: ["a", "b"], failed: ["b"], errors: ["b unavailable"] };
  expect(retainFailedSources(previous, fresh).tasks.map((t) => t.Key)).toEqual(["new-a", "old-b"]);
  expect(retainFailedSources(previous, { ...fresh, failed: [] }).tasks.map((t) => t.Key)).toEqual(["new-a"]);
});

test("snapshot client loads a valid cached snapshot for immediate display", async () => {
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { SnapshotClient } = await import("./snapshot-client");
  const directory = await mkdtemp(join(tmpdir(), "tasks-snapshot-test-"));
  try {
    const path = join(directory, "snapshot.json");
    const cached: Snapshot = { tasks: [task("one", "a")], sources: ["a"], failed: [], errors: [] };
    await writeFile(path, JSON.stringify(cached));
    const client = new SnapshotClient("unused", [], path);
    expect(await client.readCached()).toEqual(cached);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
