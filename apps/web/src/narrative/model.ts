import type { FullVersion, MythFull, PoolBeat, VersionBeat, Wording } from './api';

const MAX_LABEL = 60;

export const paragraphs = (text: string) =>
  text.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);

/** A working label from the opening words: the first sentence, cut at a word if long. */
export function deriveLabel(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const sentence = /^.+?[.!?;:…](?=\s|$)/.exec(flat)?.[0].replace(/[.;:]$/, '') ?? flat;
  if (sentence.length <= MAX_LABEL) return sentence;
  const cut = sentence.slice(0, MAX_LABEL);
  const space = cut.lastIndexOf(' ');
  return `${(space > 20 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

export function isLanguageTag(value: string): boolean {
  try {
    return Intl.getCanonicalLocales(value).length === 1;
  } catch {
    return false;
  }
}

export type Passage = {
  row: VersionBeat;
  beat: PoolBeat | null;
  wording: Wording | null;
  /** The telling has not chosen a wording, so this one was borrowed from the pool. */
  borrowed: boolean;
};

export function passagesOf(full: MythFull, version: FullVersion): Passage[] {
  const beats = new Map(full.beats.map((beat) => [beat.id, beat]));
  return version.beats.map((row) => {
    const beat = beats.get(row.beatId) ?? null;
    const chosen = beat?.wordings.find((wording) => wording.id === row.wordingId) ?? null;
    const wording = chosen ?? beat?.wordings[0] ?? null;
    return { row, beat, wording, borrowed: !chosen && wording !== null };
  });
}

/**
 * One shared order for the pool, merged from every telling, so that a beat keeps its
 * place on the map when switching variation. Beats nobody uses come last.
 */
export function poolOrder(full: MythFull): string[] {
  const order: string[] = [];
  for (const version of full.versions) {
    let cursor = -1;
    for (const { beatId } of version.beats) {
      const found = order.indexOf(beatId);
      if (found >= 0) {
        cursor = found;
      } else {
        order.splice(cursor + 1, 0, beatId);
        cursor += 1;
      }
    }
  }
  for (const beat of full.beats) if (!order.includes(beat.id)) order.push(beat.id);
  return order;
}

/** Indexes of a longest increasing subsequence: the elements that did not move. */
function longestIncreasing(values: number[]): Set<number> {
  const tails: number[] = [];
  const previous = new Array<number>(values.length).fill(-1);
  values.forEach((value, index) => {
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (values[tails[middle]!]! < value) low = middle + 1;
      else high = middle;
    }
    if (low > 0) previous[index] = tails[low - 1]!;
    tails[low] = index;
  });
  const kept = new Set<number>();
  for (let at = tails.at(-1) ?? -1; at >= 0; at = previous[at]!) kept.add(at);
  return kept;
}

export type MapEntry = {
  beat: PoolBeat;
  /** 1-based places of this beat in the telling. Empty when it is left out. */
  places: number[];
  rowId: string | null;
  moved: boolean;
};

export function beatMap(full: MythFull, version: FullVersion): MapEntry[] {
  const order = poolOrder(full);
  const rank = new Map(order.map((id, index) => [id, index]));
  const ranks = version.beats.map((row) => rank.get(row.beatId) ?? 0);
  const kept = longestIncreasing(ranks);
  const movedBeats = new Set(version.beats.filter((_, index) => !kept.has(index)).map((row) => row.beatId));
  const beats = new Map(full.beats.map((beat) => [beat.id, beat]));
  return order.flatMap((id) => {
    const beat = beats.get(id);
    if (!beat) return [];
    const places = version.beats.flatMap((row, index) => (row.beatId === id ? [index + 1] : []));
    const rowId = version.beats.find((row) => row.beatId === id)?.id ?? null;
    return [{ beat, places, rowId, moved: movedBeats.has(id) }];
  });
}

export type AlignedRow = {
  left: Passage | null;
  right: Passage | null;
  /** The other telling has this beat too, at a different point in the story. */
  moved: boolean;
  /** Both tell this beat, in different words. */
  differs: boolean;
};

/** Lines two tellings up by their shared beats, keeping each one's own order. */
export function alignPassages(left: Passage[], right: Passage[]): AlignedRow[] {
  const lengths = Array.from({ length: left.length + 1 }, () => new Array<number>(right.length + 1).fill(0));
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      lengths[i]![j] =
        left[i]!.row.beatId === right[j]!.row.beatId
          ? lengths[i + 1]![j + 1]! + 1
          : Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!);
    }
  }
  const leftBeats = new Set(left.map((passage) => passage.row.beatId));
  const rightBeats = new Set(right.map((passage) => passage.row.beatId));
  const rows: AlignedRow[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length || j < right.length) {
    const l = left[i];
    const r = right[j];
    if (l && r && l.row.beatId === r.row.beatId) {
      rows.push({ left: l, right: r, moved: false, differs: l.wording?.id !== r.wording?.id });
      i += 1;
      j += 1;
    } else if (l && (!r || lengths[i + 1]![j]! >= lengths[i]![j + 1]!)) {
      rows.push({ left: l, right: null, moved: rightBeats.has(l.row.beatId), differs: false });
      i += 1;
    } else {
      rows.push({ left: null, right: r!, moved: leftBeats.has(r!.row.beatId), differs: false });
      j += 1;
    }
  }
  return rows;
}

export const versionsUsing = (full: MythFull, beatId: string) =>
  full.versions.filter((version) => version.beats.some((row) => row.beatId === beatId));

/** The language to offer next: the one this telling was last written in. */
export function currentLanguage(passages: Passage[], fallback = 'en'): string {
  for (let index = passages.length - 1; index >= 0; index -= 1) {
    const language = passages[index]!.wording?.language;
    if (language) return language;
  }
  return fallback;
}

export type { Wording };
