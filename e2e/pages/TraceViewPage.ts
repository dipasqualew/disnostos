import { expect, type Page } from "@playwright/test";

type ImageFile = { name: string; mimeType: string; buffer: Buffer; width: number };

export class TraceViewPage {
  constructor(private readonly page: Page) {}

  private confirm = async (dialog: string, action: string) => {
    await this.page
      .getByRole("alertdialog", { name: dialog, exact: true })
      .getByRole("button", { name: action, exact: true })
      .click();
  };

  /** The list and editor assert the date and body, which have no role of their own here. */
  async expectTrace(trace: { title: string }) {
    await expect(this.page.getByRole("heading", { name: trace.title, exact: true })).toBeVisible();
  }

  async edit() {
    await this.page.getByRole("link", { name: "Edit", exact: true }).click();
  }

  async backToList() {
    await this.page.getByRole("link", { name: "← All traces", exact: true }).click();
  }

  async attachImage(image: ImageFile) {
    await this.page.getByRole("button", { name: "Add image", exact: true }).setInputFiles(image);
  }

  /** A decoded width proves the bytes came back and rendered. */
  async expectImage(image: ImageFile) {
    await expect(this.page.getByRole("img", { name: image.name, exact: true })).toHaveJSProperty(
      "naturalWidth",
      image.width,
    );
  }

  async removeImage(image: ImageFile) {
    await this.page.getByRole("button", { name: `Remove image ${image.name}`, exact: true }).click();
    await this.confirm("Remove this image?", "Remove image");
    await expect(this.page.getByRole("img", { name: image.name, exact: true })).toBeHidden();
  }

  async linkTo(title: string, note: string) {
    await this.page.getByRole("button", { name: "Link a trace", exact: true }).click();
    await this.page.getByRole("searchbox", { name: "Search your traces", exact: true }).fill(title);
    await this.page.getByRole("radio", { name: title }).check();
    await this.page.getByRole("textbox", { name: "Why these connect (optional)", exact: true }).fill(note);
    await this.page.getByRole("button", { name: "Link trace", exact: true }).click();
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
    await this.confirm("Delete this trace?", "Delete trace");
  }
}
