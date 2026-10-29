import type { Snapshot } from "./tasks";

// Keep the backend alive so its source cache survives between refreshes.
export class SnapshotClient {
  private process: ReturnType<typeof Bun.spawn> | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private buffer = "";
  private decoder = new TextDecoder();

  constructor(
    private backend: string,
    private sources: string[],
  ) {}

  async read(): Promise<Snapshot> {
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
    return JSON.parse(line);
  }

  close(): void {
    this.process?.kill();
    this.process = null;
    this.reader = null;
  }
}
