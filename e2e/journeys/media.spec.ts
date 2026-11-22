import { IMAGE, test } from "../support/fixtures";

const trace = {
  title: "The harbour at dusk",
  date: "2026-11-20",
  body: "The boats came in without a sound.",
};
const pasted = { ...IMAGE, name: "pasted-harbour.png" };
const dropped = { ...IMAGE, name: "dropped-harbour.png" };

test("a writer pastes and drops images into a trace", async ({ app, account }) => {
  await test.step("sign in", async () => {
    await app.signIn.open();
    await app.signIn.signIn(account.email, account.password);
    await app.list.expectEmpty();
  });

  await test.step("paste an image into a new trace and post it", async () => {
    await app.list.postWithPastedImage(trace, pasted);
    await app.list.expectEntry(trace);
    await app.list.expectEntryImage(trace.title, pasted);
  });

  await test.step("drop a second image into the saved trace", async () => {
    await app.list.open(trace.title);
    await app.trace.expectImage(pasted);
    await app.trace.dropImage(dropped);
    await app.trace.expectImage(dropped);
    await app.trace.expectSaved();
  });

  await test.step("both images are still embedded after a reload", async () => {
    await app.trace.reload();
    await app.trace.expectImage(pasted);
    await app.trace.expectImage(dropped);
  });
});
