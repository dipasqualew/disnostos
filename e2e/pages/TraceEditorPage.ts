import { expect, type Page } from "@playwright/test";

export type TraceFields = { title: string; date: string; body: string };

export class TraceEditorPage {
  constructor(private readonly page: Page) {}

  private title = () => this.page.getByRole("textbox", { name: "Title (optional)", exact: true });
  private date = () => this.page.getByRole("textbox", { name: "Date", exact: true });
  private body = () => this.page.getByRole("textbox", { name: "Your writing", exact: true });

  async expectValues(fields: TraceFields) {
    await expect(this.title()).toHaveValue(fields.title);
    await expect(this.date()).toHaveValue(fields.date);
    await expect(this.body()).toHaveValue(fields.body);
  }

  async save(fields: TraceFields) {
    await this.title().fill(fields.title);
    await this.date().fill(fields.date);
    await this.body().fill(fields.body);
    await this.page.getByRole("button", { name: "Save", exact: true }).click();
  }
}
