import { Action, ActionPanel, Form, useNavigation } from "@raycast/api";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { askCurrentPage, type ZenContextAiCommandResult } from "./zenContextCommands";
import { createZenContextAiCommandDependencies } from "./zenContextCommandRuntime";
import { ZenContextAiResultDetail, ZenContextErrorDetail, ZenContextLoadingDetail } from "./zenContextCommandViews";

const NAVIGATION_TITLE = "Zen Context: Ask Current Page";

type AskCurrentPageFormValues = {
  question: string;
};

export default function Command(): ReactElement {
  const { push } = useNavigation();

  return (
    <Form
      navigationTitle={NAVIGATION_TITLE}
      actions={
        <ActionPanel>
          <Action.SubmitForm<AskCurrentPageFormValues>
            title="Ask Current Page"
            onSubmit={(values) => push(<AskCurrentPageResult question={values.question} />)}
          />
        </ActionPanel>
      }
    >
      <Form.TextField id="question" title="Question" placeholder="Ask about the active Zen page" autoFocus />
    </Form>
  );
}

function AskCurrentPageResult(props: { question: string }): ReactElement {
  const [result, setResult] = useState<ZenContextAiCommandResult | undefined>();

  useEffect(() => {
    let cancelled = false;

    async function loadAnswer() {
      const nextResult = await askCurrentPage(props.question, createZenContextAiCommandDependencies());
      if (!cancelled) setResult(nextResult);
    }

    void loadAnswer();

    return () => {
      cancelled = true;
    };
  }, [props.question]);

  if (!result) return <ZenContextLoadingDetail navigationTitle={NAVIGATION_TITLE} title="Asking Current Page" />;

  if (!result.ok) {
    return (
      <ZenContextErrorDetail
        navigationTitle={NAVIGATION_TITLE}
        title="Could Not Answer Question"
        error={result.error}
      />
    );
  }

  return (
    <ZenContextAiResultDetail
      navigationTitle={NAVIGATION_TITLE}
      title="Current Page Answer"
      summary={result.summary}
      source={result.source}
    />
  );
}
