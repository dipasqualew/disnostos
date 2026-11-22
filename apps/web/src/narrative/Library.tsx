import { ArrowRight } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useRouter } from '../router';
import { isAbort } from '../traces/api';
import { useToasts } from '../traces/toasts';
import { Loading, Notice } from '../traces/ui';
import { narrativeError, type Myth, type Mythology, type NarrativeApi, type Tradition } from './api';

export const FIRST_VARIATION_TITLE = 'First telling';

function QuickCreate({ label, placeholder, action, onCreate }: {
  label: string;
  placeholder: string;
  action: string;
  onCreate(name: string): Promise<void>;
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = name.trim();
    if (!value || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onCreate(value);
      setName('');
    } catch (caught) {
      setError(narrativeError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="quick-create" aria-label={action} onSubmit={(event) => void submit(event)}>
      <input aria-label={label} placeholder={placeholder} value={name} onChange={(event) => setName(event.target.value)} />
      <button type="submit" className="quiet" disabled={!name.trim() || busy}>{action}</button>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  );
}

export function Library({ api }: { api: NarrativeApi }) {
  const { navigate } = useRouter();
  const { notify } = useToasts();
  const [myths, setMyths] = useState<Myth[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [traditions, setTraditions] = useState<Tradition[]>([]);
  const [mythologies, setMythologies] = useState<Mythology[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [moreBusy, setMoreBusy] = useState(false);
  const titleInput = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    Promise.all([
      api.listMyths(null, controller.signal),
      api.allTraditions(controller.signal),
      api.allMythologies(controller.signal),
    ]).then(
      ([page, allTraditions, allMythologies]) => {
        setMyths(page.items);
        setCursor(page.nextCursor);
        setTraditions(allTraditions);
        setMythologies(allMythologies);
        setStatus('ready');
      },
      (caught: unknown) => {
        if (isAbort(caught)) return;
        setError(narrativeError(caught));
        setStatus('error');
      },
    );
    return () => controller.abort();
  }, [api, attempt]);

  useEffect(() => {
    if (status === 'ready' && window.matchMedia?.('(pointer: fine)').matches) {
      titleInput.current?.querySelector('input')?.focus();
    }
  }, [status]);

  async function loadMore() {
    if (!cursor) return;
    setMoreBusy(true);
    try {
      const page = await api.listMyths(cursor);
      setMyths((current) => [...current, ...page.items]);
      setCursor(page.nextCursor);
    } catch (caught) {
      notify(narrativeError(caught));
    } finally {
      setMoreBusy(false);
    }
  }

  if (status === 'loading') return <Loading label="Loading your myths" />;
  if (status === 'error') return <Notice onRetry={() => setAttempt((value) => value + 1)}>{error}</Notice>;

  return (
    <div className="library">
      <section className="library-main" aria-labelledby="myths-heading">
        <h1 id="myths-heading">Myths</h1>
        <div ref={titleInput}>
          <QuickCreate
            label="New myth title"
            placeholder="Name a story…"
            action="Create myth"
            onCreate={async (title) => {
              const { myth, version } = await api.createMyth({ title, version: { title: FIRST_VARIATION_TITLE } });
              navigate(`/myths/${myth.id}${version ? `?version=${version.id}` : ''}`);
            }}
          />
        </div>
        {myths.length === 0 ? (
          <div className="empty">
            <p className="empty-lead">Every myth is many myths.</p>
            <p className="muted">Name a story above and start telling it.</p>
          </div>
        ) : (
          <ul className="myth-list">
            {myths.map((myth) => (
              <li key={myth.id}>
                <Link to={`/myths/${myth.id}`} className="myth-card">
                  <span className="myth-card-title">{myth.title}</span>
                  {myth.summary && <span className="myth-card-summary">{myth.summary}</span>}
                  <ArrowRight size={15} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
        {cursor && (
          <button type="button" className="quiet load-more" disabled={moreBusy} onClick={() => void loadMore()}>
            {moreBusy ? 'Loading…' : 'Load more'}
          </button>
        )}
      </section>

      <div className="library-side">
        <section aria-labelledby="mythologies-heading">
          <h2 id="mythologies-heading">Mythologies</h2>
          <QuickCreate
            label="New mythology name"
            placeholder="Greek, Norse, personal…"
            action="Add mythology"
            onCreate={async (name) => {
              const mythology = await api.createMythology({ name });
              setMythologies((current) => [...current, mythology]);
            }}
          />
          <ul className="collection-list">
            {mythologies.map((item) => (
              <li key={item.id}><Link to={`/mythologies/${item.id}`}>{item.name}</Link></li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="traditions-heading">
          <h2 id="traditions-heading">Traditions</h2>
          <QuickCreate
            label="New tradition name"
            placeholder="Orphic, Homeric, my 20s…"
            action="Add tradition"
            onCreate={async (name) => {
              const { tradition } = await api.createTradition({ name });
              setTraditions((current) => [...current, tradition]);
            }}
          />
          <ul className="collection-list">
            {traditions.map((item) => (
              <li key={item.id}><Link to={`/traditions/${item.id}`}>{item.name}</Link></li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
