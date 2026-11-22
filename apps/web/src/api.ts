const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

/** Calls the API, attaching the signed-in user's ID token when there is one. */
export async function apiFetch(
  path: string,
  getIdToken: () => Promise<string | null>,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = await getIdToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(`${API_URL}${path}`, { ...init, headers });
}
