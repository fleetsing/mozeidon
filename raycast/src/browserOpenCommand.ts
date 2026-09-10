/**
 * Argument-array execution for the browser-open preference.
 *
 * The `firefox` preference is documented as a shell command, but it is never
 * handed to a shell: it is tokenized here and executed with `execFileSync`.
 * Nothing user-derived is ever interpolated into a command string.
 */

/**
 * Tokenize a shell-like command string into argv entries.
 * Honors single quotes, double quotes, and backslash escapes outside quotes.
 */
export function tokenizeCommand(command: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let hasToken = false;
  let quote: '"' | "'" | null = null;
  let escaped = false;

  for (const char of command) {
    if (escaped) {
      current += char;
      hasToken = true;
      escaped = false;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      hasToken = true;
      continue;
    }
    if (/\s/.test(char)) {
      if (hasToken) {
        tokens.push(current);
        current = "";
        hasToken = false;
      }
      continue;
    }
    current += char;
    hasToken = true;
  }

  if (quote) {
    throw new Error(`Unterminated quote in browser command: ${command}`);
  }
  if (hasToken) {
    tokens.push(current);
  }
  return tokens;
}

/**
 * Build the argv array for opening the browser.
 * Extra arguments (for example, a URL) are appended as argv entries.
 * Throws when the command preference tokenizes to nothing.
 */
export function buildBrowserOpenArgs(command: string, extraArgs: string[] = []): string[] {
  const tokens = tokenizeCommand(command);
  if (tokens.length === 0) {
    throw new Error("The browser command preference is empty. Set it to a command such as: open -b app.zen-browser.zen");
  }
  return [...tokens, ...extraArgs];
}
