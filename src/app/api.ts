import type { StatusResponse, TurnRequest, TurnResponse } from '../../shared/contract.ts';

const SERVER_DOWN = 'Cannot reach the demo server. Start it with "npm run dev".';

export async function fetchStatus(signal?: AbortSignal): Promise<StatusResponse> {
  const response = await fetch('/api/status', { signal }).catch(() => null);
  if (!response?.ok) throw new Error(SERVER_DOWN);
  return (await response.json()) as StatusResponse;
}

/** Never rejects: a turn that could not be run comes back as a failed turn. */
export async function requestTurn(request: TurnRequest): Promise<TurnResponse> {
  const failure = (message: string): TurnResponse => ({
    ok: false,
    provider: request.provider,
    error: { code: 'provider_unavailable', message },
    attempts: [],
    elapsedMs: 0,
  });
  try {
    const response = await fetch('/api/turn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    const body = (await response.json().catch(() => null)) as TurnResponse | null;
    if (body && typeof body.ok === 'boolean') return body;
    return failure(response.status >= 500 ? SERVER_DOWN : `The server answered HTTP ${response.status}.`);
  } catch {
    return failure(SERVER_DOWN);
  }
}
