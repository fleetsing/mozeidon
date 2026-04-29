import type { RaycastZenContext } from "./zenContext";
import { requireRealMarkdownContext } from "./zenContext";

export function buildSummarizeCurrentPagePrompt(context: RaycastZenContext): string {
  const markdown = requireRealMarkdownContext(context);

  return [
    "Summarize only the supplied Zen page context.",
    "Keep the summary concise and suitable for Raycast display.",
    "",
    formatSourceMetadata(context),
    markdown,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildAskCurrentPagePrompt(question: string, context: RaycastZenContext): string {
  const markdown = requireRealMarkdownContext(context);
  const trimmedQuestion = question.trim();

  return [
    "Answer the user's question using only the supplied Zen page context.",
    "If the answer is not present in the context, say that the page context does not contain the answer.",
    "",
    `Question: ${trimmedQuestion}`,
    "",
    formatSourceMetadata(context),
    markdown,
  ]
    .filter(Boolean)
    .join("\n");
}

function formatSourceMetadata(context: Pick<RaycastZenContext, "title" | "url">): string {
  return [context.title ? `Title: ${context.title}` : undefined, context.url ? `URL: ${context.url}` : undefined]
    .filter(Boolean)
    .join("\n");
}
