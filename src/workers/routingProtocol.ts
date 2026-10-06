import { autoRoute } from '../core/routing/autoRoute';
import type { Circuit } from '../types/circuit';
import type { RoutingResult } from '../types/routing';

export interface RouteRequest {
  type: 'route';
  jobId: number;
  circuit: Circuit;
}

export type RouteResponse =
  | { type: 'result'; jobId: number; result: RoutingResult }
  | { type: 'error'; jobId: number; message: string };

export function handleRouteRequest(request: RouteRequest): RouteResponse {
  try {
    return { type: 'result', jobId: request.jobId, result: autoRoute(request.circuit) };
  } catch (error) {
    return { type: 'error', jobId: request.jobId, message: error instanceof Error ? error.message : String(error) };
  }
}
