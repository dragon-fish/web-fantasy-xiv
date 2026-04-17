// src/tower/test-setup.ts
//
// Vitest global setup:
// - 注入 fake-indexeddb 到 globalThis（Vitest 默认 jsdom 没有 IndexedDB）.
//
// `fake-indexeddb/auto` 会立刻替换全局 indexedDB / IDBKeyRange.
import 'fake-indexeddb/auto'
