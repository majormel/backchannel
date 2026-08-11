const BOOKMARKS_KEY = 'mcp_flow_bookmarks'

export function loadBookmarks(): string[] {
  try {
    const stored = localStorage.getItem(BOOKMARKS_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed)) {
        return parsed
      }
    }
  } catch {
    // Ignore parsing errors
  }
  return []
}

export function saveBookmarks(bookmarks: string[]): void {
  try {
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks))
  } catch {
    // Ignore storage errors
  }
}

export function isBookmarked(flowId: string): boolean {
  const bookmarks = loadBookmarks()
  return bookmarks.includes(flowId)
}

export function toggleBookmark(flowId: string): boolean {
  const bookmarks = loadBookmarks()
  const index = bookmarks.indexOf(flowId)
  let isNowBookmarked: boolean

  if (index === -1) {
    bookmarks.push(flowId)
    isNowBookmarked = true
  } else {
    bookmarks.splice(index, 1)
    isNowBookmarked = false
  }

  saveBookmarks(bookmarks)
  return isNowBookmarked
}

export function addBookmark(flowId: string): void {
  const bookmarks = loadBookmarks()
  if (!bookmarks.includes(flowId)) {
    bookmarks.push(flowId)
    saveBookmarks(bookmarks)
  }
}

export function removeBookmark(flowId: string): void {
  const bookmarks = loadBookmarks()
  const index = bookmarks.indexOf(flowId)
  if (index !== -1) {
    bookmarks.splice(index, 1)
    saveBookmarks(bookmarks)
  }
}

export function clearBookmarks(): void {
  localStorage.removeItem(BOOKMARKS_KEY)
}

export function getBookmarkCount(): number {
  return loadBookmarks().length
}
