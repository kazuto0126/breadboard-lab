import { describe, expect, it } from 'vitest';
import { createProject } from '../../src/app/model/projectFile';
import { animationStepMs, checklistOrder } from '../../src/app/routing/checklist';
import { RoutingCancelled, RoutingClient, type WorkerLike } from '../../src/app/routing/routingClient';
import { runAutoRoute, type Router } from '../../src/app/routing/runAutoRoute';
import { createEditorStore } from '../../src/app/store/editorStore';
import { applyRouting } from '../../src/core/routing/apply';
import { autoRoute } from '../../src/core/routing/autoRoute';
import type { RoutingResult } from '../../src/types/routing';
import { handleRouteRequest } from '../../src/workers/routingProtocol';
import { circuit, wire } from '../fixtures/build';
import { acceptanceCircuit } from '../fixtures/circuits';

class FakeWorker implements WorkerLike {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  readonly sent: unknown[] = [];
  terminated = false;
  postMessage(message: unknown): void {
    this.sent.push(message);
  }
  terminate(): void {
    this.terminated = true;
  }
  reply(data: unknown): void {
    this.onmessage?.({ data });
  }
}

const jobIdOf = (worker: FakeWorker) => (worker.sent[worker.sent.length - 1] as { jobId: number }).jobId;
const HOLE = /^([A-J]|[TB][+-])\d+$/;

describe('handleRouteRequest', () => {
  it('returns the routing result for the job', () => {
    const response = handleRouteRequest({ type: 'route', jobId: 7, circuit: acceptanceCircuit() });
    expect(response.jobId).toBe(7);
    expect(response.type === 'result' && response.result.status).toBe('success');
  });

  it('turns exceptions into error messages', () => {
    const c = acceptanceCircuit();
    const response = handleRouteRequest({ type: 'route', jobId: 8, circuit: { ...c, boards: [...c.boards, { ...c.boards[0], id: 'b2' }] } });
    expect(response).toEqual({ type: 'error', jobId: 8, message: 'autoRoute currently supports exactly one breadboard' });
  });
});

describe('RoutingClient', () => {
  it('resolves the matching job and ignores stale replies', async () => {
    const worker = new FakeWorker();
    const client = new RoutingClient(() => worker);
    const promise = client.route(acceptanceCircuit());
    const result = autoRoute(acceptanceCircuit());
    worker.reply({ type: 'result', jobId: jobIdOf(worker) + 100, result });
    worker.reply({ type: 'result', jobId: jobIdOf(worker), result });
    await expect(promise).resolves.toBe(result);
  });

  it('rejects with the worker error message', async () => {
    const worker = new FakeWorker();
    const client = new RoutingClient(() => worker);
    const promise = client.route(acceptanceCircuit());
    worker.reply({ type: 'error', jobId: jobIdOf(worker), message: 'boom' });
    await expect(promise).rejects.toThrow('boom');
  });

  it('cancels by terminating the worker and starts a fresh one next time', async () => {
    const workers: FakeWorker[] = [];
    const client = new RoutingClient(() => {
      const w = new FakeWorker();
      workers.push(w);
      return w;
    });
    const promise = client.route(acceptanceCircuit());
    client.cancel();
    await expect(promise).rejects.toBeInstanceOf(RoutingCancelled);
    expect(workers[0].terminated).toBe(true);
    client.route(acceptanceCircuit()).catch(() => undefined);
    expect(workers).toHaveLength(2);
  });
});

describe('checklistOrder', () => {
  it('lists power wires first, then ground, then signals in natural order', () => {
    const routed = applyRouting(acceptanceCircuit(), autoRoute(acceptanceCircuit()));
    const rows = checklistOrder(routed);
    expect(rows.map((r) => r.kind)).toEqual(['power', 'ground', 'ground', 'ground', 'ground', 'signal', 'signal']);
    expect(rows[0]).toMatchObject({ colorName: '紅', netId: 'VCC' });
    expect(rows[1]).toMatchObject({ colorName: '黑', netId: 'GND' });
    expect(rows.slice(5).map((r) => r.netId)).toEqual(['NET_1', 'NET_2']);
    expect(rows.every((r) => HOLE.test(r.from) && HOLE.test(r.to) && r.length >= 1)).toBe(true);
  });

  it('ignores manual wires', () => {
    expect(checklistOrder(circuit([], [wire('m1', 'A10', 'A20')]))).toEqual([]);
  });

  it('speeds up the animation for many wires', () => {
    expect(animationStepMs(7)).toBe(250);
    expect(animationStepMs(40)).toBe(100);
    expect(animationStepMs(0)).toBe(250);
  });
});

describe('runAutoRoute', () => {
  const setup = () => {
    const store = createEditorStore();
    store.getState().replaceDocument({ ...createProject(), circuit: acceptanceCircuit() }, { projectId: null, undoable: false, dirty: false });
    return store;
  };

  it('applies a successful result, starts the animation and shows the checklist', async () => {
    const store = setup();
    await runAutoRoute(store, { route: async (c) => autoRoute(c) });
    const s = store.getState();
    expect(s.mode).toBe('edit');
    expect(s.doc.routing).not.toBeNull();
    expect(s.routingJob).toMatchObject({ status: 'animating', stepMs: 250 });
    expect(s.routingJob.status === 'animating' && s.routingJob.wireIds).toHaveLength(7);
    expect(s.rightTab).toBe('checklist');
    s.undo();
    expect(store.getState().doc.circuit.wires.map((w) => w.id)).toEqual(acceptanceCircuit().wires.map((w) => w.id));
  });

  it('keeps the document and shows a preview when routing fails', async () => {
    const store = setup();
    const full = autoRoute(acceptanceCircuit());
    const failedNets = [{ netId: 'NET_1', reason: 'UNROUTABLE' as const, detail: 'x' }];
    const partial: RoutingResult = { ...full, status: 'partial', message: 'No valid routing solution.', failedNets, wires: full.wires.slice(0, 2) };
    await runAutoRoute(store, { route: async () => partial });
    const s = store.getState();
    expect(s.doc.circuit.wires.every((w) => w.source === 'manual')).toBe(true);
    expect(s.previewWires).toHaveLength(2);
    expect(s.routingJob).toEqual({ status: 'failed', message: 'No valid routing solution.', failedNets });
  });

  it('tells the user when there is nothing to route', async () => {
    const store = createEditorStore();
    await runAutoRoute(store, { route: async (c) => autoRoute(c) });
    expect(store.getState().notice?.text).toBe('目前沒有需要接線的 Net');
    expect(store.getState().routingJob).toEqual({ status: 'idle' });
  });

  it('ignores undo and edits while the router is still working', async () => {
    const store = setup();
    let finish: (result: RoutingResult) => void = () => undefined;
    const router: Router = { route: () => new Promise<RoutingResult>((resolve) => (finish = resolve)) };
    const pending = runAutoRoute(store, router);
    expect(store.getState().mode).toBe('routing');
    store.getState().undo();
    expect(store.getState().run((doc) => ({ ok: true, doc: { ...doc, name: 'x' } }))).toBe(false);
    finish(autoRoute(acceptanceCircuit()));
    await pending;
    expect(store.getState().doc.name).toBe('未命名電路');
    expect(store.getState().doc.routing).not.toBeNull();
  });

  it('returns to editing quietly when cancelled, and reports worker errors', async () => {
    const store = setup();
    await runAutoRoute(store, {
      route: async () => {
        throw new RoutingCancelled();
      },
    });
    expect(store.getState()).toMatchObject({ mode: 'edit', routingJob: { status: 'idle' } });
    await runAutoRoute(store, {
      route: async () => {
        throw new Error('boom');
      },
    });
    expect(store.getState().routingJob).toEqual({ status: 'error', message: '佈線時發生錯誤：boom' });
  });
});
