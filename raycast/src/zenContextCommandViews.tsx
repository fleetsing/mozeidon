import { Action, ActionPanel, Detail, Icon } from "@raycast/api";
import type { ReactElement } from "react";
import type { ZenContextCommandErrorInfo, ZenContextCommandSource } from "./zenContextCommands";

export function ZenContextAiResultDetail(props: {
  navigationTitle: string;
  title: string;
  summary: string;
  source?: ZenContextCommandSource;
}): ReactElement {
  const { navigationTitle, title, summary, source } = props;

  return (
    <Detail
      navigationTitle={navigationTitle}
      markdown={buildResultMarkdown(title, summary, source)}
      actions={
        <ActionPanel>
          <Action.CopyToClipboard title="Copy Summary" content={summary} />
          {source?.url ? <Action.CopyToClipboard title="Copy Source URL" content={source.url} /> : null}
        </ActionPanel>
      }
    />
  );
}

export function ZenContextErrorDetail(props: {
  navigationTitle: string;
  title: string;
  error: ZenContextCommandErrorInfo;
}): ReactElement {
  const { navigationTitle, title, error } = props;

  return (
    <Detail
      navigationTitle={navigationTitle}
      markdown={`# ${title}\n\n${error.message}`}
      actions={
        <ActionPanel>
          <Action.CopyToClipboard title="Copy Error Message" icon={Icon.Clipboard} content={error.message} />
        </ActionPanel>
      }
    />
  );
}

export function ZenContextLoadingDetail(props: { navigationTitle: string; title: string }): ReactElement {
  return <Detail navigationTitle={props.navigationTitle} isLoading={true} markdown={`# ${props.title}`} />;
}

function buildResultMarkdown(title: string, summary: string, source: ZenContextCommandSource | undefined): string {
  const sourceLines = [
    source?.title ? `Source: ${source.title}` : undefined,
    source?.url ? `URL: ${source.url}` : undefined,
  ]
    .filter(Boolean)
    .join("\n");

  return [`# ${title}`, sourceLines, summary].filter(Boolean).join("\n\n");
}
