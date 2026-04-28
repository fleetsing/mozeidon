import type { HistoryItem } from "./interfaces";

export const DEFAULT_HISTORY_LIMIT = 500;

export function buildFetchHistoryArgs(maximum: number = DEFAULT_HISTORY_LIMIT): string[] {
  if (!Number.isFinite(maximum) || maximum <= 0) return ["history"];
  return ["history", "--max", Math.trunc(maximum).toString()];
}

export function buildDeleteHistoryItemArgs(item: Pick<HistoryItem, "url">): string[] {
  return ["history", "delete", "--url", item.url];
}
