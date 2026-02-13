/**
 * Standard Feelr response envelope.
 * Every successful response from the gateway follows this shape.
 */
export interface FeelrResponse<T = unknown> {
  ok: true
  data: T
  meta: ResponseMeta
}

/**
 * Standard Feelr error response envelope.
 * Every error response from the gateway follows this shape.
 */
export interface FeelrErrorResponse {
  ok: false
  error: {
    code: string
    message: string
    detail?: string
    hint: 'retry' | 'auth' | 'abort'
    status: number
  }
}

/**
 * Metadata included in every successful response.
 * Pagination fields are present only for list actions.
 */
export interface ResponseMeta {
  /** Unique request identifier for debugging and support */
  request_id: string
  /** Connector that handled the request */
  connector: string
  /** Action that was executed */
  action: string
  /** Upstream call duration in milliseconds */
  duration_ms: number
  /** Cursor for fetching the next page of results */
  cursor?: string
  /** Whether more results are available */
  has_more?: boolean
}
