export type Draft = { title: string; body: string; writtenOn: string };

const PREFIX = 'disnostos:draft:';
const key = (uid: string, traceId: string | null) => `${PREFIX}${uid}:${traceId ?? 'new'}`;

// Kept for this tab only, so an expired session or failed save cannot lose writing.
// Storage can be unavailable (private modes, quota); drafts are then simply not kept.
export function saveDraft(uid: string, traceId: string | null, draft: Draft) {
  try {
    sessionStorage.setItem(key(uid, traceId), JSON.stringify(draft));
  } catch {
    // Best effort.
  }
}

export function loadDraft(uid: string, traceId: string | null): Draft | null {
  try {
    const raw = sessionStorage.getItem(key(uid, traceId));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<Draft>;
    return typeof value.title === 'string' &&
      typeof value.body === 'string' &&
      typeof value.writtenOn === 'string'
      ? { title: value.title, body: value.body, writtenOn: value.writtenOn }
      : null;
  } catch {
    return null;
  }
}

export function clearDraft(uid: string, traceId: string | null) {
  try {
    sessionStorage.removeItem(key(uid, traceId));
  } catch {
    // Best effort.
  }
}

/** Called on deliberate sign-out, so private writing does not outlive the session. */
export function clearAllDrafts() {
  try {
    Object.keys(sessionStorage)
      .filter((name) => name.startsWith(PREFIX))
      .forEach((name) => sessionStorage.removeItem(name));
  } catch {
    // Best effort.
  }
}
