import { RaycastAiUnavailableError } from "./raycastAiCore";
import { buildAskCurrentPagePrompt, buildSummarizeCurrentPagePrompt } from "./zenContextAi";
import {
  buildSourceAttributedMarkdown,
  requireRealMarkdownContext,
  ZenContextError,
  type RaycastZenContext,
} from "./zenContext";
import { mapMozeidonContextError } from "./zenContextErrors";

export type ZenContextCommandSource = {
  title?: string;
  url?: string;
};

export type ZenContextCommandErrorCode =
  | "ai_unavailable"
  | "content_unavailable"
  | "question_required"
  | "context_error"
  | "command_failed";

export type ZenContextCommandErrorInfo = {
  code: ZenContextCommandErrorCode | string;
  message: string;
};

export type ZenContextCommandAiClient = {
  canAccessAi: () => boolean | Promise<boolean>;
  ask: (prompt: string, options?: unknown) => Promise<string>;
};

export type ZenContextCommandDependencies = {
  getActivePageMarkdown: () => Promise<RaycastZenContext>;
};

export type ZenContextAiCommandDependencies = ZenContextCommandDependencies & {
  ai: ZenContextCommandAiClient;
};

export type CopyCurrentPageMarkdownResult =
  | {
      ok: true;
      markdown: string;
      source: ZenContextCommandSource;
    }
  | {
      ok: false;
      error: ZenContextCommandErrorInfo;
    };

export type ZenContextAiCommandResult =
  | {
      ok: true;
      summary: string;
      source: ZenContextCommandSource;
    }
  | {
      ok: false;
      error: ZenContextCommandErrorInfo;
    };

export async function copyCurrentPageMarkdown(
  dependencies: ZenContextCommandDependencies,
): Promise<CopyCurrentPageMarkdownResult> {
  try {
    const context = await dependencies.getActivePageMarkdown();
    requireRealMarkdownContext(context);

    return {
      ok: true,
      markdown: buildSourceAttributedMarkdown(context),
      source: sourceFromContext(context),
    };
  } catch (error) {
    return {
      ok: false,
      error: mapCommandError(error),
    };
  }
}

export async function summarizeCurrentPage(
  dependencies: ZenContextAiCommandDependencies,
): Promise<ZenContextAiCommandResult> {
  try {
    await requireAiAccess(dependencies.ai);
    const context = await dependencies.getActivePageMarkdown();
    const summary = await dependencies.ai.ask(buildSummarizeCurrentPagePrompt(context), { creativity: "low" });

    return {
      ok: true,
      summary,
      source: sourceFromContext(context),
    };
  } catch (error) {
    return {
      ok: false,
      error: mapCommandError(error),
    };
  }
}

export async function askCurrentPage(
  question: string,
  dependencies: ZenContextAiCommandDependencies,
): Promise<ZenContextAiCommandResult> {
  const trimmedQuestion = question.trim();
  if (!trimmedQuestion) {
    return {
      ok: false,
      error: {
        code: "question_required",
        message: "Enter a question to ask about the current Zen page.",
      },
    };
  }

  try {
    await requireAiAccess(dependencies.ai);
    const context = await dependencies.getActivePageMarkdown();
    const summary = await dependencies.ai.ask(buildAskCurrentPagePrompt(trimmedQuestion, context), {
      creativity: "low",
    });

    return {
      ok: true,
      summary,
      source: sourceFromContext(context),
    };
  } catch (error) {
    return {
      ok: false,
      error: mapCommandError(error),
    };
  }
}

function sourceFromContext(context: Pick<RaycastZenContext, "title" | "url">): ZenContextCommandSource {
  return {
    title: context.title,
    url: context.url,
  };
}

async function requireAiAccess(ai: ZenContextCommandAiClient): Promise<void> {
  if (!(await ai.canAccessAi())) {
    throw new RaycastAiUnavailableError();
  }
}

function mapCommandError(error: unknown): ZenContextCommandErrorInfo {
  if (error instanceof RaycastAiUnavailableError) {
    return {
      code: "ai_unavailable",
      message: "Raycast AI is unavailable for this account or environment.",
    };
  }

  if (error instanceof ZenContextError) {
    return {
      code: error.code,
      message: error.message,
    };
  }

  const mozeidonContextError = mapMozeidonContextError(error);
  if (mozeidonContextError) return mozeidonContextError;

  return {
    code: "command_failed",
    message: error instanceof Error ? error.message : "Zen Context command failed.",
  };
}
