import { useEffect, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

type ApiStatus =
  | { state: 'loading' }
  | { state: 'ok'; message: string }
  | { state: 'unavailable' };

async function fetchHello(signal: AbortSignal): Promise<string> {
  const response = await fetch(`${API_URL}/hello`, { signal });
  if (!response.ok) throw new Error(`Unexpected status ${response.status}`);

  const body = (await response.json()) as { message?: unknown };
  if (typeof body.message !== 'string') throw new Error('Malformed response');
  return body.message;
}

export function App() {
  const [status, setStatus] = useState<ApiStatus>({ state: 'loading' });

  useEffect(() => {
    const controller = new AbortController();

    fetchHello(controller.signal)
      .then((message) => setStatus({ state: 'ok', message }))
      .catch(() => {
        if (!controller.signal.aborted) setStatus({ state: 'unavailable' });
      });

    return () => controller.abort();
  }, []);

  return (
    <main>
      <h1>disnostos</h1>
      <p className={`status status-${status.state}`} role="status">
        {status.state === 'loading' && 'Checking API…'}
        {status.state === 'ok' && status.message}
        {status.state === 'unavailable' && 'API unavailable'}
      </p>
    </main>
  );
}
