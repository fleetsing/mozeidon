// Minimal slice of raycast/src/interfaces/index.ts's types actually needed by
// the files copied into this package (see docs/zen-context/specs/020-mcp-read-only-server.md
// for why these files are duplicated rather than shared via a workspace package).

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
