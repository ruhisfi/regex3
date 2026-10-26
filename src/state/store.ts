export type Listener<T> = (value: T, previous: T) => void;

/** A minimal observable holding one immutable value. */
export class Store<T extends object> {
  private listeners = new Set<Listener<T>>();

  constructor(private value: T) {}

  get(): T {
    return this.value;
  }

  update(patch: Partial<T>): void {
    const previous = this.value;
    const next = { ...previous, ...patch };
    const changed = (Object.keys(patch) as Array<keyof T>).some((key) => previous[key] !== next[key]);
    if (!changed) return;
    this.value = next;
    for (const listener of this.listeners) listener(next, previous);
  }

  subscribe(listener: Listener<T>): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
