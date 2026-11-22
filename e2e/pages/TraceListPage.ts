import { expect, type Page } from "@playwright/test";

export class TraceListPage {
  constructor(private readonly page: Page) {}

  private entry = (title: string) => this.page.getByRole("link", { name: title });

  async expectVisible() {
    await expect(this.page.getByRole("heading", { name: "Traces", exact: true })).toBeVisible();
  }

  async expectEmpty() {
    await expect(this.page.getByRole("link", { name: "Write today’s trace", exact: true })).toBeVisible();
  }

  async writeTrace() {
    await this.page.getByRole("link", { name: "Write a trace", exact: true }).click();
  }

  /** The entry's accessible name carries its date, title, and excerpt. */
  async expectEntry(entry: { title: string; displayDate: string; body: string }) {
    await expect(this.entry(entry.title)).toHaveAccessibleName(
      `${entry.displayDate}: ${entry.title} ${entry.body}`,
    );
  }

  async expectNoEntry(title: string) {
    await expect(this.entry(title)).toBeHidden();
  }

  async open(title: string) {
    await this.entry(title).click();
  }

  async signOut() {
    await this.page.getByRole("button", { name: "Sign out", exact: true }).click();
  }
}
