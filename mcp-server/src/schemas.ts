// Zod input schemas mirroring the *Input types already defined in
// zenAiToolsCore.ts, for the 5 read-only tools this server registers.
// .strict() rejects unexpected fields rather than silently ignoring them.
import { z } from "zod";

export const zenGetActiveContextSchema = z
  .object({
    format: z.enum(["markdown", "text", "json"]).optional().describe("Content format to return. Defaults to markdown."),
    requireContent: z
      .boolean()
      .optional()
      .describe("Require real page content, failing with content_unavailable if only metadata is available. Defaults to true."),
  })
  .strict();

export const zenGetSelectionOrPageSchema = z
  .object({
    format: z.enum(["markdown", "text"]).optional().describe("Content format to return. Defaults to markdown."),
    requireContent: z
      .boolean()
      .optional()
      .describe("Require real content, failing with content_unavailable if only metadata is available. Defaults to true."),
  })
  .strict();

export const zenListTabsSchema = z
  .object({
    includeWindows: z.boolean().optional().describe("Include window focus metadata for each tab."),
    limit: z.number().int().positive().optional().describe("Maximum number of tabs to return."),
  })
  .strict();

export const zenSearchTabsSchema = z
  .object({
    query: z.string().min(1).describe("Search text to match against open tabs' titles and URLs."),
    limit: z.number().int().positive().optional().describe("Maximum number of matches to return."),
  })
  .strict();

export const zenGetTabContentSchema = z
  .object({
    tabId: z
      .number()
      .int()
      .optional()
      .describe(
        "Target tab id - must be provided together with windowId (not with url). Omit both tabId and windowId, and provide url instead, to target a tab by its URL. Omit all three to target the active tab.",
      ),
    windowId: z
      .number()
      .int()
      .optional()
      .describe("Target window id - must be provided together with tabId. Not used to disambiguate a url target."),
    url: z
      .string()
      .optional()
      .describe(
        "Target tab's URL, used to find an unambiguous match when tabId/windowId are not provided. Fails with ambiguous_tab if more than one open tab has this URL - use tabId/windowId instead in that case.",
      ),
    format: z.enum(["markdown", "text"]).optional().describe("Content format to return. Defaults to markdown."),
    requireContent: z
      .boolean()
      .optional()
      .describe("Require real content, failing with content_unavailable if only metadata is available. Defaults to true."),
    restoreFocus: z
      .boolean()
      .optional()
      .describe("Restore the originally focused tab/window after reading a background tab. Defaults to true."),
  })
  .strict();
