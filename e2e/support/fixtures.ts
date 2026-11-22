import { test as base } from "@playwright/test";
import { App } from "../pages/App";
import { seedAccount, type Account } from "./accounts";

export const test = base.extend<{ app: App; account: Account }>({
  app: async ({ page }, use) => {
    await use(new App(page));
  },
  account: async ({}, use) => {
    await use(await seedAccount());
  },
});

/** A 1x1 PNG, so a rendered image can be proven by its decoded width. */
export const IMAGE = {
  name: "harbour.png",
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  ),
  width: 1,
};
