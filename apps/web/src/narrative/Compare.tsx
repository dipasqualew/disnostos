import type { FullVersion, MythFull } from './api';
import { alignPassages, passagesOf, type AlignedRow, type Passage } from './model';
import { Prose } from './Reader';

function Cell({ passage, title, other, moved }: { passage: Passage | null; title: string; other: string; moved: boolean }) {
  if (!passage) {
    return (
      <td className="compare-cell is-absent" data-telling={title}>
        <span className="muted small">{moved ? `Told at another point in ${title}` : `Not in ${title}`}</span>
      </td>
    );
  }
  return (
    <td className="compare-cell" data-telling={title}>
      {passage.wording ? (
        <Prose text={passage.wording.text} language={passage.wording.language} />
      ) : (
        <span className="muted small">No wording yet, unlike {other}</span>
      )}
    </td>
  );
}

const rowLabel = (row: AlignedRow) => (row.left ?? row.right)!.beat?.label ?? 'Missing beat';

function relation(row: AlignedRow): string {
  if (row.moved) return 'Told at another point';
  if (!row.left || !row.right) return 'Only in one';
  return row.differs ? 'Different words' : 'Same words';
}

/** Two tellings side by side, a row per beat, so agreement and divergence line up. */
export function Compare({ full, left, right }: { full: MythFull; left: FullVersion; right: FullVersion }) {
  const rows = alignPassages(passagesOf(full, left), passagesOf(full, right));
  const shared = rows.filter((row) => row.left && row.right).length;

  return (
    <div className="compare">
      <p className="small muted compare-summary" role="status">
        {shared} shared {shared === 1 ? 'beat' : 'beats'}, {rows.length - shared} told differently or only once
      </p>
      <table>
        <caption className="sr-only">Comparing {left.title} and {right.title} by beat</caption>
        <thead>
          <tr>
            <th scope="col">Beat</th>
            <th scope="col">{left.title}</th>
            <th scope="col">{right.title}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const kind = row.moved ? 'is-moved' : !row.left || !row.right ? 'is-solo' : row.differs ? 'is-different' : 'is-same';
            return (
              <tr key={`${row.left?.row.id ?? ''}:${row.right?.row.id ?? ''}`} className={kind}>
                <th scope="row">
                  <span className="compare-label">{rowLabel(row)}</span>
                  <span className="compare-kind">{relation(row)}</span>
                </th>
                <Cell passage={row.left} title={left.title} other={right.title} moved={row.moved} />
                <Cell passage={row.right} title={right.title} other={left.title} moved={row.moved} />
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
