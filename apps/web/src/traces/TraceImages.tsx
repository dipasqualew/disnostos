import { useEffect, useRef, useState, type ChangeEvent } from 'react';
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

function AuthedImage({ api, image }: { api: TracesApi; image: TraceImage }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | null = null;
    setFailed(false);
    api.imageBlob(image.traceId, image.id, controller.signal).then(
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
  }, [api, image.id, image.traceId, attempt]);

  if (failed) {
    return (
      <div className="image-placeholder" role="alert">
        <span>Could not load {image.title}.</span>
        <button type="button" className="link" onClick={() => setAttempt((n) => n + 1)}>
          Try again
        </button>
      </div>
    );
  }
  if (!url) return <div className="image-placeholder" role="status">Loading image…</div>;
  return <img src={url} alt={image.title} />;
}

type Props = {
  api: TracesApi;
  traceId: string;
  images: TraceImage[];
  focusPicker: boolean;
  onChange(images: TraceImage[]): void;
};

export function TraceImages({ api, traceId, images, focusPicker, onChange }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [removing, setRemoving] = useState<TraceImage | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  useEffect(() => {
    if (focusPicker) input.current?.focus();
  }, [focusPicker]);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    event.target.value = '';
    if (!files.length) return;
    const problems: string[] = [];
    let current = images;
    for (const [index, file] of files.entries()) {
      const problem = imageFileProblem(file);
      if (problem) {
        problems.push(problem);
        continue;
      }
      setUploading(files.length > 1 ? `Uploading ${index + 1} of ${files.length}…` : `Uploading ${file.name}…`);
      try {
        const image = await api.addImage(traceId, file);
        current = [...current, image];
        onChange(current);
      } catch (caught) {
        problems.push(`${file.name}: ${errorMessage(caught)}`);
      }
    }
    setUploading(null);
    setErrors(problems);
  }

  async function confirmRemove() {
    if (!removing) return;
    setRemoveBusy(true);
    setRemoveError(null);
    try {
      await api.removeImage(traceId, removing.id);
      onChange(images.filter((image) => image.id !== removing.id));
      setRemoving(null);
    } catch (caught) {
      setRemoveError(errorMessage(caught));
    } finally {
      setRemoveBusy(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="images-heading">
      <div className="panel-head">
        <h2 id="images-heading">Images</h2>
        <label className={`button quiet file-button ${uploading ? 'is-busy' : ''}`}>
          <input
            ref={input}
            className="sr-only"
            type="file"
            accept={IMAGE_TYPES.join(',')}
            multiple
            disabled={uploading !== null}
            onChange={(event) => void upload(event)}
          />
          Add image
        </label>
      </div>
      {uploading && <p className="muted" role="status">{uploading}</p>}
      {errors.map((message) => (
        <p key={message} className="error" role="alert">{message}</p>
      ))}
      {images.length === 0 && !uploading && <p className="muted">No images on this trace.</p>}
      {images.length > 0 && (
        <ul className="gallery">
          {images.map((image) => (
            <li key={image.id}>
              <figure>
                <AuthedImage api={api} image={image} />
                <figcaption>
                  <span>{image.title}</span>
                  <button
                    type="button"
                    className="link"
                    aria-label={`Remove image ${image.title}`}
                    onClick={() => {
                      setRemoveError(null);
                      setRemoving(image);
                    }}
                  >
                    Remove
                  </button>
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      )}
      {removing && (
        <ConfirmDialog
          title="Remove this image?"
          body={`${removing.title} will be permanently deleted.`}
          confirmLabel="Remove image"
          busy={removeBusy}
          error={removeError}
          onCancel={() => setRemoving(null)}
          onConfirm={() => void confirmRemove()}
        />
      )}
    </section>
  );
}
