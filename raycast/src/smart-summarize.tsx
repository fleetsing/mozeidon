import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { summarizeSmartZenContext } from "./smartSummarizeRaycast";
import { getSmartSummarizeTitle, type SmartSummarizeResult } from "./smartSummarize";
import { ZenContextAiResultDetail, ZenContextErrorDetail, ZenContextLoadingDetail } from "./zenContextCommandViews";

const NAVIGATION_TITLE = "Zen Context: Smart Summarize";

export default function Command(): ReactElement {
  const [result, setResult] = useState<SmartSummarizeResult | undefined>();

  useEffect(() => {
    let cancelled = false;

    async function loadSummary() {
      const nextResult = await summarizeSmartZenContext();
      if (!cancelled) setResult(nextResult);
    }

    void loadSummary();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!result) return <ZenContextLoadingDetail navigationTitle={NAVIGATION_TITLE} title="Summarizing Context" />;

  if (!result.ok) {
    return (
      <ZenContextErrorDetail
        navigationTitle={NAVIGATION_TITLE}
        title="Could Not Summarize Context"
        error={result.error}
      />
    );
  }

  return (
    <ZenContextAiResultDetail
      navigationTitle={NAVIGATION_TITLE}
      title={getSmartSummarizeTitle(result.context.source)}
      summary={result.summary}
      source={result.context}
    />
  );
}
