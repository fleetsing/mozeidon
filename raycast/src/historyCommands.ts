import type { HistoryItem } from "./interfaces";

export function buildDeleteHistoryItemArgs(item: Pick<HistoryItem, "url">): string[] {
  return ["history", "delete", "--url", item.url];
}
