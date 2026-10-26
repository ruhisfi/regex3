import { execute, type ExecuteRequest, type ExecuteResult } from './engine';

export interface WorkerRequest extends ExecuteRequest {
  id: number;
}

export interface WorkerResponse {
  id: number;
  result: ExecuteResult;
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, ...request } = event.data;
  const response: WorkerResponse = { id, result: execute(request) };
  self.postMessage(response);
};
