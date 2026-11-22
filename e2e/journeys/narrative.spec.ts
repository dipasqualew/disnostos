import { test } from "../support/fixtures";

const myth = "The Lost Lantern";
const first = "The Harbour Telling";
const second = "The Mountain Telling";
const tradition = "Coastal";
const mythology = "Invented Lands";

const lit = { label: "A keeper lights the lantern", text: "A keeper lights the lantern." };
const storm = { label: "A storm takes the light", text: "A storm takes the light." };
const home = { label: "The boats come home", text: "The boats come home." };
const climb = { label: "She climbs to find it", text: "She climbs to find it." };
const retold = "Una custode accende la lanterna.";

test("a storyteller writes a myth, retells it, and compares the tellings", async ({ app, account }) => {
  await test.step("sign in and open the myths", async () => {
    await app.signIn.open();
    await app.signIn.signIn(account.email, account.password);
    await app.list.expectEmpty();
    await app.myths.open();
  });

  await test.step("create a myth, landing ready to write", async () => {
    await app.myths.createMyth(myth);
    await app.myth.expectMyth(myth);
  });

  await test.step("write its passages from the keyboard", async () => {
    await app.myth.write(lit.text);
    await app.myth.write(storm.text);
    await app.myth.write(home.text);
    await app.myth.expectPassage(1, lit.label, lit.text);
    await app.myth.expectPassage(2, storm.label, storm.text);
    await app.myth.expectPassage(3, home.label, home.text);
  });

  await test.step("start a second variation", async () => {
    await app.myth.createVariation(second);
  });

  await test.step("retell it, reusing beats from the pool", async () => {
    await app.myth.reuseFromPool(lit.label);
    await app.myth.expectPassage(1, lit.label, lit.text);
    await app.myth.write(climb.text);
    await app.myth.expectPassage(2, climb.label, climb.text);
    await app.myth.reuseFromPool(home.label);
    await app.myth.expectPassage(3, home.label, home.text);
  });

  await test.step("reorder a beat from the keyboard", async () => {
    await app.myth.moveEarlier(3, home.label);
    await app.myth.expectPassage(2, home.label, home.text);
    await app.myth.expectPassage(3, climb.label, climb.text);
  });

  await test.step("give a shared beat a new wording in this telling only", async () => {
    await app.myth.openBeat(1, lit.label);
    await app.myth.expectAlsoToldIn("First telling");
    await app.myth.addWording(retold, "it");
    await app.myth.expectPassage(1, lit.label, retold);
    await app.myth.closeBeat();
  });

  await test.step("file it under a new tradition and mythology, inline", async () => {
    await app.myth.createTradition(tradition);
    await app.myth.createMythology(tradition, mythology);
  });

  await test.step("compare the two tellings by beat", async () => {
    await app.myth.compareWith("First telling");
    await app.myth.expectCompared(lit.label, "Different words");
    await app.myth.expectCompared(climb.label, "Only in one");
    await app.myth.expectAbsentFrom("First telling");
    await app.myth.backToReading();
  });

  await test.step("a beat in use is removed from the telling, and comes back with undo", async () => {
    await app.myth.openBeat(3, climb.label);
    await app.myth.deleteBeatInUse();
    await app.myth.expectNoPassage(3, climb.label);
    await app.myth.undo();
    await app.myth.expectPassage(3, climb.label, climb.text);
  });

  await test.step("a deep link reopens this exact telling", async () => {
    await app.myth.reload();
    await app.myth.expectPassage(1, lit.label, retold);
  });

  await test.step("the first telling is untouched", async () => {
    await app.myth.switchTo("First telling");
    await app.myth.expectPassage(1, lit.label, lit.text);
    await app.myth.expectPassage(3, home.label, home.text);
  });

  await test.step("browse from the tradition back to the telling", async () => {
    await app.myth.switchTo(second);
    await app.myth.openTradition(tradition);
    await app.collection.expectTradition(tradition, second, mythology);
    await app.collection.openMember(second);
    await app.myth.expectPassage(1, lit.label, retold);
  });
});
