import { IMAGE, test } from "../support/fixtures";

const first = {
  title: "The road back to Ithaca",
  date: "2026-11-22",
  displayDate: "November 22, 2026",
  body: "Today I walked the long way home.",
};
const edited = {
  ...first,
  title: "The long road to Ithaca",
  date: "2026-11-21",
  displayDate: "November 21, 2026",
  body: "Yesterday I walked the long way home, and the sea was loud.",
};
const second = {
  title: "Thebes at dusk",
  date: "2026-10-03",
  displayDate: "October 3, 2026",
  body: "A second entry, older.",
};

test("a writer keeps a journal of dated, illustrated, linked traces", async ({ app, account }) => {
  await test.step("sign in", async () => {
    await app.signIn.open();
    await app.signIn.signIn(account.email, account.password);
    await app.list.expectEmpty();
  });

  await test.step("write a dated trace", async () => {
    await app.list.writeTrace();
    await app.editor.save(first);
    await app.trace.expectTrace(first);
  });

  await test.step("find it in the list and open it", async () => {
    await app.trace.backToList();
    await app.list.expectEntry(first);
    await app.list.open(first.title);
    await app.trace.expectTrace(first);
  });

  await test.step("edit it", async () => {
    await app.trace.edit();
    await app.editor.expectValues(first);
    await app.editor.save(edited);
    await app.trace.expectTrace(edited);
  });

  await test.step("attach an image and see it render", async () => {
    await app.trace.attachImage(IMAGE);
    await app.trace.expectImage(IMAGE);
  });

  await test.step("write a second trace", async () => {
    await app.trace.backToList();
    await app.list.expectEntry(edited);
    await app.list.writeTrace();
    await app.editor.save(second);
    await app.trace.expectTrace(second);
  });

  await test.step("link the two traces", async () => {
    await app.trace.linkTo(edited.title, "Both are homecomings.");
    await app.trace.expectLinkedTo(edited.title);
  });

  await test.step("follow the link both ways", async () => {
    await app.trace.openLinked(edited.title);
    await app.trace.expectTrace(edited);
    await app.trace.expectLinkedTo(second.title);
    await app.trace.openLinked(second.title);
    await app.trace.expectTrace(second);
  });

  await test.step("unlink them", async () => {
    await app.trace.unlink(edited.title);
  });

  await test.step("delete the image", async () => {
    await app.trace.backToList();
    await app.list.expectEntry(second);
    await app.list.open(edited.title);
    await app.trace.expectImage(IMAGE);
    await app.trace.removeImage(IMAGE);
  });

  await test.step("delete both traces", async () => {
    await app.trace.deleteTrace();
    await app.list.expectNoEntry(edited.title);
    await app.list.open(second.title);
    await app.trace.deleteTrace();
    await app.list.expectEmpty();
  });

  await test.step("sign out", async () => {
    await app.list.signOut();
    await app.signIn.expectVisible();
  });
});
