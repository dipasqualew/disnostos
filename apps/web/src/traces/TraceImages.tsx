import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { errorMessage, isAbort, type TraceImage, type TracesApi } from './api';
import { ConfirmDialog } from './ui';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/** A quick check for clear errors. The server inspects the bytes and has the final say. */
export function imageFileProblem(file: Pick<File, 'name' | 'type' | 'size'>): string | null {
  if (file.type && !IMAGE_TYPES.includes(file.type)) {
    return `${file.name} is not a supported image. Use JPEG, PNG, WebP, or GIF.`;
  }
  if (file.size > MAX_IMAGE_BYTES) return `${file.name} is larger than 10 MB.`;
  return null;
}

type AuthedImageProps = { api: TracesApi; traceId: string; imageId: string; alt: string };

export function AuthedImage({ api, traceId, imageId, alt }: AuthedImageProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | null = null;
    setFailed(false);
    api.imageBlob(traceId, imageId, controller.signal).then(
      (blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      },
      (caught) => {
        if (!isAbort(caught)) setFailed(true);
      },
    );
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setUrl(null);
    };
  }, [api, imageId, traceId, attempt]);

  if (failed) {
    return (
      <div className="image-placeholder" role="alert">
        <span>Could not load {alt || 'this image'}.</span>
        <button type="button" className="text-button" onClick={() => setAttempt((n) => n + 1)}>
          Try again
        </button>
      </div>
    );
  }
  if (!url) return <div className="image-placeholder is-loading" role="status" aria-label="Loading image" />;
  return <img src={url} alt={alt} />;
}

type Props = {
  api: TracesApi;
  traceId: string;
  images: TraceImage[];
  onChange(images: TraceImage[]): void;
};

/** Images attached before media lived in the writing. They stay visible and removable. */
export function LooseImages({ api, traceId, images, onChange }: Props) {
  const [removing, setRemoving] = useState<TraceImage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmRemove() {
    if (!removing) return;
    setBusy(true);
    setError(null);
    try {
      await api.removeImage(traceId, removing.id);
      onChange(images.filter((image) => image.id !== removing.id));
      setRemoving(null);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  if (images.length === 0) return null;
  return (
    <ul className="loose-images" aria-label="Attached images">
      {images.map((image) => (
        <li key={image.id}>
          <figure className="embed">
            <AuthedImage api={api} traceId={traceId} imageId={image.id} alt={image.title} />
            <button
              type="button"
              className="icon-button embed-remove"
              aria-label={`Remove image ${image.title}`}
              onClick={() => {
                setError(null);
                setRemoving(image);
              }}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </figure>
        </li>
      ))}
      {removing && (
        <ConfirmDialog
          title="Remove this image?"
          body={`${removing.title} will be permanently deleted.`}
          confirmLabel="Remove image"
          busy={busy}
          error={error}
          onCancel={() => setRemoving(null)}
          onConfirm={() => void confirmRemove()}
        />
      )}
    </ul>
  );
}
