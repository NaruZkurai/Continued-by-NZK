import "@testing-library/jest-dom";

// Provide a working localStorage for tests. Several modules call
// localStorage.getItem at import time (e.g. getFontSize), which crashes in
// the default vitest/jsdom environment where localStorage is unavailable.
class LocalStorageMock {
  private store: Record<string, string> = {};

  getItem(key: string): string | null {
    return key in this.store ? this.store[key] : null;
  }

  setItem(key: string, value: string): void {
    this.store[key] = String(value);
  }

  removeItem(key: string): void {
    delete this.store[key];
  }

  clear(): void {
    this.store = {};
  }

  get length(): number {
    return Object.keys(this.store).length;
  }

  key(index: number): string | null {
    return Object.keys(this.store)[index] ?? null;
  }
}

if (typeof localStorage === "undefined") {
  (globalThis as any).localStorage = new LocalStorageMock();
} else {
  // jsdom may define localStorage but throw on access; ensure it's usable.
  try {
    localStorage.getItem("__test__");
  } catch {
    Object.defineProperty(globalThis, "localStorage", {
      value: new LocalStorageMock(),
      configurable: true,
    });
  }
}

afterEach(() => {
  vi.clearAllMocks();
});

afterAll(() => {
  vi.resetAllMocks();
});

// Suppress uncaught ProseMirror errors in test environment
window.addEventListener("error", (event) => {
  if (
    event.error?.message?.includes("getClientRects") ||
    event.error?.message?.includes("prosemirror")
  ) {
    event.preventDefault();
    return false;
  }
});

window.addEventListener("unhandledrejection", (event) => {
  if (
    event.reason?.message?.includes("getClientRects") ||
    event.reason?.message?.includes("prosemirror")
  ) {
    event.preventDefault();
    return false;
  }
});

// https://github.com/vitest-dev/vitest/issues/821
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock getBoundingClientRect and getClientRects for ProseMirror
Object.defineProperty(Element.prototype, "getClientRects", {
  value: vi.fn(() => ({
    length: 1,
    0: { top: 0, bottom: 20, left: 0, right: 100, width: 100, height: 20 },
    item: () => ({
      top: 0,
      bottom: 20,
      left: 0,
      right: 100,
      width: 100,
      height: 20,
    }),
  })),
});

Object.defineProperty(Element.prototype, "getBoundingClientRect", {
  value: vi.fn(() => ({
    top: 0,
    bottom: 20,
    left: 0,
    right: 100,
    width: 100,
    height: 20,
  })),
});
