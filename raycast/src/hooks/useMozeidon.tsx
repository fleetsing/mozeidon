import { SearchResult, TabState } from "../interfaces";
import { useState, Dispatch, SetStateAction, ReactElement, useEffect } from "react";
import { TAB_TYPE } from "../constants";
import { ensureFirefoxRunning, fetchOpenTabs, fetchRecentlyClosedTabs, getBookmarksChunks } from "../actions";
import { UnknownError } from "../components/Error";

type TabsHookResult = [SearchResult<TabState>, () => Promise<void>, Dispatch<SetStateAction<TabState>>];

export function useOpenTabs(): TabsHookResult {
  const [data, setData] = useState<TabState>({ type: TAB_TYPE.OPENED_TABS, tabs: [] });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorView, setErrorView] = useState<ReactElement | undefined>();

  async function refresh() {
    try {
      setIsLoading(true);
      if (!(await ensureFirefoxRunning())) return;
      setData(fetchOpenTabs());
    } catch (error) {
      setErrorView(<UnknownError />);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  return [{ data, isLoading, errorView }, refresh, setData];
}

export function useRecentlyClosedTabs(): TabsHookResult {
  const [data, setData] = useState<TabState>({ type: TAB_TYPE.RECENTLY_CLOSED, tabs: [] });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorView, setErrorView] = useState<ReactElement | undefined>();

  async function refresh() {
    try {
      setIsLoading(true);
      if (!(await ensureFirefoxRunning())) return;
      setData(fetchRecentlyClosedTabs());
    } catch (error) {
      setErrorView(<UnknownError />);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  return [{ data, isLoading, errorView }, refresh, setData];
}

export function useBookmarksList(): TabsHookResult {
  const [data, setData] = useState<TabState>({ type: TAB_TYPE.BOOKMARKS, tabs: [] });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorView, setErrorView] = useState<ReactElement | undefined>();

  async function refresh() {
    try {
      setIsLoading(true);
      if (!(await ensureFirefoxRunning())) return;

      const bookmarksState: TabState = { type: TAB_TYPE.BOOKMARKS, tabs: [] };
      setData(bookmarksState);
      for await (const chunk of getBookmarksChunks()) {
        bookmarksState.tabs.push(...chunk);
        // copy a new state to progressively load bookmarks chunk by chunk.
        setData({ ...bookmarksState });
      }
    } catch (error) {
      setErrorView(<UnknownError />);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  return [{ data, isLoading, errorView }, refresh, setData];
}
