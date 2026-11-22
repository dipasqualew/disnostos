import type { Page } from "@playwright/test";
import { ForgotPasswordPage, ResetPasswordPage, SignInPage } from "./AuthPages";
import { CollectionPage, MythLibraryPage, MythPage } from "./MythPages";
import { TraceListPage } from "./TraceListPage";
import { TraceViewPage } from "./TraceViewPage";

/** Every page of the app, for use in journeys. */
export class App {
  readonly signIn: SignInPage;
  readonly forgotPassword: ForgotPasswordPage;
  readonly resetPassword: ResetPasswordPage;
  readonly list: TraceListPage;
  readonly trace: TraceViewPage;
  readonly myths: MythLibraryPage;
  readonly myth: MythPage;
  readonly collection: CollectionPage;

  constructor(page: Page) {
    this.signIn = new SignInPage(page);
    this.forgotPassword = new ForgotPasswordPage(page);
    this.resetPassword = new ResetPasswordPage(page);
    this.list = new TraceListPage(page);
    this.trace = new TraceViewPage(page);
    this.myths = new MythLibraryPage(page);
    this.myth = new MythPage(page);
    this.collection = new CollectionPage(page);
  }
}
