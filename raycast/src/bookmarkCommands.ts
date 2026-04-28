import { TAB_TYPE } from "./tabTypes";
import type { Tab } from "./interfaces";

export type BookmarkActionId = "addBookmark" | "editBookmark" | "deleteBookmark";

export type CreateBookmarkInput = {
  title: string;
  url: string;
  folderPath?: string;
};

export type UpdateBookmarkInput = {
  id: string;
  title?: string;
  url?: string;
  folderPath?: string;
};

export function buildCreateBookmarkArgs(input: CreateBookmarkInput): string[] {
  const args = ["bookmark", "new", "--title", input.title.trim(), "--url", input.url.trim()];
  const folderPath = getOptionalTrimmedValue(input.folderPath);
  if (folderPath) args.push("--folder-path", folderPath);
  return args;
}

export function buildUpdateBookmarkArgs(input: UpdateBookmarkInput): string[] | undefined {
  const args = ["bookmark", "update", input.id.trim()];
  const title = getOptionalTrimmedValue(input.title);
  const url = getOptionalTrimmedValue(input.url);
  const folderPath = getOptionalTrimmedValue(input.folderPath);

  if (title) args.push("--title", title);
  if (url) args.push("--url", url);
  if (folderPath) args.push("--folder-path", folderPath);

  return args.length > 3 ? args : undefined;
}

export function buildDeleteBookmarkArgs(bookmark: Pick<Tab, "id">): string[] {
  return ["bookmark", "delete", bookmark.id.trim()];
}

export function getAvailableBookmarkActionIds(type: TAB_TYPE, tab: Tab): BookmarkActionId[] {
  if (type === TAB_TYPE.OPENED_TABS && hasUsableUrl(tab)) return ["addBookmark"];
  if (type === TAB_TYPE.BOOKMARKS && tab.id.trim()) return ["editBookmark", "deleteBookmark"];
  return [];
}

export function validateBookmarkFolderPath(folderPath: string | undefined): string | undefined {
  const value = folderPath?.trim();
  if (!value) return undefined;
  if (!value.startsWith("/") || !value.endsWith("/")) return "Folder path must start and end with `/`.";
  return undefined;
}

function getOptionalTrimmedValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function hasUsableUrl(tab: Tab): boolean {
  return tab.url.trim().length > 0;
}
