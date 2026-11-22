import type { ReactNode } from 'react';
import type { TracesApi } from './api';
import { imageIdFrom, isSafeLink, parseBody, type DocMark, type DocNode } from './markdown';
import { AuthedImage } from './TraceImages';

type Context = { api: TracesApi; traceId: string };

function withMark(mark: DocMark, children: ReactNode): ReactNode {
  switch (mark.type) {
    case 'bold':
      return <strong>{children}</strong>;
    case 'italic':
      return <em>{children}</em>;
    case 'strike':
      return <s>{children}</s>;
    case 'code':
      return <code>{children}</code>;
    case 'link': {
      const href = mark.attrs?.href;
      if (!isSafeLink(href)) return children;
      return (
        <a href={String(href)} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      );
    }
    default:
      return children;
  }
}

const children = (node: DocNode, context: Context) =>
  node.content?.map((child, index) => <Block key={index} node={child} context={context} />);

/** Builds React elements from the parsed body, so stored text can never become markup. */
function Block({ node, context }: { node: DocNode; context: Context }): ReactNode {
  switch (node.type) {
    case 'text':
      return (node.marks ?? []).reduceRight<ReactNode>((inner, mark) => withMark(mark, inner), node.text);
    case 'hardBreak':
      return <br />;
    case 'paragraph':
      return <p>{children(node, context)}</p>;
    case 'heading': {
      const level = Number(node.attrs?.level ?? 1);
      if (level === 1) return <h2 className="content-h1">{children(node, context)}</h2>;
      if (level === 2) return <h3 className="content-h2">{children(node, context)}</h3>;
      return <h4 className="content-h3">{children(node, context)}</h4>;
    }
    case 'bulletList':
      return <ul>{children(node, context)}</ul>;
    case 'orderedList':
      return <ol start={Number(node.attrs?.start ?? 1)}>{children(node, context)}</ol>;
    case 'listItem':
      return <li>{children(node, context)}</li>;
    case 'blockquote':
      return <blockquote>{children(node, context)}</blockquote>;
    case 'horizontalRule':
      return <hr />;
    case 'codeBlock':
      return (
        <pre>
          <code>{node.content?.map((child) => child.text).join('')}</code>
        </pre>
      );
    case 'image': {
      const id = imageIdFrom(node.attrs?.src);
      if (!id) return null;
      return (
        <figure className="embed">
          <AuthedImage api={context.api} traceId={context.traceId} imageId={id} alt={String(node.attrs?.alt ?? '')} />
        </figure>
      );
    }
    default:
      return null;
  }
}

export function TraceContent({ api, traceId, body }: Context & { body: string }) {
  const doc = parseBody(body);
  return <div className="content">{children(doc, { api, traceId })}</div>;
}

/** Whether a body is long enough to collapse in the feed. */
export function isLongBody(body: string): boolean {
  const images = (body.match(/!\[[^\]]*\]\(trace-image:/g) ?? []).length;
  return body.length > 700 || body.split('\n').length > 14 || images > 1;
}
