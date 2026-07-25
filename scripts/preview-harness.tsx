import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import {
  indexedDB,
  IDBCursor,
  IDBCursorWithValue,
  IDBDatabase,
  IDBFactory,
  IDBIndex,
  IDBKeyRange,
  IDBObjectStore,
  IDBOpenDBRequest,
  IDBRequest,
  IDBTransaction,
  IDBVersionChangeEvent,
} from "fake-indexeddb";
import "../src/styles/glass.css";

type PreviewWindow = Window & typeof globalThis & {
  __V83_PREVIEW_ROUTE__?: string;
  __V83_PREVIEW_STORAGE__?: Record<string, string>;
  __V83_PREVIEW_READY__?: boolean;
};

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(String(key)) ?? null; }
  key(index: number): string | null { return Array.from(this.values.keys())[index] ?? null; }
  removeItem(key: string): void { this.values.delete(String(key)); }
  setItem(key: string, value: string): void { this.values.set(String(key), String(value)); }
}

class MemoryCache {
  private readonly values = new Map<string, Response>();
  async match(request: RequestInfo | URL): Promise<Response | undefined> {
    const key = typeof request === "string" ? request : request instanceof URL ? request.href : request.url;
    return this.values.get(key)?.clone();
  }
  async put(request: RequestInfo | URL, response: Response): Promise<void> {
    const key = typeof request === "string" ? request : request instanceof URL ? request.href : request.url;
    this.values.set(key, response.clone());
  }
  async delete(request: RequestInfo | URL): Promise<boolean> {
    const key = typeof request === "string" ? request : request instanceof URL ? request.href : request.url;
    return this.values.delete(key);
  }
  async keys(): Promise<Request[]> { return Array.from(this.values.keys()).map((url) => new Request(url)); }
}

class MemoryCacheStorage {
  private readonly stores = new Map<string, MemoryCache>();
  async open(name: string): Promise<MemoryCache> {
    let cache = this.stores.get(name);
    if (!cache) { cache = new MemoryCache(); this.stores.set(name, cache); }
    return cache;
  }
  async delete(name: string): Promise<boolean> { return this.stores.delete(name); }
  async has(name: string): Promise<boolean> { return this.stores.has(name); }
  async keys(): Promise<string[]> { return Array.from(this.stores.keys()); }
  async match(request: RequestInfo | URL): Promise<Response | undefined> {
    for (const cache of this.stores.values()) {
      const value = await cache.match(request);
      if (value) return value;
    }
    return undefined;
  }
}

async function boot() {
  const previewWindow = window as PreviewWindow;
  const local = new MemoryStorage();
  const session = new MemoryStorage();
  for (const [key, value] of Object.entries(previewWindow.__V83_PREVIEW_STORAGE__ ?? {})) local.setItem(key, value);
  Object.defineProperty(window, "localStorage", { configurable: true, value: local });
  Object.defineProperty(window, "sessionStorage", { configurable: true, value: session });
  for (const [name, value] of Object.entries({
    indexedDB,
    IDBCursor,
    IDBCursorWithValue,
    IDBDatabase,
    IDBFactory,
    IDBIndex,
    IDBKeyRange,
    IDBObjectStore,
    IDBOpenDBRequest,
    IDBRequest,
    IDBTransaction,
    IDBVersionChangeEvent,
  })) {
    Object.defineProperty(window, name, { configurable: true, value });
  }
  Object.defineProperty(window, "caches", { configurable: true, value: new MemoryCacheStorage() });
  if (!("scrollTo" in window)) Object.defineProperty(window, "scrollTo", { value: () => undefined });

  const { App } = await import("../src/App");
  const route = previewWindow.__V83_PREVIEW_ROUTE__ || "/";
  const root = document.getElementById("root");
  if (!root) throw new Error("Missing preview root");
  createRoot(root).render(
    <MemoryRouter initialEntries={[route]}>
      <App />
    </MemoryRouter>,
  );
  previewWindow.__V83_PREVIEW_READY__ = true;
}

void boot();
