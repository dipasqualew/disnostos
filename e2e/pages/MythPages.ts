import { expect, type Page } from "@playwright/test";

export class MythLibraryPage {
  constructor(private readonly page: Page) {}

  async open() {
    await this.page.getByRole("link", { name: "Myths", exact: true }).click();
    await expect(this.page.getByRole("heading", { name: "Myths", exact: true })).toBeVisible();
  }

  /** One field and Enter: the myth and its first variation exist, ready to write. */
  async createMyth(title: string) {
    const field = this.page.getByRole("textbox", { name: "New myth title", exact: true });
    await field.fill(title);
    await field.press("Enter");
  }

  async openMyth(title: string) {
    await this.page.getByRole("link", { name: title }).click();
  }
}

export class MythPage {
  constructor(private readonly page: Page) {}

  private passage = (place: number, label: string) =>
    this.page.getByRole("group", { name: `Passage ${place}: ${label}`, exact: true });
  private beatTag = (place: number, label: string) =>
    this.page.getByRole("button", { name: `Beat ${place}: ${label}`, exact: true });
  private panel = () => this.page.getByRole("complementary", { name: "Beat details", exact: true });
  private writing = () => this.page.getByRole("textbox", { name: "Next passage", exact: true });
  private variation = (title: string) =>
    this.page
      .getByRole("navigation", { name: "Variations", exact: true })
      .getByRole("link", { name: title, exact: true });

  async expectMyth(title: string) {
    await expect(this.page.getByRole("textbox", { name: "Myth title", exact: true })).toHaveValue(title);
  }

  /** Writes from the keyboard: type, Enter, and the box is ready for the next passage. */
  async write(text: string) {
    const writing = this.writing();
    await writing.fill(text);
    await writing.press("Enter");
    await expect(writing).toHaveValue("");
  }

  async expectPassage(place: number, label: string, text: string) {
    await expect(this.passage(place, label)).toContainText(text);
  }

  async expectNoPassage(place: number, label: string) {
    await expect(this.passage(place, label)).toBeHidden();
  }

  async createVariation(title: string) {
    await this.page.getByRole("button", { name: "New variation", exact: true }).click();
    const field = this.page.getByRole("textbox", { name: "New variation title", exact: true });
    await field.fill(title);
    await field.press("Enter");
    await expect(this.variation(title)).toHaveAttribute("aria-current", "page");
  }

  async switchTo(title: string) {
    await this.variation(title).click();
    await expect(this.variation(title)).toHaveAttribute("aria-current", "page");
  }

  async reuseFromPool(label: string) {
    await this.page.getByRole("button", { name: /^From the pool/ }).click();
    await this.page.getByRole("button", { name: `Add “${label}” to this variation`, exact: true }).click();
  }

  async moveEarlier(place: number, label: string) {
    await this.beatTag(place, label).press("Alt+ArrowUp");
  }

  async createTradition(name: string) {
    await this.page.getByRole("button", { name: "Add to a tradition", exact: true }).click();
    const field = this.page.getByRole("textbox", { name: "Find or name a tradition", exact: true });
    await field.fill(name);
    await field.press("Enter");
    await expect(this.page.getByRole("link", { name, exact: true })).toBeVisible();
  }

  async createMythology(tradition: string, name: string) {
    await this.page.getByRole("button", { name: `Add ${tradition} to a mythology`, exact: true }).click();
    const field = this.page.getByRole("textbox", { name: "Find or name a mythology", exact: true });
    await field.fill(name);
    await field.press("Enter");
    await expect(this.page.getByRole("link", { name, exact: true })).toBeVisible();
  }

  async openTradition(name: string) {
    await this.page.getByRole("link", { name, exact: true }).click();
  }

  async openBeat(place: number, label: string) {
    await this.beatTag(place, label).click();
    await expect(this.panel()).toBeVisible();
  }

  async closeBeat() {
    await this.panel().getByRole("button", { name: "Close beat details", exact: true }).click();
    await expect(this.panel()).toBeHidden();
  }

  async expectAlsoToldIn(title: string) {
    await expect(this.panel().getByRole("link", { name: title, exact: true })).toBeVisible();
  }

  /** Adds another wording, which the telling then uses. */
  async addWording(text: string, language: string) {
    const panel = this.panel();
    await panel.getByRole("button", { name: "Add a wording", exact: true }).click();
    await panel.getByRole("textbox", { name: "Wording language", exact: true }).fill(language);
    const field = panel.getByRole("textbox", { name: "New wording", exact: true });
    await field.fill(text);
    await field.press("Enter");
    await expect(panel.getByRole("radio", { name: `${language}: ${text}`, exact: true })).toBeChecked();
  }

  /** Trying to delete a beat in use explains why, and removes it from this telling instead. */
  async deleteBeatInUse() {
    await this.panel().getByRole("button", { name: "Delete beat", exact: true }).click();
    await this.page
      .getByRole("alertdialog", { name: "This beat is still in use", exact: true })
      .getByRole("button", { name: "Remove from this variation", exact: true })
      .click();
  }

  async undo() {
    await this.page.getByRole("button", { name: "Undo", exact: true }).click();
  }

  async compareWith(title: string) {
    await this.page.getByRole("combobox", { name: "Compare with", exact: true }).selectOption({ label: title });
  }

  async expectCompared(label: string, relation: string) {
    await expect(this.page.getByRole("rowheader", { name: `${label} ${relation}`, exact: true })).toBeVisible();
  }

  async expectAbsentFrom(title: string) {
    await expect(this.page.getByRole("cell", { name: `Not in ${title}`, exact: true })).toBeVisible();
  }

  async backToReading() {
    await this.page.getByRole("button", { name: "Back to reading", exact: true }).click();
  }

  async reload() {
    await this.page.reload();
  }
}

export class CollectionPage {
  constructor(private readonly page: Page) {}

  async expectTradition(name: string, member: string, mythology: string) {
    await expect(this.page.getByRole("textbox", { name: "Tradition name", exact: true })).toHaveValue(name);
    await expect(this.page.getByRole("link", { name: member, exact: true })).toBeVisible();
    await expect(this.page.getByRole("link", { name: mythology, exact: true })).toBeVisible();
  }

  async openMember(name: string) {
    await this.page.getByRole("link", { name, exact: true }).click();
  }
}
