import type { Circuit } from '../../types/circuit';
import type { RoutingResult } from '../../types/routing';
import type { RouteRequest, RouteResponse } from '../../workers/routingProtocol';

export interface WorkerLike {
  postMessage(message: unknown): void;
  terminate(): void;
  onmessage: ((event: { data: unknown }) => void) | null;
}

export class RoutingCancelled extends Error {
  constructor() {
    super('cancelled');
    this.name = 'RoutingCancelled';
  }
}

interface PendingJob {
  jobId: number;
  resolve: (result: RoutingResult) => void;
  reject: (error: Error) => void;
}

/** 一次只跑一個佈線工作；取消時終止 Worker，下次再建立新的。 */
export class RoutingClient {
  private worker: WorkerLike | null = null;
  private nextJobId = 1;
  private pending: PendingJob | null = null;

  constructor(private readonly createWorker: () => WorkerLike) {}

  route(circuit: Circuit): Promise<RoutingResult> {
    this.cancel();
    const worker = this.ensureWorker();
    const jobId = this.nextJobId++;
    return new Promise<RoutingResult>((resolve, reject) => {
      this.pending = { jobId, resolve, reject };
      const request: RouteRequest = { type: 'route', jobId, circuit };
      worker.postMessage(request);
    });
  }

  cancel(): void {
    const pending = this.pending;
    if (!pending) return;
    this.pending = null;
    this.worker?.terminate();
    this.worker = null;
    pending.reject(new RoutingCancelled());
  }

  private ensureWorker(): WorkerLike {
    if (!this.worker) {
      const worker = this.createWorker();
      worker.onmessage = (event) => this.receive(event.data as RouteResponse);
      this.worker = worker;
    }
    return this.worker;
  }

  private receive(response: RouteResponse): void {
    const pending = this.pending;
    if (!pending || response.jobId !== pending.jobId) return;
    this.pending = null;
    if (response.type === 'result') pending.resolve(response.result);
    else pending.reject(new Error(response.message));
  }
}
