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
      .describe("Target tab id. Omit to use the active tab, or provide with a url/windowId to disambiguate."),
    windowId: z.number().int().optional().describe("Target window id, used with tabId or url to disambiguate."),
    url: z.string().optional().describe("Target tab's URL, used to find an unambiguous match when tabId is not known."),
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
