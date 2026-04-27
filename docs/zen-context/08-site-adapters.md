# Site Adapters

Site adapters are a future layer for deriving richer, site-specific context from pages. They are not part of the first Zen Context milestones.

## Purpose

Generic tab context gives URL, title, domain, and browser metadata. Site adapters can add structured information for specific sites when generic context is not enough.

Examples:

- issue tracker issue key and title;
- pull request repository, number, branch, and status;
- documentation page product/version;
- video title and timestamp;
- calendar event metadata.

## Non-Goals For Early Milestones

- Do not add adapters before the base context API is stable.
- Do not request broad host permissions for speculative adapters.
- Do not scrape authenticated content without explicit user consent.
- Do not store adapter output unless local memory has its own spec.

## Adapter Shape

Suggested future shape:

```json
{
  "id": "github.pullRequest",
  "matches": ["github.com"],
  "version": 1,
  "data": {
    "repository": "owner/repo",
    "number": 123,
    "title": "Example PR"
  }
}
```

## Permission Policy

Adapters must document:

- matched domains;
- required browser permissions;
- extracted fields;
- whether network access is used;
- whether data is stored;
- user-visible controls.

Prefer adapters that can derive data from URL and title before using page content extraction.

## Testing

Use sanitized fixtures:

- URL examples;
- title examples;
- optional DOM snapshots only when necessary;
- expected adapter output.

Adapters should fail closed: if a page does not match exactly, return no adapter data rather than guessing.
