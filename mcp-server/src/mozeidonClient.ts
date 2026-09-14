// Trimmed copy of raycast/src/mozeidonClient.ts (see docs/zen-context/specs/020-mcp-read-only-server.md).
// Kept: the synchronous exec path (runMozeidon/runMozeidonJson/parseMozeidonJson)
// actually used by the read-only zen_* tools' dependency wiring.
// Dropped, since nothing in this package uses them: buildNewTabArgs and its
// window-targeting siblings, parseAsUrl (all "Zen Open" tab-opening logic,
// not part of the read-only context API), and the spawn/streaming path
// (spawnMozeidon/streamMozeidonLines, used by Raycast's bookmarks/history
// commands, not by any zen_* tool). If this package ever needs them, copy
// them back from raycast/src/mozeidonClient.ts rather than reinventing them.
import type { ExecFileSyncOptionsWithStringEncoding } from "child_process";
import { execFileSync } from "child_process";

export type MozeidonErrorCode = "command_failed" | "not_found" | "parse_failed" | "empty_output";

export class MozeidonClientError extends Error {
  constructor(
    public readonly code: MozeidonErrorCode,
    message: string,
    public readonly context: string,
    public readonly cause?: unknown,
    public readonly stderr?: string,
    public readonly stdout?: string,
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

export type MozeidonRunOptions = {
  executable: string;
  profileId?: string;
  execFile?: ExecFileSyncImplementation;
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
  const stderr = getProcessOutput(error, "stderr");
  const stdout = getProcessOutput(error, "stdout");
  const message = [`Failed to ${action} mozeidon command: ${context}`, stderr ?? stdout].filter(Boolean).join("\n");

  return new MozeidonClientError(errorCode, message, context, error, stderr, stdout);
}

function getProcessOutput(error: unknown, key: "stderr" | "stdout"): string | undefined {
  if (typeof error !== "object" || error === null || !(key in error)) return undefined;

  const output = (error as Record<string, unknown>)[key];
  if (Buffer.isBuffer(output)) return output.toString().trim() || undefined;
  if (typeof output === "string") return output.trim() || undefined;
  return undefined;
}
