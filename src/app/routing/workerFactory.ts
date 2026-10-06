import RoutingWorker from '../../workers/routing.worker?worker&inline';
import type { WorkerLike } from './routingClient';

export function createRoutingWorker(): WorkerLike {
  return new RoutingWorker() as unknown as WorkerLike;
}
