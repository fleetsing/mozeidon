import type { HistoryItem, MozeidonHistoryItem } from "./interfaces";

export type MozeidonHistoryPayload = {
  data: MozeidonHistoryItem[];
};

export function mapMozeidonHistoryItemsToHistoryItems(items: MozeidonHistoryItem[]): HistoryItem[] {
  return items.map((item) => {
    const lastVisitTime = getValidNumber(item.t);
    const url = item.url;

    return {
      id: getHistoryItemId(item, lastVisitTime),
      title: item.title?.trim() || url,
      url,
      domain: getDomain(url),
      typedCount: getValidNumber(item.tc),
      visitCount: getValidNumber(item.vc),
      lastVisitTime,
    };
  });
}

export function urlWithoutScheme(url: string): string {
  return url.replace(/(^\w+:|^)\/\//, "").replace("www.", "");
}

// Raycast's built-in List filtering only matches against currently-rendered
// List.Items, which breaks once rendering is paginated (search would only
// ever find items on already-loaded pages). This does the same substring
// match ourselves over the full, already-fetched history so search still
// covers everything regardless of how many pages are currently rendered.
export function filterHistoryItems(items: HistoryItem[], searchText: string): HistoryItem[] {
  const needle = searchText.trim().toLowerCase();
  if (!needle) return items;

  return items.filter((item) => historySearchHaystack(item).includes(needle));
}

function historySearchHaystack(item: HistoryItem): string {
  return [item.title, item.url, urlWithoutScheme(item.url), item.domain, item.visitCount?.toString()]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();
}

function getHistoryItemId(item: MozeidonHistoryItem, lastVisitTime: number | undefined): string {
  const id = item.id?.trim();
  if (id) return id;
  return lastVisitTime ? `${item.url}:${lastVisitTime}` : item.url;
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch (_) {
    return urlWithoutScheme(url);
  }
}

function getValidNumber(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return undefined;
  return value;
}
