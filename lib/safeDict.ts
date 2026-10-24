/**
 * Dictionaries keyed by repo-controlled strings (file paths, extensions, names).
 * A plain `{}` inherits from Object.prototype, so a file called `__proto__`,
 * `constructor` or `x.toString` would read or write the prototype instead of a
 * key (crashes, lost data). Use a null-prototype object to write, and `own()` to
 * read any object whose prototype you don't control (JSON, IndexedDB, tables).
 */
export function dict<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>;
}

const has = Object.prototype.hasOwnProperty;
export function own<T>(o: Record<string, T> | null | undefined, k: string): T | undefined {
  return o != null && has.call(o, k) ? o[k] : undefined;
}
