import { handleRouteRequest, type RouteRequest } from './routingProtocol';

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<RouteRequest>) => void) | null;
  postMessage(message: unknown): void;
};

scope.onmessage = (event) => {
  scope.postMessage(handleRouteRequest(event.data));
};
