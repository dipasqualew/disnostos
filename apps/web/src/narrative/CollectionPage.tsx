import { ArrowLeft, Plus, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useRouter } from '../router';
import { isAbort } from '../traces/api';
import { useToasts } from '../traces/toasts';
import { ConfirmDialog, Loading, Notice } from '../traces/ui';
import { narrativeError, type CollectionKind, type NarrativeApi } from './api';
import { EntityPicker, InlineText, type PickerItem } from './controls';

type Member = { id: string; name: string; to: string; context?: string };
type Loaded = {
  name: string;
  description: string | null;
  members: Member[];
  parents: Member[];
};

async function loadTradition(api: NarrativeApi, id: string, signal: AbortSignal): Promise<Loaded> {
  const tradition = await api.getTradition(id, signal);
  const versions = await Promise.all(tradition.versionIds.map((versionId) => api.getVersion(versionId, signal)));
  const mythIds = [...new Set(versions.map((version) => version.mythId))];
  const myths = await Promise.all(mythIds.map((mythId) => api.getMyth(mythId, signal)));
  const parents = await Promise.all(tradition.mythologyIds.map((mythologyId) => api.getMythology(mythologyId, signal)));
  return {
    name: tradition.name,
    description: tradition.description,
    members: versions.map((version) => ({
      id: version.id,
      name: version.title,
      to: `/myths/${version.mythId}?version=${version.id}`,
      context: myths.find((myth) => myth.id === version.mythId)?.title,
    })),
    parents: parents.map((item) => ({ id: item.id, name: item.name, to: `/mythologies/${item.id}` })),
  };
}

async function loadMythology(api: NarrativeApi, id: string, signal: AbortSignal): Promise<Loaded> {
  const mythology = await api.getMythology(id, signal);
  const traditions = await Promise.all(mythology.traditionIds.map((traditionId) => api.getTradition(traditionId, signal)));
  return {
    name: mythology.name,
    description: mythology.description,
    members: traditions.map((item) => ({
      id: item.id,
      name: item.name,
      to: `/traditions/${item.id}`,
      context: `${item.versionIds.length} ${item.versionIds.length === 1 ? 'variation' : 'variations'}`,
    })),
    parents: [],
  };
}

/** A tradition or a mythology: what it gathers, and where it belongs. */
export function CollectionPage({ api, kind, id }: { api: NarrativeApi; kind: CollectionKind; id: string }) {
  const { navigate } = useRouter();
  const { notify } = useToasts();
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [picking, setPicking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const noun = kind === 'tradition' ? 'Tradition' : 'Mythology';

  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    (kind === 'tradition' ? loadTradition : loadMythology)(api, id, controller.signal).then(setData, (caught: unknown) => {
      if (!isAbort(caught)) setError(narrativeError(caught));
    });
    return () => controller.abort();
  }, [api, attempt, id, kind]);

  const exclude = useMemo(
    () => new Set((kind === 'tradition' ? data?.parents : data?.members)?.map((item) => item.id) ?? []),
    [data, kind],
  );

  async function attempted(action: () => Promise<unknown>, failure: string) {
    try {
      await action();
      reload();
    } catch (caught) {
      notify(`${failure} ${narrativeError(caught)}`);
    }
  }

  const save = (input: { name?: string; description?: string | null }) => {
    setData((current) => (current ? { ...current, ...input } : current));
    void attempted(
      () => (kind === 'tradition' ? api.updateTradition(id, input) : api.updateMythology(id, input)),
      'Could not save that.',
    );
  };

  const pick = (item: PickerItem) =>
    void attempted(
      () => (kind === 'tradition' ? api.addToMythology(item.id, id) : api.addToMythology(id, item.id)),
      'Could not add that.',
    );

  const create = (name: string) =>
    void attempted(async () => {
      if (kind === 'tradition') {
        const mythology = await api.createMythology({ name });
        await api.addToMythology(mythology.id, id);
      } else {
        await api.createTradition({ name, mythologyId: id });
      }
    }, 'Could not create that.');

  async function remove() {
    setBusy(true);
    try {
      await (kind === 'tradition' ? api.deleteTradition(id) : api.deleteMythology(id));
      notify(`${noun} deleted`);
      navigate('/myths', { replace: true });
    } catch (caught) {
      notify(`Could not delete it. ${narrativeError(caught)}`);
      setDeleting(false);
    } finally {
      setBusy(false);
    }
  }

  const back = <Link to="/myths" className="icon-link"><ArrowLeft size={15} aria-hidden="true" /> All myths</Link>;
  if (error && !data) {
    return (
      <>
        {back}
        <Notice onRetry={reload}>{error}</Notice>
      </>
    );
  }
  if (!data) return <Loading label={`Loading ${noun.toLowerCase()}`} />;

  const pickerNoun = kind === 'tradition' ? 'mythology' : 'tradition';
  const membersLabel = kind === 'tradition' ? 'Variations' : 'Traditions';

  return (
    <div className="collection-page">
      <div className="document-bar myth-bar">
        {back}
        <button type="button" className="icon-button" aria-label={`Delete ${noun.toLowerCase()}`} title="Delete" onClick={() => setDeleting(true)}>
          <Trash2 size={15} aria-hidden="true" />
        </button>
      </div>
      <p className="eyebrow">{noun}</p>
      <h1>
        <InlineText
          className="myth-title"
          label={`${noun} name`}
          value={data.name}
          required
          onSave={(name) => name && save({ name })}
        />
      </h1>
      <InlineText
        className="myth-summary"
        label={`${noun} description`}
        placeholder="Add a description"
        multiline
        value={data.description}
        onSave={(description) => save({ description })}
      />

      {kind === 'tradition' && (
        <section aria-labelledby="parents-heading" className="collection-section">
          <h2 id="parents-heading">Mythologies</h2>
          <ul className="pill-list">
            {data.parents.map((parent) => (
              <li key={parent.id} className="link-pill">
                <Link to={parent.to}>{parent.name}</Link>
                <button
                  type="button"
                  className="pill-remove"
                  aria-label={`Remove from ${parent.name}`}
                  onClick={() => void attempted(() => api.removeFromMythology(parent.id, id), 'Could not remove that.')}
                >
                  <X size={11} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="members-heading" className="collection-section">
        <h2 id="members-heading">{membersLabel}</h2>
        {data.members.length === 0 && (
          <p className="muted small">
            {kind === 'tradition'
              ? 'No variations yet. Open a myth and add one of its variations here.'
              : 'No traditions yet.'}
          </p>
        )}
        <ul className="member-list">
          {data.members.map((member) => (
            <li key={member.id}>
              <Link to={member.to}>{member.name}</Link>
              {member.context && <span className="muted small">{member.context}</span>}
              <button
                type="button"
                className="pill-remove"
                aria-label={`Remove ${member.name}`}
                onClick={() =>
                  void attempted(
                    () => (kind === 'tradition' ? api.removeFromTradition(id, member.id) : api.removeFromMythology(id, member.id)),
                    'Could not remove that.',
                  )
                }
              >
                <X size={12} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </section>

      {picking ? (
        <EntityPicker
          noun={pickerNoun}
          load={kind === 'tradition' ? api.allMythologies : api.allTraditions}
          exclude={exclude}
          onPick={pick}
          onCreate={create}
          onClose={() => setPicking(false)}
        />
      ) : (
        <button type="button" className="text-button add-collection" onClick={() => setPicking(true)}>
          <Plus size={12} aria-hidden="true" /> {kind === 'tradition' ? 'Add to a mythology' : 'Add a tradition'}
        </button>
      )}

      {deleting && (
        <ConfirmDialog
          title={`Delete this ${noun.toLowerCase()}?`}
          body={`“${data.name}” will be deleted. The myths and variations in it stay.`}
          confirmLabel={`Delete ${noun.toLowerCase()}`}
          busy={busy}
          onCancel={() => setDeleting(false)}
          onConfirm={() => void remove()}
        />
      )}
    </div>
  );
}
