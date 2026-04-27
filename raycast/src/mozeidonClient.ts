import type {
  ChildProcessWithoutNullStreams,
  ExecFileSyncOptionsWithStringEncoding,
  SpawnOptionsWithoutStdio,
} from "child_process";
import { execFileSync, spawn } from "child_process";
import * as readline from "node:readline";

export type MozeidonErrorCode = "command_failed" | "not_found" | "parse_failed" | "empty_output";

export class MozeidonClientError extends Error {
  constructor(
    public readonly code: MozeidonErrorCode,
    message: string,
    public readonly context: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "MozeidonClientError";
  }
}

type ExecFileSyncImplementation = (
  file: string,
  args: string[],
  options: ExecFileSyncOptionsWithStringEncoding,
) => string | Buffer;

type SpawnImplementation = (
  file: string,
  args: string[],
  options?: SpawnOptionsWithoutStdio,
) => ChildProcessWithoutNullStreams;

export type MozeidonRunOptions = {
  executable: string;
  profileId?: string;
  execFile?: ExecFileSyncImplementation;
};

export type MozeidonSpawnOptions = {
  executable: string;
  profileId?: string;
  spawnProcess?: SpawnImplementation;
};

export type MozeidonJsonOptions = MozeidonRunOptions & {
  context?: string;
  fallback?: string;
};

export function buildMozeidonArgs(args: string[], options?: { profileId?: string }): string[] {
  const profileId = options?.profileId?.trim();
  if (!profileId) return [...args];
  return ["--profile-id", profileId, ...args];
}

export function buildNewTabArgs(queryText: string | null | undefined, searchEngineBaseUrl: string): string[] {
  if (!queryText) return ["tabs", "new"];

  try {
    return ["tabs", "new", "--", new URL(queryText).toString()];
  } catch (_) {
    return ["tabs", "new", "--", `${searchEngineBaseUrl}${encodeURIComponent(queryText)}`];
  }
}

export function runMozeidon(args: string[], options: MozeidonRunOptions): string | Buffer {
  const execFile = options.execFile ?? execFileSync;
  const finalArgs = buildMozeidonArgs(args, options);
  const context = finalArgs.join(" ");

  try {
    return execFile(options.executable, finalArgs, { encoding: "utf8" });
  } catch (error) {
    throw createMozeidonCommandError(error, context, "run");
  }
}

export function runMozeidonJson<T>(args: string[], options: MozeidonJsonOptions): T {
  const output = runMozeidon(args, options);
  return parseMozeidonJson<T>(output, options.context ?? args.join(" "), options.fallback);
}

export function spawnMozeidon(args: string[], options: MozeidonSpawnOptions): ChildProcessWithoutNullStreams {
  const spawnProcess = options.spawnProcess ?? spawn;
  const finalArgs = buildMozeidonArgs(args, options);
  const context = finalArgs.join(" ");

  try {
    return spawnProcess(options.executable, finalArgs);
  } catch (error) {
    throw createMozeidonCommandError(error, context, "spawn");
  }
}

export async function* streamMozeidonLines(
  args: string[],
  options: MozeidonSpawnOptions,
): AsyncGenerator<string, void, void> {
  const command = spawnMozeidon(args, options);
  const context = buildMozeidonArgs(args, options).join(" ");
  const lines = readline.createInterface({ input: command.stdout });
  const lineIterator = lines[Symbol.asyncIterator]();
  const processError = new Promise<never>((_, reject) => {
    command.once("error", (error) => reject(createMozeidonCommandError(error, context, "spawn")));
  });

  try {
    while (true) {
      const nextLine = lineIterator.next();
      const result = await Promise.race([nextLine, processError]);
      if (result.done) return;
      yield result.value;
    }
  } finally {
    lines.close();
  }
}

export function parseMozeidonJson<T>(output: string | Buffer, context: string, fallback?: string): T {
  const text = Buffer.isBuffer(output) ? output.toString() : output;
  const json = text.trim().length > 0 ? text : fallback;

  if (json === undefined) {
    throw new MozeidonClientError("empty_output", `Mozeidon command returned empty output: ${context}`, context);
  }

  try {
    return JSON.parse(json) as T;
  } catch (error) {
    throw new MozeidonClientError("parse_failed", `Failed to parse mozeidon JSON output: ${context}`, context, error);
  }
}

function hasNodeErrorCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

function createMozeidonCommandError(error: unknown, context: string, action: "run" | "spawn"): MozeidonClientError {
  const errorCode = hasNodeErrorCode(error, "ENOENT") ? "not_found" : "command_failed";
  return new MozeidonClientError(errorCode, `Failed to ${action} mozeidon command: ${context}`, context, error);
}
