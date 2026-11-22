import { ArrowLeft, Columns2, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useRouter } from '../router';
import { useToasts } from '../traces/toasts';
import { ConfirmDialog, Loading, Notice } from '../traces/ui';
import { narrativeError, type FullVersion, type MythFull, type NarrativeApi } from './api';
import { BeatPanel } from './BeatPanel';
import { Compare } from './Compare';
import { EntityPicker, InlineText } from './controls';
import { beatMap, passagesOf } from './model';
import { Reader } from './Reader';
import { useMyth, type MythStore } from './useMyth';

type Selection = { kind: 'row'; id: string } | { kind: 'pool'; beatId: string } | null;

function BeatStrip({
  full,
  version,
  selectedBeatId,
  linkedRowId,
  onLink,
  onPick,
}: {
  full: MythFull;
  version: FullVersion;
  selectedBeatId: string | null;
  linkedRowId: string | null;
  onLink(id: string | null): void;
  onPick(entry: { beatId: string; rowId: string | null }): void;
}) {
  const entries = beatMap(full, version);
  if (!entries.length) return null;
  const included = entries.filter((entry) => entry.places.length).length;
  const moved = entries.filter((entry) => entry.moved).length;
  return (
    <section className="beat-strip" aria-label="Beats of this myth">
      <ol>
        {entries.map(({ beat, places, rowId, moved: isMoved }) => {
          const state = !places.length ? 'left out of this variation' : isMoved ? `told out of order, passage ${places.join(' and ')}` : `passage ${places.join(' and ')}`;
          const classes = [
            'strip-beat',
            places.length ? 'is-in' : 'is-out',
            isMoved ? 'is-moved' : '',
            selectedBeatId === beat.id ? 'is-selected' : '',
            rowId && linkedRowId === rowId ? 'is-linked' : '',
          ].filter(Boolean).join(' ');
          return (
            <li key={beat.id}>
              <button
                type="button"
                className={classes}
                aria-label={`${beat.label}: ${state}`}
                title={`${beat.label} (${state})`}
                onMouseEnter={() => onLink(rowId)}
                onMouseLeave={() => onLink(null)}
                onClick={() => onPick({ beatId: beat.id, rowId })}
              >
                {places[0] ?? ''}
              </button>
            </li>
          );
        })}
      </ol>
      <p className="small muted">
        {included} of {entries.length} beats{moved ? `, ${moved} out of order` : ''}
      </p>
    </section>
  );
}

function Collections({ api, store, full, version }: { api: NarrativeApi; store: MythStore; full: MythFull; version: FullVersion }) {
  const [picking, setPicking] = useState<'tradition' | string | null>(null);
  const traditions = full.traditions.filter((tradition) => version.traditionIds.includes(tradition.id));
  const mythologyName = (id: string) => full.mythologies.find((item) => item.id === id)?.name ?? '';
  const excluded = useMemo(() => new Set(version.traditionIds), [version.traditionIds]);
  const pickingTradition = traditions.find((tradition) => tradition.id === picking);
  const excludedMythologies = useMemo(
    () => new Set(pickingTradition?.mythologyIds ?? []),
    [pickingTradition],
  );

  const withTradition = (traditionId: string, add: boolean) => (data: MythFull): MythFull => ({
    ...data,
    versions: data.versions.map((item) =>
      item.id === version.id
        ? {
            ...item,
            traditionIds: add
              ? [...item.traditionIds, traditionId]
              : item.traditionIds.filter((id) => id !== traditionId),
          }
        : item,
    ),
  });

  return (
    <div className="collections">
      <ul aria-label="Traditions of this variation">
        {traditions.map((tradition) => (
          <li key={tradition.id} className="collection-group">
            <span className="link-pill">
              <Link to={`/traditions/${tradition.id}`}>{tradition.name}</Link>
              <button
                type="button"
                className="pill-remove"
                aria-label={`Remove from ${tradition.name}`}
                onClick={() =>
                  void store.refresh(
                    () => api.removeFromTradition(tradition.id, version.id),
                    'Could not remove it from that tradition.',
                    withTradition(tradition.id, false),
                  )
                }
              >
                <X size={11} aria-hidden="true" />
              </button>
            </span>
            {tradition.mythologyIds.map((id) => (
              <Link key={id} className="mythology-link" to={`/mythologies/${id}`}>
                <span className="mythology-in" aria-hidden="true">in</span>
                {mythologyName(id)}
              </Link>
            ))}
            <button
              type="button"
              className="text-button add-collection"
              aria-label={`Add ${tradition.name} to a mythology`}
              title="Add to a mythology"
              onClick={() => setPicking(tradition.id)}
            >
              <Plus size={12} aria-hidden="true" /> mythology
            </button>
          </li>
        ))}
        <li>
          <button type="button" className="text-button add-collection" onClick={() => setPicking('tradition')}>
            <Plus size={12} aria-hidden="true" /> Add to a tradition
          </button>
        </li>
      </ul>
      {picking === 'tradition' && (
        <EntityPicker
          noun="tradition"
          load={api.allTraditions}
          exclude={excluded}
          onClose={() => setPicking(null)}
          onPick={(item) =>
            void store.refresh(
              () => api.addToTradition(item.id, version.id),
              'Could not add it to that tradition.',
              withTradition(item.id, true),
            )
          }
          onCreate={(name) =>
            void store.refresh(() => api.createTradition({ name, versionId: version.id }), 'Could not create that tradition.')
          }
        />
      )}
      {pickingTradition && (
        <EntityPicker
          noun="mythology"
          load={api.allMythologies}
          exclude={excludedMythologies}
          onClose={() => setPicking(null)}
          onPick={(item) =>
            void store.refresh(() => api.addToMythology(item.id, pickingTradition.id), 'Could not add it to that mythology.')
          }
          onCreate={(name) =>
            void store.refresh(async () => {
              const mythology = await api.createMythology({ name });
              await api.addToMythology(mythology.id, pickingTradition.id);
            }, 'Could not create that mythology.')
          }
        />
      )}
    </div>
  );
}

function NewVariation({ api, store, full, from, onCreated }: {
  api: NarrativeApi;
  store: MythStore;
  full: MythFull;
  from: FullVersion | null;
  onCreated(id: string): void;
}) {
  const [open, setOpen] = useState(full.versions.length === 0);
  const [title, setTitle] = useState('');
  const [copy, setCopy] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const name = title.trim();
    if (!name || busy) return;
    setBusy(true);
    const created = await store.refresh(async () => {
      const { version } = await api.createVersion(full.myth.id, { title: name });
      if (copy && from) {
        for (const row of from.beats) {
          await api.addVersionBeat(version.id, { beatId: row.beatId, wordingId: row.wordingId, note: row.note });
        }
      }
      return version;
    }, 'Could not create that variation.');
    setBusy(false);
    if (!created) return;
    setTitle('');
    setOpen(false);
    onCreated(created.id);
  }

  if (!open) {
    return (
      <button type="button" className="text-button new-variation" onClick={() => setOpen(true)}>
        <Plus size={13} aria-hidden="true" /> New variation
      </button>
    );
  }
  return (
    <form
      className="new-variation-form"
      aria-label="New variation"
      onSubmit={(event) => void submit(event)}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && full.versions.length) setOpen(false);
      }}
    >
      <input
        autoFocus
        aria-label="New variation title"
        placeholder="Whose telling is this?"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />
      {from && from.beats.length > 0 && (
        <label className="copy-toggle">
          <input type="checkbox" checked={copy} onChange={(event) => setCopy(event.target.checked)} />
          Start from {from.title}
        </label>
      )}
      <button type="submit" className="post-button" disabled={!title.trim() || busy}>Create variation</button>
    </form>
  );
}

export function MythPage({ api, mythId }: { api: NarrativeApi; mythId: string }) {
  const { search, navigate } = useRouter();
  const { notify } = useToasts();
  const store = useMyth(api, mythId);
  const { data, loadError, retry, real } = store;
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const [selection, setSelection] = useState<Selection>(null);
  const [linked, setLinked] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<'myth' | 'version' | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const version = data?.versions.find((item) => item.id === params.get('version')) ?? data?.versions[0] ?? null;
  const compareId = params.get('compare');
  const compareTo = compareId && compareId !== version?.id
    ? data?.versions.find((item) => item.id === compareId) ?? null
    : null;
  const passages = useMemo(() => (data && version ? passagesOf(data, version) : []), [data, version]);

  useEffect(() => {
    setSelection(null);
    setEditing(null);
  }, [version?.id]);

  // The passage being pointed at may have just left the screen, without a blur or mouseleave.
  useEffect(() => setLinked(null), [version?.id, compareId]);

  useEffect(() => {
    if (data) document.title = `${data.myth.title} · disnostos`;
    return () => {
      document.title = 'disnostos';
    };
  }, [data?.myth.title]);

  const urlFor = (versionId: string, compare?: string | null) => {
    const query = new URLSearchParams({ version: versionId });
    if (compare) query.set('compare', compare);
    return `/myths/${mythId}?${query}`;
  };

  if (loadError && !data) {
    return (
      <>
        <Link to="/myths" className="icon-link"><ArrowLeft size={15} aria-hidden="true" /> All myths</Link>
        <Notice onRetry={retry}>{loadError}</Notice>
      </>
    );
  }
  if (!data) return <Loading label="Loading myth" />;

  const selectedRow = selection?.kind === 'row'
    ? version?.beats.find((row) => row.id === real(selection.id) || row.id === selection.id) ?? null
    : null;
  const selectedBeat = selection?.kind === 'pool'
    ? data.beats.find((beat) => beat.id === selection.beatId) ?? null
    : selectedRow
      ? data.beats.find((beat) => beat.id === selectedRow.beatId) ?? null
      : null;
  // A pool beat that was just added to this telling is now shown at its place.
  const panelRow = selectedRow ?? (selectedBeat && version?.beats.find((row) => row.beatId === selectedBeat.id)) ?? null;

  async function confirmDelete() {
    if (!data) return;
    setBusy(true);
    setDeleteError(null);
    try {
      if (deleting === 'myth') {
        await api.deleteMyth(mythId);
        notify('Myth deleted');
        navigate('/myths', { replace: true });
      } else if (deleting === 'version' && version) {
        const next = data.versions.find((item) => item.id !== version.id);
        const removed = await store.refresh(async () => {
          await api.deleteVersion(version.id);
          return true;
        }, 'Could not delete that variation.');
        if (removed) {
          notify('Variation deleted. Its beats stay in the pool.');
          navigate(next ? urlFor(next.id) : `/myths/${mythId}`, { replace: true, keepScroll: true });
        }
        setDeleting(null);
      }
    } catch (caught) {
      setDeleteError(narrativeError(caught));
    } finally {
      setBusy(false);
    }
  }

  const patchMyth = (input: { title?: string; summary?: string | null }) =>
    void store.updateFull(
      (full) => ({ ...full, myth: { ...full.myth, ...input } }),
      () => api.updateMyth(mythId, input),
      'Could not save the myth.',
    );
  const patchVersion = (id: string, input: { title?: string; description?: string | null }) =>
    void store.updateFull(
      (full) => ({
        ...full,
        versions: full.versions.map((item) => (item.id === id ? { ...item, ...input } : item)),
      }),
      () => api.updateVersion(id, input),
      'Could not save the variation.',
    );

  return (
    <div className={`myth-page${selectedBeat ? ' has-panel' : ''}`}>
      <div className="myth-column">
        <div className="document-bar myth-bar">
          <Link to="/myths" className="icon-link"><ArrowLeft size={15} aria-hidden="true" /> All myths</Link>
          <button type="button" className="icon-button" aria-label="Delete myth" title="Delete myth" onClick={() => setDeleting('myth')}>
            <Trash2 size={15} aria-hidden="true" />
          </button>
        </div>

        <header className="myth-head">
          <h1>
            <InlineText
              className="myth-title"
              label="Myth title"
              value={data.myth.title}
              required
              onSave={(title) => title && patchMyth({ title })}
            />
          </h1>
          <InlineText
            className="myth-summary"
            label="Myth summary"
            placeholder="Add a summary"
            multiline
            value={data.myth.summary}
            onSave={(summary) => patchMyth({ summary })}
          />
        </header>

        <nav className="variations" aria-label="Variations">
          <ul>
            {data.versions.map((item) => (
              <li key={item.id}>
                <Link
                  to={urlFor(item.id, compareTo && compareTo.id !== item.id ? compareTo.id : null)}
                  className={item.id === version?.id ? 'chip is-active' : 'chip'}
                  aria-current={item.id === version?.id ? 'page' : undefined}
                  keepScroll
                >
                  {item.title}
                </Link>
              </li>
            ))}
          </ul>
          <NewVariation
            key={data.versions.length}
            api={api}
            store={store}
            full={data}
            from={version}
            onCreated={(id) => navigate(urlFor(id), { keepScroll: true })}
          />
        </nav>

        {version && (
          <>
            <section className="variation-head" aria-label="This variation">
              <div className="variation-title-row">
                <InlineText
                  className="variation-title"
                  label="Variation title"
                  value={version.title}
                  required
                  onSave={(title) => title && patchVersion(version.id, { title })}
                />
                {data.versions.length > 1 && (
                  <label className="compare-picker">
                    <span className="sr-only">Compare with</span>
                    <Columns2 size={14} aria-hidden="true" />
                    <select
                      aria-label="Compare with"
                      value={compareTo?.id ?? ''}
                      onChange={(event) => navigate(urlFor(version.id, event.target.value || null), { keepScroll: true })}
                    >
                      <option value="">Compare with…</option>
                      {data.versions.filter((item) => item.id !== version.id).map((item) => (
                        <option key={item.id} value={item.id}>{item.title}</option>
                      ))}
                    </select>
                  </label>
                )}
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Delete variation ${version.title}`}
                  title="Delete variation"
                  onClick={() => setDeleting('version')}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </div>
              <InlineText
                className="variation-description"
                label="Variation description"
                placeholder="Who tells it, where, and why?"
                multiline
                value={version.description}
                onSave={(description) => patchVersion(version.id, { description })}
              />
              <Collections api={api} store={store} full={data} version={version} />
            </section>

            <BeatStrip
              full={data}
              version={version}
              selectedBeatId={selectedBeat?.id ?? null}
              linkedRowId={linked}
              onLink={setLinked}
              onPick={({ beatId, rowId }) =>
                setSelection(rowId ? { kind: 'row', id: rowId } : { kind: 'pool', beatId })
              }
            />

            {compareTo ? (
              <>
                <button
                  type="button"
                  className="text-button back-to-reading"
                  onClick={() => navigate(urlFor(version.id), { keepScroll: true })}
                >
                  <ArrowLeft size={13} aria-hidden="true" /> Back to reading
                </button>
                <Compare full={data} left={version} right={compareTo} />
              </>
            ) : (
              <Reader
                store={store}
                full={data}
                version={version}
                passages={passages}
                selected={panelRow?.id ?? null}
                linked={linked}
                editing={editing}
                onLink={setLinked}
                onSelect={(id) => setSelection({ kind: 'row', id })}
                onEdit={setEditing}
              />
            )}
          </>
        )}
      </div>

      {selectedBeat && (
        <BeatPanel
          key={selectedBeat.id}
          store={store}
          api={api}
          full={data}
          version={version}
          beat={selectedBeat}
          row={panelRow}
          onClose={() => setSelection(null)}
          onEdit={(id) => {
            setEditing(id);
            if (compareTo && version) navigate(urlFor(version.id), { keepScroll: true });
          }}
        />
      )}

      {deleting === 'myth' && (
        <ConfirmDialog
          title="Delete this myth?"
          body={`“${data.myth.title}” and all its beats, wordings and variations will be permanently deleted. Traditions and mythologies stay.`}
          confirmLabel="Delete myth"
          busy={busy}
          error={deleteError}
          onCancel={() => setDeleting(null)}
          onConfirm={() => void confirmDelete()}
        />
      )}
      {deleting === 'version' && version && (
        <ConfirmDialog
          title="Delete this variation?"
          body={`“${version.title}” will be deleted. Its beats and wordings stay in the myth's pool.`}
          confirmLabel="Delete variation"
          busy={busy}
          error={deleteError}
          onCancel={() => setDeleting(null)}
          onConfirm={() => void confirmDelete()}
        />
      )}
    </div>
  );
}
