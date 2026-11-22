import { expect, type Page } from "@playwright/test";
import { transferImage, type ImageFile } from "./imageTransfer";
import type { TraceFields } from "./TraceListPage";

/** The trace page is also its editor: changes save themselves. */
export class TraceViewPage {
  constructor(private readonly page: Page) {}

  private title = () => this.page.getByRole("textbox", { name: "Title", exact: true });
  private date = () => this.page.getByRole("textbox", { name: "Date", exact: true });
  private body = () => this.page.getByRole("textbox", { name: "Your writing", exact: true });
  private image = (image: ImageFile) => this.page.getByRole("img", { name: image.name, exact: true });

  async expectTrace(trace: TraceFields) {
    await expect(this.title()).toHaveValue(trace.title);
    await expect(this.date()).toHaveValue(trace.date);
    await expect(this.body()).toHaveText(trace.body);
  }

  async edit(fields: TraceFields) {
    await this.title().fill(fields.title);
    await this.date().fill(fields.date);
    await this.body().fill(fields.body);
    await this.expectSaved();
  }

  async expectSaved() {
    await expect(this.page.getByRole("status", { name: "Saved", exact: true })).toBeVisible();
  }

  async backToList() {
    await this.page.getByRole("link", { name: "Back to traces", exact: true }).click();
  }

  async attachImage(image: ImageFile) {
    await this.page.getByRole("button", { name: "Add image", exact: true }).setInputFiles(image);
  }

  async dropImage(image: ImageFile) {
    await transferImage(this.body(), "drop", image);
  }

  async reload() {
    await this.page.reload();
  }

  /** A decoded width proves the bytes came back and rendered. */
  async expectImage(image: ImageFile) {
    await expect(this.image(image)).toHaveJSProperty("naturalWidth", image.width);
  }

  async removeImage(image: ImageFile) {
    await this.page.getByRole("button", { name: `Remove image ${image.name}`, exact: true }).click();
    await expect(this.image(image)).toBeHidden();
    await this.expectSaved();
  }

  async linkTo(title: string, note: string) {
    await this.page.getByRole("button", { name: "Link a trace", exact: true }).click();
    await this.page.getByRole("searchbox", { name: "Search your traces", exact: true }).fill(title);
    await this.page.getByRole("textbox", { name: "Why these connect (optional)", exact: true }).fill(note);
    await this.page
      .getByRole("list", { name: "Traces to link", exact: true })
      .getByRole("button", { name: title })
      .click();
  }

  async expectLinkedTo(title: string) {
    await expect(this.page.getByRole("link", { name: title, exact: true })).toBeVisible();
  }

  async openLinked(title: string) {
    await this.page.getByRole("link", { name: title, exact: true }).click();
  }

  async unlink(title: string) {
    await this.page.getByRole("button", { name: `Unlink ${title}`, exact: true }).click();
    await expect(this.page.getByRole("link", { name: title, exact: true })).toBeHidden();
  }

  async deleteTrace() {
    await this.page.getByRole("button", { name: "Delete", exact: true }).click();
  }
}
