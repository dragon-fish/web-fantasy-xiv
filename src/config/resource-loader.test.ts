// src/config/resource-loader.test.ts
import { describe, it, expect, vi } from 'vitest'
import { ResourceLoader } from '@/config/resource-loader'

describe('ResourceLoader', () => {
  function mockFetcher(files: Record<string, any>) {
    return async (path: string) => {
      const data = files[path]
      if (!data) throw new Error(`Not found: ${path}`)
      return data
    }
  }

  it('should load and cache a resource', async () => {
    const fetcher = vi.fn(mockFetcher({
      'arenas/round.yaml': { name: 'Round', shape: 'circle', radius: 20, boundary: 'lethal' },
    }))
    const loader = new ResourceLoader(fetcher)

    const result = await loader.load('arenas/round.yaml')
    expect(result.name).toBe('Round')

    // Second load should use cache
    await loader.load('arenas/round.yaml')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('should deduplicate concurrent loads of same resource', async () => {
    const fetcher = vi.fn(mockFetcher({
      'skills/slash.yaml': { id: 'slash', name: 'Slash', type: 'weaponskill' },
    }))
    const loader = new ResourceLoader(fetcher)

    const [r1, r2] = await Promise.all([
      loader.load('skills/slash.yaml'),
      loader.load('skills/slash.yaml'),
    ])
    expect(r1).toBe(r2)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('should load multiple resources in parallel', async () => {
    const fetcher = vi.fn(mockFetcher({
      'a.yaml': { id: 'a' },
      'b.yaml': { id: 'b' },
      'c.yaml': { id: 'c' },
    }))
    const loader = new ResourceLoader(fetcher)

    const results = await loader.loadAll(['a.yaml', 'b.yaml', 'c.yaml'])
    expect(results).toHaveLength(3)
    expect(fetcher).toHaveBeenCalledTimes(3)
  })

  it('should track loading progress', async () => {
    const fetcher = mockFetcher({
      'a.yaml': { id: 'a' },
      'b.yaml': { id: 'b' },
    })
    const loader = new ResourceLoader(fetcher)
    const progress = loader.getProgress()
    expect(progress).toEqual({ loaded: 0, total: 0 })

    await loader.loadAll(['a.yaml', 'b.yaml'])
    const after = loader.getProgress()
    expect(after.loaded).toBe(2)
  })
})
