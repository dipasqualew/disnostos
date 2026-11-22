import type { Locator } from "@playwright/test";

// This project does not load the DOM types, which would clash with the API's Bun types.
type BrowserGlobals = {
  DataTransfer: new () => { items: { add(file: File): void } };
  DragEvent: new (
    type: string,
    init: { bubbles: boolean; cancelable: boolean; clientX: number; clientY: number },
  ) => Event;
};

export type ImageFile = { name: string; mimeType: string; buffer: Buffer; width: number };

/**
 * Delivers an image the way the browser hands one to the page. Playwright cannot put a file
 * on the OS clipboard or drag one from the desktop, in both Chromium and Firefox.
 */
export async function transferImage(target: Locator, kind: "paste" | "drop", image: ImageFile) {
  await target.evaluate(
    (element, { kind, name, mimeType, base64 }) => {
      const { DataTransfer, DragEvent } = globalThis as unknown as BrowserGlobals;
      const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      const transfer = new DataTransfer();
      transfer.items.add(new File([bytes], name, { type: mimeType }));
      const box = element.getBoundingClientRect();
      const event =
        kind === "paste"
          ? new Event("paste", { bubbles: true, cancelable: true })
          : new DragEvent("drop", {
              bubbles: true,
              cancelable: true,
              clientX: box.left + box.width / 2,
              clientY: box.top + box.height / 2,
            });
      // Firefox ignores these when passed to the event constructors.
      Object.defineProperty(event, kind === "paste" ? "clipboardData" : "dataTransfer", { value: transfer });
      element.dispatchEvent(event);
    },
    { kind, name: image.name, mimeType: image.mimeType, base64: image.buffer.toString("base64") },
  );
}
