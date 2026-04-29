import { Clipboard, showToast, Toast } from "@raycast/api";
import { copyCurrentPageMarkdown } from "./zenContextCommands";
import { createZenContextCommandDependencies } from "./zenContextCommandRuntime";

export default async function Command() {
  const result = await copyCurrentPageMarkdown(createZenContextCommandDependencies());

  if (!result.ok) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Could Not Copy Page Markdown",
      message: result.error.message,
    });
    return;
  }

  await Clipboard.copy(result.markdown);
  await showToast({
    style: Toast.Style.Success,
    title: "Copied Page Markdown",
    message: result.source.title ?? result.source.url,
  });
}
