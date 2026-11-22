import { expect, type Page } from "@playwright/test";
import { transferImage, type ImageFile } from "./imageTransfer";

export type TraceFields = { title: string; date: string; body: string };

export class TraceListPage {
  constructor(private readonly page: Page) {}

  private entry = (title: string) => this.page.getByRole("article", { name: title, exact: true });
  private composer = () => this.page.getByRole("region", { name: "Write a trace", exact: true });

  async expectVisible() {
    await expect(this.page.getByRole("heading", { name: "Traces", exact: true })).toBeAttached();
  }

  async expectEmpty() {
    await expect(this.page.getByRole("heading", { name: "Nothing here yet", exact: true })).toBeVisible();
  }

  /** Posts from the keyboard, the way a quick trace is meant to be written. */
  async post(fields: TraceFields) {
    const composer = this.composer();
    await composer.getByRole("button", { name: "Add title", exact: true }).click();
    await composer.getByRole("textbox", { name: "Title", exact: true }).fill(fields.title);
    await composer.getByRole("textbox", { name: "Date", exact: true }).fill(fields.date);
    const writing = composer.getByRole("textbox", { name: "Your writing", exact: true });
    await writing.fill(fields.body);
    await writing.press("ControlOrMeta+Enter");
    await expect(writing).toHaveText("");
  }

  /** Pastes an image under the writing, then posts it. */
  async postWithPastedImage(fields: TraceFields, image: ImageFile) {
    const composer = this.composer();
    await composer.getByRole("button", { name: "Add title", exact: true }).click();
    await composer.getByRole("textbox", { name: "Title", exact: true }).fill(fields.title);
    await composer.getByRole("textbox", { name: "Date", exact: true }).fill(fields.date);
    const writing = composer.getByRole("textbox", { name: "Your writing", exact: true });
    await writing.fill(fields.body);
    await transferImage(writing, "paste", image);
    await expect(writing.getByRole("img", { name: image.name, exact: true })).toBeVisible();
    await writing.press("ControlOrMeta+Enter");
    await expect(writing).toHaveText("");
  }

  /** A decoded width proves the stored bytes came back and rendered in the feed. */
  async expectEntryImage(title: string, image: ImageFile) {
    await expect(this.entry(title).getByRole("img", { name: image.name, exact: true })).toHaveJSProperty(
      "naturalWidth",
      image.width,
    );
  }

  async expectEntry(entry: { title: string; body: string }) {
    await expect(this.entry(entry.title)).toContainText(entry.body);
  }

  async expectNoEntry(title: string) {
    await expect(this.entry(title)).toBeHidden();
  }

  async open(title: string) {
    await this.page.getByRole("link", { name: `Edit ${title}`, exact: true }).click();
  }

  async undoDelete() {
    await this.page.getByRole("button", { name: "Undo", exact: true }).click();
  }

  async signOut() {
    await this.page.getByRole("button", { name: "Sign out", exact: true }).click();
  }
}
