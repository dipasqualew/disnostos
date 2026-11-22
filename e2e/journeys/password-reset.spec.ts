import { latestResetCode } from "../support/accounts";
import { test } from "../support/fixtures";

test("a user resets a forgotten password and signs in with it", async ({ app, account }) => {
  const newPassword = `${account.password}-renewed`;

  await test.step("request a reset link", async () => {
    await app.signIn.open();
    await app.signIn.forgotPassword();
    await app.forgotPassword.requestReset(account.email);
  });

  await test.step("set a new password from the link", async () => {
    await app.resetPassword.open(await latestResetCode(account.email));
    await app.resetPassword.setPassword(newPassword);
    await app.resetPassword.continueToSignIn();
  });

  await test.step("sign in with the new password", async () => {
    await app.signIn.expectVisible();
    await app.signIn.signIn(account.email, newPassword);
    await app.list.expectVisible();
  });

  await test.step("sign out", async () => {
    await app.list.signOut();
    await app.signIn.expectVisible();
  });
});
