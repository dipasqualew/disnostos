import { expect, type Page } from "@playwright/test";

export class SignInPage {
  constructor(private readonly page: Page) {}

  private heading = () => this.page.getByRole("heading", { name: "Sign in", exact: true });

  async open() {
    await this.page.goto("/");
    await expect(this.heading()).toBeVisible();
  }

  async signIn(email: string, password: string) {
    await this.page.getByRole("textbox", { name: "Email", exact: true }).fill(email);
    await this.page.getByRole("textbox", { name: "Password", exact: true }).fill(password);
    await this.page.getByRole("button", { name: "Sign in", exact: true }).click();
  }

  async forgotPassword() {
    await this.page.getByRole("button", { name: "Forgot your password?", exact: true }).click();
  }

  async expectVisible() {
    await expect(this.heading()).toBeVisible();
  }
}

export class ForgotPasswordPage {
  constructor(private readonly page: Page) {}

  private email = () => this.page.getByRole("textbox", { name: "Email", exact: true });

  /** The form is replaced by the confirmation only once the request has finished. */
  async requestReset(email: string) {
    await expect(this.page.getByRole("heading", { name: "Reset your password", exact: true })).toBeVisible();
    await this.email().fill(email);
    await this.page.getByRole("button", { name: "Send reset link", exact: true }).click();
    await expect(this.email()).toBeHidden();
  }
}

export class ResetPasswordPage {
  constructor(private readonly page: Page) {}

  async open(code: string) {
    await this.page.goto(`/auth/action?mode=resetPassword&oobCode=${encodeURIComponent(code)}`);
    await expect(this.page.getByRole("heading", { name: "Set a new password", exact: true })).toBeVisible();
  }

  async setPassword(password: string) {
    await this.page.getByRole("textbox", { name: "New password", exact: true }).fill(password);
    await this.page.getByRole("textbox", { name: "Confirm new password", exact: true }).fill(password);
    await this.page.getByRole("button", { name: "Set password", exact: true }).click();
  }

  async continueToSignIn() {
    await this.page.getByRole("button", { name: "Continue to sign in", exact: true }).click();
  }
}
