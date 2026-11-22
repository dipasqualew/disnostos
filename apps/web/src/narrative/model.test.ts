import { describe, expect, it } from 'vitest';
import type { FullVersion, MythFull, PoolBeat, VersionBeat, Wording } from './api';
import { alignPassages, beatMap, currentLanguage, deriveLabel, isLanguageTag, paragraphs, passagesOf, poolOrder } from './model';
import { afterIdForMove } from './Reader';
import { placed } from './useMyth';

const times = { createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };

const wording = (id: string, beatId: string, text = id, language = 'en'): Wording => ({
  ...times,
  id,
  beatId,
  language,
  text,
  translatedFromId: null,
  promotedFromTraceId: null,
  forkedFromId: null,
});

const beat = (id: string, wordings: Wording[] = [wording(`w-${id}`, id)]): PoolBeat => ({
  ...times,
  id,
  mythId: 'm',
  label: `Beat ${id}`,
  forkedFromId: null,
  wordings,
});

const row = (versionId: string, beatId: string, index: number, wordingId: string | null = `w-${beatId}`): VersionBeat => ({
  ...times,
  id: `${versionId}-${beatId}-${index}`,
  versionId,
  beatId,
  wordingId,
  position: index,
  note: null,
});

const version = (id: string, beatIds: string[]): FullVersion => ({
  ...times,
  id,
  mythId: 'm',
  title: id,
  description: null,
  forkedFromId: null,
  beats: beatIds.map((beatId, index) => row(id, beatId, index)),
  traditionIds: [],
  mythologyIds: [],
});

const full = (beats: PoolBeat[], versions: FullVersion[]): MythFull => ({
  myth: { ...times, id: 'm', title: 'Myth', summary: null, forkedFromId: null },
  beats,
  versions,
  traditions: [],
  mythologies: [],
});

describe('writing helpers', () => {
  it('derives a label from the first sentence', () => {
    expect(deriveLabel('The gate opens. Then she walks through.')).toBe('The gate opens');
    expect(deriveLabel('Does she look back? Nobody knows.')).toBe('Does she look back?');
  });

  it('cuts a long label at a word', () => {
    const label = deriveLabel('word '.repeat(40));
    expect(label.length).toBeLessThanOrEqual(61);
    expect(label.endsWith('word…')).toBe(true);
  });

  it('splits pasted text into paragraphs', () => {
    expect(paragraphs('One.\nStill one.\n\n  Two.\n \nThree.  ')).toEqual(['One.\nStill one.', 'Two.', 'Three.']);
  });

  it('accepts language tags and refuses anything else', () => {
    expect(isLanguageTag('grc')).toBe(true);
    expect(isLanguageTag('pt-BR')).toBe(true);
    expect(isLanguageTag('not a language')).toBe(false);
  });
});

describe('passages', () => {
  it('uses the chosen wording', () => {
    const b = beat('a', [wording('one', 'a'), wording('two', 'a')]);
    const v = version('v', ['a']);
    v.beats[0]!.wordingId = 'two';
    const [passage] = passagesOf(full([b], [v]), v);
    expect(passage).toMatchObject({ wording: { id: 'two' }, borrowed: false });
  });

  it('borrows from the pool when none is chosen, and marks it', () => {
    const b = beat('a');
    const v = version('v', ['a']);
    v.beats[0]!.wordingId = null;
    expect(passagesOf(full([b], [v]), v)[0]).toMatchObject({ wording: { id: 'w-a' }, borrowed: true });
  });

  it('survives a beat with no wording at all', () => {
    const b = beat('a', []);
    const v = version('v', ['a']);
    v.beats[0]!.wordingId = null;
    expect(passagesOf(full([b], [v]), v)[0]).toMatchObject({ wording: null, borrowed: false });
  });

  it('offers the language last written in', () => {
    const b = beat('a', [wording('w-a', 'a', 'testo', 'it')]);
    const v = version('v', ['a']);
    expect(currentLanguage(passagesOf(full([b], [v]), v))).toBe('it');
    expect(currentLanguage([])).toBe('en');
  });
});

describe('the map of the pool', () => {
  const beats = ['a', 'b', 'c', 'd'].map((id) => beat(id));

  it('merges tellings into one order, with unused beats last', () => {
    const data = full(beats, [version('one', ['a', 'c']), version('two', ['a', 'b', 'c'])]);
    expect(poolOrder(data)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('shows what a telling includes, omits and reorders', () => {
    const one = version('one', ['a', 'b', 'c']);
    const two = version('two', ['c', 'a']);
    const entries = beatMap(full(beats, [one, two]), two);
    expect(entries.map((entry) => [entry.beat.id, entry.places, entry.moved])).toEqual([
      ['a', [2], false],
      ['b', [], false],
      ['c', [1], true],
      ['d', [], false],
    ]);
  });

  it('lists every place of a beat told twice', () => {
    const v = version('v', ['a', 'b', 'a']);
    expect(beatMap(full(beats, [v]), v)[0]!.places).toEqual([1, 3]);
  });
});

describe('aligning two tellings', () => {
  const beats = ['a', 'b', 'c', 'd'].map((id) => beat(id));

  function aligned(left: string[], right: string[]) {
    const l = version('l', left);
    const r = version('r', right);
    const data = full(beats, [l, r]);
    return alignPassages(passagesOf(data, l), passagesOf(data, r));
  }
  const ids = (rows: ReturnType<typeof aligned>) =>
    rows.map((row) => [row.left?.row.beatId ?? null, row.right?.row.beatId ?? null]);

  it('lines up shared beats and leaves gaps for the rest', () => {
    expect(ids(aligned(['a', 'b', 'c'], ['a', 'd', 'c']))).toEqual([
      ['a', 'a'],
      ['b', null],
      [null, 'd'],
      ['c', 'c'],
    ]);
  });

  it('marks a beat told at another point as moved', () => {
    const rows = aligned(['a', 'b'], ['b', 'a']);
    expect(rows.filter((row) => row.left && row.right)).toHaveLength(1);
    expect(rows.filter((row) => row.moved)).toHaveLength(2);
  });

  it('notices when a shared beat uses different words', () => {
    const shared = beat('a', [wording('x', 'a'), wording('y', 'a')]);
    const l = version('l', ['a']);
    const r = version('r', ['a']);
    l.beats[0]!.wordingId = 'x';
    r.beats[0]!.wordingId = 'y';
    const data = full([shared], [l, r]);
    expect(alignPassages(passagesOf(data, l), passagesOf(data, r))[0]!.differs).toBe(true);
  });
});

describe('placing rows', () => {
  const rows = ['a', 'b', 'c'].map((id, index) => ({ ...row('v', id, index), id }));
  const order = (list: VersionBeat[]) => list.map((item) => item.id).join('');

  it('places at the end, the start, and after a row', () => {
    const extra = { ...row('v', 'x', 9), id: 'x' };
    expect(order(placed(rows, extra, undefined))).toBe('abcx');
    expect(order(placed(rows, extra, null))).toBe('xabc');
    expect(order(placed(rows, extra, 'a'))).toBe('axbc');
  });

  it('moves an existing row without duplicating it', () => {
    expect(order(placed(rows, rows[0]!, 'c'))).toBe('bca');
  });

  it('works out the anchor for a one-place move', () => {
    expect(afterIdForMove(rows, 'b', -1)).toBeNull();
    expect(afterIdForMove(rows, 'c', -1)).toBe('a');
    expect(afterIdForMove(rows, 'a', 1)).toBe('b');
    expect(afterIdForMove(rows, 'a', -1)).toBeUndefined();
    expect(afterIdForMove(rows, 'c', 1)).toBeUndefined();
  });
});
