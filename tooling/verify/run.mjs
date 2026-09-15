#!/usr/bin/env node
// Low-noise local verification harness. Orchestrates existing root pnpm
// scripts (does not reimplement their logic) and keeps a calling agent's
// context small: only a one-line PASS/FAIL per check reaches stdout, full
// child output goes to a temp log file outside the repo.

import { spawn } from "node:child_process";
import { closeSync, mkdtempSync, openSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const TAIL_LINES = 200;
const MODES = ["fast", "integration", "pr"];

// PR-17 made SLOTNOVA_ENV required for config validation. CI sets it
// explicitly per workflow; a plain local shell usually has not. Default to
// the documented local value (.env.example) only when the caller hasn't
// already supplied one -- an explicit value always wins.
const CHILD_ENV = {
  ...process.env,
  SLOTNOVA_ENV: process.env.SLOTNOVA_ENV || "local",
};

const FAST_TASKS = [
  ["Formatting", "format:check"],
  ["ESLint", "lint"],
  ["Stylelint / token rules", "lint:styles"],
  ["Architecture boundaries", "lint:boundaries"],
  ["Typecheck", "typecheck"],
  ["Unit / property tests", "test"],
  ["Build", "build"],
  ["Contract drift check", "contracts:check"],
  ["OpenAPI breaking-change check", "contracts:check:breaking"],
].map(([name, script]) => ({ name, cmd: "pnpm", args: [script] }));

const INTEGRATION_TASKS = [
  ["Real PostgreSQL integration tests", "test:integration"],
  ["Playwright journeys", "e2e"],
].map(([name, script]) => ({ name, cmd: "pnpm", args: [script] }));

function tasksForMode(mode) {
  if (mode === "fast") return FAST_TASKS;
  if (mode === "integration") return INTEGRATION_TASKS;
  if (mode === "pr") return [...FAST_TASKS, ...INTEGRATION_TASKS];
  return null;
}

// Bounded rolling tail of combined stdout+stderr, so a failing command's
// output stays useful without holding or printing unbounded log text.
class RollingTail {
  constructor(maxLines) {
    this.maxLines = maxLines;
    this.lines = [];
    this.partial = "";
  }

  push(text) {
    this.partial += text;
    const parts = this.partial.split("\n");
    this.partial = parts.pop() ?? "";
    for (const line of parts) {
      this.lines.push(line);
      if (this.lines.length > this.maxLines) this.lines.shift();
    }
  }

  finalize() {
    if (this.partial.length > 0) {
      this.lines.push(this.partial);
      if (this.lines.length > this.maxLines) this.lines.shift();
      this.partial = "";
    }
  }

  text() {
    return this.lines.join("\n");
  }
}

function formatSeconds(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
}

const state = { interrupted: false, signal: null, currentChild: null };

function requestStop(signal) {
  state.interrupted = true;
  state.signal = signal;
  if (state.currentChild) state.currentChild.kill(signal);
}

process.on("SIGINT", () => requestStop("SIGINT"));
process.on("SIGTERM", () => requestStop("SIGTERM"));

function runTask(task, logPath) {
  return new Promise((resolveTask) => {
    const start = Date.now();
    const logFd = openSync(logPath, "w");
    const tail = new RollingTail(TAIL_LINES);

    let child;
    try {
      child = spawn(task.cmd, task.args, {
        cwd: REPO_ROOT,
        stdio: ["ignore", "pipe", "pipe"],
        env: CHILD_ENV,
      });
    } catch (err) {
      closeSync(logFd);
      resolveTask({
        ok: false,
        durationMs: Date.now() - start,
        spawnError: err,
      });
      return;
    }

    state.currentChild = child;

    const onChunk = (chunk) => {
      writeSync(logFd, chunk);
      tail.push(chunk.toString("utf8"));
    };
    child.stdout.on("data", onChunk);
    child.stderr.on("data", onChunk);

    child.on("error", (err) => {
      tail.finalize();
      closeSync(logFd);
      state.currentChild = null;
      resolveTask({
        ok: false,
        durationMs: Date.now() - start,
        spawnError: err,
        tail: tail.text(),
      });
    });

    child.on("close", (code, signal) => {
      tail.finalize();
      closeSync(logFd);
      state.currentChild = null;
      resolveTask({
        ok: code === 0 && !signal,
        code,
        signal,
        durationMs: Date.now() - start,
        tail: tail.text(),
      });
    });
  });
}

async function main() {
  const mode = process.argv[2];
  if (!MODES.includes(mode)) {
    console.error(
      `error: invalid mode ${JSON.stringify(mode ?? "")} -- expected one of: ${MODES.join(", ")}`,
    );
    process.exitCode = 2;
    return;
  }

  const tasks = tasksForMode(mode);
  const logDir = mkdtempSync(join(tmpdir(), "slotnova-verify-"));
  console.log(`verify:${mode} -- logs: ${logDir}`);

  const overallStart = Date.now();

  for (let i = 0; i < tasks.length; i++) {
    if (state.interrupted) break;

    const task = tasks[i];
    const step = `[${i + 1}/${tasks.length}]`;
    const logPath = join(
      logDir,
      `${String(i + 1).padStart(2, "0")}-${task.args[0].replace(/[^a-z0-9:_-]/gi, "_")}.log`,
    );

    const result = await runTask(task, logPath);

    if (state.interrupted) {
      console.error(
        `\nverify:${mode}: interrupted by ${state.signal} during "${task.name}" -- not reporting PASS`,
      );
      process.exitCode = 130;
      return;
    }

    if (result.ok) {
      console.log(`${step} ${task.name} ... PASS (${formatSeconds(result.durationMs)})`);
      continue;
    }

    console.error(`${step} ${task.name} ... FAIL (${formatSeconds(result.durationMs)})`);
    console.error(`  command: ${task.cmd} ${task.args.join(" ")}`);
    if (result.spawnError) {
      console.error(`  spawn error: ${result.spawnError.message}`);
    } else {
      console.error(`  exit: code=${result.code ?? "null"} signal=${result.signal ?? "null"}`);
      console.error(`  --- last ${TAIL_LINES} lines of output ---`);
      console.error(result.tail || "(no output captured)");
      console.error(`  --- end tail ---`);
    }
    console.error(`  full log: ${logPath}`);
    process.exitCode = typeof result.code === "number" && result.code !== 0 ? result.code : 1;
    return;
  }

  if (state.interrupted) {
    process.exitCode = 130;
    return;
  }

  const elapsed = formatSeconds(Date.now() - overallStart);
  console.log(
    `VERIFY ${mode.toUpperCase()}: PASS -- ${tasks.length}/${tasks.length} checks -- ${elapsed} -- logs: ${logDir}`,
  );
}

main();
