export type PaginationMeta = {
  page: number
  limit: number
  total: number
  totalPages: number
  hasMore: boolean
}

export type PaginatedResponse<T> = {
  data: T[]
  pagination: PaginationMeta
}

/** Normalize list endpoints that may return a bare array or a paginated envelope. */
export function unwrapList<T>(payload: T[] | PaginatedResponse<T>): T[] {
  if (Array.isArray(payload)) return payload
  return payload?.data ?? []
}

/**
 * Fetch every page from a paginated list endpoint (max page size 200 on the API).
 */
export async function fetchAllPages<T>(
  fetchPage: (page: number, limit: number) => Promise<T[] | PaginatedResponse<T>>,
  limit = 200,
): Promise<T[]> {
  const all: T[] = []
  let page = 1
  let hasMore = true

  while (hasMore) {
    const payload = await fetchPage(page, limit)
    if (Array.isArray(payload)) {
      all.push(...payload)
      hasMore = false
    } else {
      all.push(...(payload.data ?? []))
      hasMore = Boolean(payload.pagination?.hasMore)
      page += 1
    }
    if (page > 1000) break
  }

  return all
}
