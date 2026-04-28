import type { ReactNode } from "react";
import type { TAB_TYPE } from "../constants";

export interface Preferences {
  readonly mozeidon: string;
  readonly firefox: string;
  readonly searchEngine: string;
  readonly profileId?: string;
}

export class Tab {
  constructor(
    public readonly id: string,
    public readonly pinned: boolean,
    public readonly windowId: number,
    public readonly title: string,
    public readonly url: string,
    public readonly domain: string,
    public readonly active: boolean,
    public readonly groupId?: number,
    public readonly group: TabGroup | null = null,
    public readonly index?: number,
    public readonly lastAccessed?: number,
  ) {}

  urlWithoutScheme(): string {
    return this.url.replace(/(^\w+:|^)\/\//, "").replace("www.", "");
  }
}

export interface MozeidonTab {
  id: number;
  windowId: number;
  groupId?: number;
  pinned: boolean;
  domain: string;
  title: string;
  url: string;
  active: boolean;
  lastAccessed?: number;
  index?: number;
}

export interface MozeidonGroup {
  id: number;
  windowId: number;
  collapsed?: boolean;
  color?: string;
  title?: string;
}

export interface MozeidonBookmark {
  id: string;
  parent: string;
  title: string;
  url: string;
}

export interface MozeidonHistoryItem {
  id?: string;
  url: string;
  title?: string;
  tc?: number;
  vc?: number;
  t?: number;
}

export interface HistoryItem {
  id: string;
  title: string;
  url: string;
  domain: string;
  typedCount?: number;
  visitCount?: number;
  lastVisitTime?: number;
}

export interface TabState {
  type: TAB_TYPE;
  tabs: Tab[];
  groups?: TabGroup[];
}

export interface TabGroup {
  id: number;
  windowId: number;
  title?: string;
  color?: string;
}

export interface SearchResult<T> {
  data: T;
  errorView?: ReactNode;
  isLoading: boolean;
}
