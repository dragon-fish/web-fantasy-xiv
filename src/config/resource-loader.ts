// src/config/resource-loader.ts
export type FetchFn = (path: string) => Promise<any>

export class ResourceLoader {
  private cache = new Map<string, any>()
  private pending = new Map<string, Promise<any>>()
  private loadedCount = 0
  private totalCount = 0

  constructor(private fetchFn: FetchFn) {}

  async load(path: string): Promise<any> {
    if (this.cache.has(path)) {
      return this.cache.get(path)
    }

    if (this.pending.has(path)) {
      return this.pending.get(path)
    }

    this.totalCount++
    const promise = this.fetchFn(path).then((data) => {
      this.cache.set(path, data)
      this.pending.delete(path)
      this.loadedCount++
      return data
    })

    this.pending.set(path, promise)
    return promise
  }

  async loadAll(paths: string[]): Promise<any[]> {
    return Promise.all(paths.map((p) => this.load(p)))
  }

  getProgress(): { loaded: number; total: number } {
    return { loaded: this.loadedCount, total: this.totalCount }
  }
}
