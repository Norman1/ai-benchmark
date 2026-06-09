import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { RULES } from "../engine/rules.js";

export class BotProcess {
  constructor(manifest, { timeLimitMs = RULES.botTimeLimitMs } = {}) {
    this.manifest = manifest;
    this.timeLimitMs = timeLimitMs;
    this.pending = [];
    this.logs = [];
    this.closed = false;
    this.proc = spawn(manifest.command, manifest.args, {
      cwd: manifest.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });

    this.proc.on("exit", (code, signal) => {
      this.closed = true;
      for (const pending of this.pending.splice(0)) {
        pending.reject(new Error(`Bot ${manifest.id} exited before replying (code=${code}, signal=${signal}).`));
      }
    });

    this.proc.on("error", (error) => {
      this.closed = true;
      for (const pending of this.pending.splice(0)) pending.reject(error);
    });

    this.stdout = createInterface({ input: this.proc.stdout, crlfDelay: Infinity });
    this.stdout.on("line", (line) => this.#handleLine(line));
    this.proc.stderr.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      this.logs.push(text);
      if (this.logs.join("").length > 32_000) this.logs.shift();
    });
  }

  async request(message, { expectReply = true, timeoutMs = this.timeLimitMs } = {}) {
    if (this.closed) throw new Error(`Bot ${this.manifest.id} is not running.`);
    this.proc.stdin.write(`${JSON.stringify(message)}\n`);
    if (!expectReply) return null;

    return await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const index = this.pending.findIndex((entry) => entry.resolve === resolve);
        if (index >= 0) this.pending.splice(index, 1);
        reject(new Error(`Bot ${this.manifest.id} timed out after ${timeoutMs}ms.`));
      }, timeoutMs);
      this.pending.push({
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        }
      });
    });
  }

  stop() {
    if (this.closed) return;
    this.closed = true;
    try {
      this.proc.stdin.end();
      this.proc.kill();
    } catch {
      // Process may already be gone.
    }
  }

  #handleLine(line) {
    if (!this.pending.length) return;
    if (line.length > RULES.maxBotLineLength) {
      const pending = this.pending.shift();
      pending.reject(new Error(`Bot ${this.manifest.id} wrote a line larger than ${RULES.maxBotLineLength} bytes.`));
      return;
    }
    const pending = this.pending.shift();
    try {
      pending.resolve(JSON.parse(line));
    } catch (error) {
      pending.reject(new Error(`Bot ${this.manifest.id} returned invalid JSON: ${error.message}`));
    }
  }
}
