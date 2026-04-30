export type ContextMode = "active" | "selection" | "metadata" | "links"
export type ContextFormat = "json" | "text" | "markdown" | "html"
export type ContextStatus = "ok" | "empty" | "partial"

export type ContextLimits = {
  maxBytes: number
  maxTextBytes: number
  maxHtmlBytes: number
  maxMarkdownBytes: number
  maxLinks: number
  maxImages: number
  maxJsonLdBytes: number
}

export type ContextRequest = {
  mode: ContextMode
  format: ContextFormat
  selector?: string
  limits: ContextLimits
}

export type ContextRequestParseResult =
  | { request: ContextRequest }
  | {
      error: {
        code: string
        message: string
        details?: Record<string, unknown>
      }
    }

export type ContextWarning = {
  code: string
  message: string
  field?: string
}

export type Truncation = {
  truncated: boolean
  fields: string[]
}

export type ExtractedContext = {
  status?: ContextStatus
  content?: unknown
  metadata?: unknown
  page?: {
    language?: string
    canonicalUrl?: string
    referrer?: string
  }
  selectorMatched?: boolean
  selectorMatchCount?: number
  contentSource?: string
  domRead?: boolean
  warnings?: ContextWarning[]
  truncation?: Truncation
  error?: {
    code: string
    message: string
    details?: Record<string, unknown>
  }
}

export type ContextWindow = {
  id: number
  isLastFocused: boolean
}
