import type { Page } from "@playwright/test";
import { ForgotPasswordPage, ResetPasswordPage, SignInPage } from "./AuthPages";
import { TraceListPage } from "./TraceListPage";
import { TraceViewPage } from "./TraceViewPage";

/** Every page of the app, for use in journeys. */
export class App {
  readonly signIn: SignInPage;
  readonly forgotPassword: ForgotPasswordPage;
  readonly resetPassword: ResetPasswordPage;
  readonly list: TraceListPage;
  readonly trace: TraceViewPage;

  constructor(page: Page) {
    this.signIn = new SignInPage(page);
    this.forgotPassword = new ForgotPasswordPage(page);
    this.resetPassword = new ResetPasswordPage(page);
    this.list = new TraceListPage(page);
    this.trace = new TraceViewPage(page);
  }
}
