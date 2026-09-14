import { SearchResult, TabState } from "../interfaces";
import { useState, useRef, Dispatch, SetStateAction, ReactElement, useEffect } from "react";
import { TAB_TYPE } from "../constants";
import { ensureFirefoxRunning, fetchOpenTabs, fetchRecentlyClosedTabs, getBookmarksChunks } from "../actions";
import { UnknownError } from "../components/Error";

type TabsHookResult = [SearchResult<TabState>, () => Promise<void>, Dispatch<SetStateAction<TabState>>];

export function useOpenTabs(): TabsHookResult {
  const [data, setData] = useState<TabState>({ type: TAB_TYPE.OPENED_TABS, tabs: [] });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorView, setErrorView] = useState<ReactElement | undefined>();
  const latestRequestRef = useRef(0);

  async function refresh() {
    const requestId = ++latestRequestRef.current;
    const isStale = () => requestId !== latestRequestRef.current;
    try {
      setIsLoading(true);
      if (!(await ensureFirefoxRunning())) return;
      if (isStale()) return;
      setData(fetchOpenTabs());
    } catch (error) {
      if (!isStale()) setErrorView(<UnknownError />);
    } finally {
      if (!isStale()) setIsLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    return () => {
      // Invalidate this invocation's in-flight refresh, without blocking a
      // later effect invocation's own refresh from completing normally.
      // React StrictMode's mount->cleanup->mount double-invocation would
      // otherwise let a stale refresh from the first mount commit state
      // after the second mount's cleanup reset a shared cancelled flag.
      latestRequestRef.current += 1;
    };
  }, []);

  return [{ data, isLoading, errorView }, refresh, setData];
}

export function useRecentlyClosedTabs(): TabsHookResult {
  const [data, setData] = useState<TabState>({ type: TAB_TYPE.RECENTLY_CLOSED, tabs: [] });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorView, setErrorView] = useState<ReactElement | undefined>();
  const latestRequestRef = useRef(0);

  async function refresh() {
    const requestId = ++latestRequestRef.current;
    const isStale = () => requestId !== latestRequestRef.current;
    try {
      setIsLoading(true);
      if (!(await ensureFirefoxRunning())) return;
      if (isStale()) return;
      setData(fetchRecentlyClosedTabs());
    } catch (error) {
      if (!isStale()) setErrorView(<UnknownError />);
    } finally {
      if (!isStale()) setIsLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    return () => {
      latestRequestRef.current += 1;
    };
  }, []);

  return [{ data, isLoading, errorView }, refresh, setData];
}

export function useBookmarks(): TabsHookResult {
  const [data, setData] = useState<TabState>({ type: TAB_TYPE.BOOKMARKS, tabs: [] });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorView, setErrorView] = useState<ReactElement | undefined>();
  const latestRequestRef = useRef(0);

  async function refresh() {
    const requestId = ++latestRequestRef.current;
    const isStale = () => requestId !== latestRequestRef.current;
    try {
      setIsLoading(true);
      if (!(await ensureFirefoxRunning())) return;
      if (isStale()) return;

      const bookmarksState: TabState = { type: TAB_TYPE.BOOKMARKS, tabs: [] };
      setData(bookmarksState);
      for await (const chunk of getBookmarksChunks()) {
        if (isStale()) return;
        bookmarksState.tabs.push(...chunk);
        // copy a new state to progressively load bookmarks chunk by chunk.
        setData({ ...bookmarksState });
      }
    } catch (error) {
      if (!isStale()) setErrorView(<UnknownError />);
    } finally {
      if (!isStale()) setIsLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    return () => {
      latestRequestRef.current += 1;
    };
  }, []);

  return [{ data, isLoading, errorView }, refresh, setData];
}
