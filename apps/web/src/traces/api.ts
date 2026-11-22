import { apiFetch } from '../api';
import type { AuthClient } from '../auth/client';

export type Trace = {
  id: string;
  title: string | null;
  body: string;
  language: string | null;
  writtenOn: string;
  createdAt: string;
  updatedAt: string;
};

export type TraceImage = {
  id: string;
  traceId: string;
  title: string;
  mimeType: string;
  byteSize: number;
  createdAt: string;
};

export type TraceLink = {
  id: string;
  note: string | null;
  createdAt: string;
  trace: { id: string; title: string | null; writtenOn: string };
};

export type TraceDetail = Trace & { images: TraceImage[]; links: TraceLink[] };
export type TracePage = { items: Trace[]; nextCursor: string | null };
export type TraceInput = { title: string | null; body: string; writtenOn: string };
export type ListQuery = { from?: string; to?: string; cursor?: string; limit?: number };

type ErrorDetail = { path: string; message: string };

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details: ErrorDetail[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const isAbort = (error: unknown) =>
  typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError';

/** A sentence for the reader. Status 0 means the request never got an answer. */
export function errorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Something went wrong. Try again.';
  switch (error.status) {
    case 0:
      return 'Could not reach disnostos. Check your connection and try again.';
    case 400:
      return error.details[0]?.message ?? 'Some of this could not be accepted. Check it and try again.';
    case 401:
      return 'Your session has ended. Sign in again.';
    case 404:
      return 'This trace could not be found.';
    case 409:
      return 'These traces are already linked.';
    case 413:
      return 'That is too large. Images can be up to 10 MB.';
    case 415:
      return 'That file is not a supported image. Use JPEG, PNG, WebP, or GIF.';
    default:
      return 'disnostos could not complete that just now. Try again.';
  }
}

type Auth = Pick<AuthClient, 'getIdToken' | 'signOut'>;

async function toApiError(response: Response): Promise<ApiError> {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
    details?: ErrorDetail[];
  } | null;
  return new ApiError(response.status, body?.error ?? response.statusText, body?.details ?? []);
}

export function createTracesApi(auth: Auth) {
  async function send(path: string, init: RequestInit = {}): Promise<Response> {
    try {
      let response = await apiFetch(path, () => auth.getIdToken(), init);
      if (response.status === 401) {
        // The token may just have expired: refresh it and try exactly once more.
        response = await apiFetch(path, () => auth.getIdToken(true), init);
        if (response.status === 401) {
          await auth.signOut();
          throw new ApiError(401, 'Unauthorized');
        }
      }
      if (!response.ok) throw await toApiError(response);
      return response;
    } catch (error) {
      if (error instanceof ApiError || isAbort(error)) throw error;
      throw new ApiError(0, 'Network error');
    }
  }

  const json = async <T>(path: string, init?: RequestInit) =>
    (await (await send(path, init)).json()) as T;

  const withJson = (method: string, body: unknown, signal?: AbortSignal): RequestInit => ({
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  return {
    list(query: ListQuery = {}, signal?: AbortSignal) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== '') params.set(key, String(value));
      }
      const suffix = params.size ? `?${params}` : '';
      return json<TracePage>(`/traces${suffix}`, { signal });
    },
    get: (id: string, signal?: AbortSignal) =>
      json<TraceDetail>(`/traces/${encodeURIComponent(id)}`, { signal }),
    create: (input: TraceInput) => {
      const { title, ...rest } = input;
      return json<Trace>('/traces', withJson('POST', title ? input : rest));
    },
    update: (id: string, input: TraceInput) =>
      json<Trace>(`/traces/${encodeURIComponent(id)}`, withJson('PATCH', input)),
    remove: async (id: string) => {
      await send(`/traces/${encodeURIComponent(id)}`, { method: 'DELETE' });
    },
    addImage: (traceId: string, file: File) =>
      json<TraceImage>(
        `/traces/${encodeURIComponent(traceId)}/images?filename=${encodeURIComponent(file.name)}`,
        { method: 'POST', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream' } },
      ),
    imageBlob: async (traceId: string, imageId: string, signal?: AbortSignal) =>
      (
        await send(
          `/traces/${encodeURIComponent(traceId)}/images/${encodeURIComponent(imageId)}`,
          { signal },
        )
      ).blob(),
    removeImage: async (traceId: string, imageId: string) => {
      await send(`/traces/${encodeURIComponent(traceId)}/images/${encodeURIComponent(imageId)}`, {
        method: 'DELETE',
      });
    },
    link: (traceId: string, otherId: string, note: string | null) =>
      json<TraceLink>(
        `/traces/${encodeURIComponent(traceId)}/links`,
        withJson('POST', note ? { traceId: otherId, note } : { traceId: otherId }),
      ),
    unlink: async (traceId: string, linkId: string) => {
      await send(`/traces/${encodeURIComponent(traceId)}/links/${encodeURIComponent(linkId)}`, {
        method: 'DELETE',
      });
    },
  };
}

export type TracesApi = ReturnType<typeof createTracesApi>;
