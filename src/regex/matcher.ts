import type { ExecuteRequest, ExecuteResult } from './engine';
import type { WorkerRequest, WorkerResponse } from './matcher.worker';

export type MatcherResult = ExecuteResult | { ok: false; timeout: true; error: string };

const DEFAULT_TIMEOUT_MS = 400;

/**
 * Runs matching in a worker so a catastrophically backtracking pattern cannot freeze the page.
 * A request that outlives the timeout (or is superseded while still running) takes the worker down with it.
 */
export class Matcher {
  private worker: Worker | null = null;
  private nextId = 0;
  private pending: {
    id: number;
    resolve: (result: MatcherResult | null) => void;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;

  constructor(private readonly timeoutMs = DEFAULT_TIMEOUT_MS) {}

  /** Resolves to `null` when a newer request replaced this one before it finished. */
  run(request: ExecuteRequest): Promise<MatcherResult | null> {
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.resolve(null);
      this.pending = null;
      this.restart();
    }

    const worker = this.ensureWorker();
    const id = this.nextId++;

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (this.pending?.id !== id) return;
        this.pending = null;
        this.restart();
        resolve({
          ok: false,
          timeout: true,
          error: `Stopped after ${this.timeoutMs} ms. The pattern may be backtracking catastrophically.`,
        });
      }, this.timeoutMs);

      this.pending = { id, resolve, timer };
      const message: WorkerRequest = { id, ...request };
      worker.postMessage(message);
    });
  }

  dispose(): void {
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.resolve(null);
      this.pending = null;
    }
    this.worker?.terminate();
    this.worker = null;
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL('./matcher.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const pending = this.pending;
      if (!pending || pending.id !== event.data.id) return;
      clearTimeout(pending.timer);
      this.pending = null;
      pending.resolve(event.data.result);
    };
    this.worker = worker;
    return worker;
  }

  private restart(): void {
    this.worker?.terminate();
    this.worker = null;
  }
}
