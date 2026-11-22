import { describe, expect, it } from 'vitest';
import {
  embeddedImageIds,
  imageSrc,
  parseBody,
  replacePendingImage,
  serializeBody,
  withoutPendingImages,
  type DocNode,
} from './markdown';

const ID = '123e4567-e89b-42d3-a456-426614174000';
const roundTrip = (body: string) => serializeBody(parseBody(body));

function collect(node: DocNode, type: string): DocNode[] {
  return [...(node.type === type ? [node] : []), ...(node.content ?? []).flatMap((child) => collect(child, type))];
}

describe('trace bodies', () => {
  it.each([
    'Sing, goddess, the anger\nof Achilles',
    'first stanza\nline two\n\nsecond stanza',
    'the sea\n    the indented sea\n        further still',
    '# A heading\n\nSome **bold** and *italic* and ~~gone~~ and `code`.',
    '- one\n- two\n  - nested\n- three',
    '1. first\n2. second',
    '> a quoted line\n> and another',
    'before\n\n---\n\nafter',
    '```\nconst a = 1;\n    indented\n```',
    '[a link](https://example.com/a_b)',
    'see https://example.com/a_b_c?x=1 for more',
    `above\n\n![harbour.png](${imageSrc(ID)})\n\nbelow`,
  ])('keeps %j through a round trip', (body) => {
    expect(roundTrip(body)).toBe(body);
  });

  it('is stable after the first normalisation', () => {
    const once = roundTrip('a   \n\n\n\nb * c _d_ [e]');
    expect(roundTrip(once)).toBe(once);
  });

  it.each(['2 * 3 * 4', 'snake_case_word', '_private', 'a [bracket] b', '1. not a list', '# not a heading', '- not a list', 'AT&amp;T'])(
    'keeps literal text %j literal once escaped',
    (text) => {
      const doc: DocNode = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
      const parsed = parseBody(serializeBody(doc));
      expect(parsed.content).toEqual(doc.content);
    },
  );

  it('keeps verse as hard breaks inside one paragraph', () => {
    const doc = parseBody('one\ntwo');
    expect(doc.content).toHaveLength(1);
    expect(collect(doc, 'hardBreak')).toHaveLength(1);
  });

  it('never produces raw HTML nodes', () => {
    const doc = parseBody('<img src=x onerror=alert(1)>');
    expect(collect(doc, 'image')).toHaveLength(0);
    expect(collect(doc, 'text')[0]?.text).toBe('<img src=x onerror=alert(1)>');
  });

  it.each(['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,x', 'vbscript:x', '/relative'])(
    'does not make a link from %s',
    (href) => {
      const marks = collect(parseBody(`[x](${href})`), 'text').flatMap((node) => node.marks ?? []);
      expect(marks.filter((mark) => mark.type === 'link')).toEqual([]);
    },
  );

  it('does not load remote images', () => {
    const doc = parseBody('![pixel](https://tracker.example/p.png)');
    expect(collect(doc, 'image')).toHaveLength(0);
    expect(collect(doc, 'text')[0]?.marks?.[0]).toEqual({ type: 'link', attrs: { href: 'https://tracker.example/p.png' } });
  });

  it('splits a line around an embedded image', () => {
    const doc = parseBody(`before ![a](${imageSrc(ID)}) after`);
    expect(doc.content?.map((node) => node.type)).toEqual(['paragraph', 'image', 'paragraph']);
  });

  it('finds embedded images', () => {
    expect(embeddedImageIds(`a\n\n![a](${imageSrc(ID)})`)).toEqual([ID]);
    expect(embeddedImageIds('![a](trace-image:not-an-id)')).toEqual([]);
  });

  it('swaps a pending image for its stored ID, or removes it', () => {
    const body = 'a\n\n![p.png](pending-image:k1)\n\n![q.png](pending-image:k2)';
    const swapped = replacePendingImage(body, 'k1', ID);
    expect(swapped).toContain(`![p.png](${imageSrc(ID)})`);
    expect(replacePendingImage(swapped, 'k2', null)).not.toContain('pending-image');
  });

  it('leaves pending images out of saved drafts', () => {
    expect(withoutPendingImages('a\n\n![p.png](pending-image:k1)\n\nb')).toBe('a\n\nb');
  });
});
