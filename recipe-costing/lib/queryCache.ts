// Simple in-memory cache with TTL for stable data (products, ingredients, recipes list)
// Does NOT persist across page refreshes — only within the same browser session.

const TTL_MS = 3 * 60 * 1000 // 3 minutes

interface Entry<T> {
  data: T
  at: number
}

class QueryCache {
  private store = new Map<string, Entry<unknown>>()

  get<T>(key: string): T | null {
    const entry = this.store.get(key)
    if (!entry) return null
    if (Date.now() - entry.at > TTL_MS) {
      this.store.delete(key)
      return null
    }
    return entry.data as T
  }

  set<T>(key: string, data: T): void {
    this.store.set(key, { data, at: Date.now() })
  }

  // Invalidate one key (e.g. after a save)
  bust(key: string): void {
    this.store.delete(key)
  }

  // Invalidate all keys that start with a prefix (e.g. "products:ti")
  bustPrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key)
    }
  }
}

export const qc = new QueryCache()

// Key helpers — keep naming consistent across all callers
export const cacheKey = {
  products:    (brand: string) => `products:${brand}`,
  ingredients: (brand: string) => `ingredients:${brand}`,
  recipes:     (brand: string) => `recipes:${brand}`,
  ingPrices:   (brand: string) => `ingPrices:${brand}`,
}
