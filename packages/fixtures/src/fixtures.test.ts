import { describe, expect, test } from "bun:test";
import {
  BeatCreateSchema,
  MythCreateSchema,
  MythologyCreateSchema,
  MythologyTraditionCreateSchema,
  TraditionCreateSchema,
  TraditionVersionCreateSchema,
  VersionBeatCreateSchema,
  VersionCreateSchema,
  WordingCreateSchema,
} from "@disnostos/model/schemas";
import { BEAT, persephone, VERSION } from "./persephone";
import { validateFixture } from "./validate";

const ID = "00000000-0000-4000-8000-000000000000";
const beatsOf = (key: string) =>
  persephone.versions.find((version) => version.key === key)!.beats.map((row) => row.beat);
const broken = (change: (copy: any) => void) => {
  const copy = structuredClone(persephone) as any;
  change(copy);
  return validateFixture(copy);
};

describe("the Persephone fixture", () => {
  test("has no broken references", () => {
    expect(validateFixture(persephone)).toEqual([]);
  });

  test("matches the generated model schemas", () => {
    for (const { name, description } of persephone.mythologies) {
      MythologyCreateSchema.parse({ name, description });
    }
    for (const { name, description } of persephone.traditions) {
      TraditionCreateSchema.parse({ name, description });
      MythologyTraditionCreateSchema.parse({ mythologyId: ID, traditionId: ID });
    }
    for (const { title, summary } of persephone.myths) MythCreateSchema.parse({ title, summary });
    for (const { label } of persephone.beats) BeatCreateSchema.parse({ mythId: ID, label });
    for (const { language, text, translatedFrom } of persephone.wordings) {
      WordingCreateSchema.parse({ beatId: ID, language, text, translatedFromId: translatedFrom ? ID : null });
    }
    for (const { title, description, beats } of persephone.versions) {
      VersionCreateSchema.parse({ mythId: ID, title, description });
      TraditionVersionCreateSchema.parse({ traditionId: ID, versionId: ID });
      for (const { position, note } of beats) {
        VersionBeatCreateSchema.parse({ versionId: ID, beatId: ID, wordingId: ID, position, note });
      }
    }
  });

  test("tells one myth three ways from a shared pool", () => {
    const homeric = beatsOf(VERSION.homeric);
    const ovid = beatsOf(VERSION.ovid);
    const orphic = beatsOf(VERSION.orphic);
    for (const shared of [BEAT.seizure, BEAT.search, BEAT.truth]) {
      expect(homeric).toContain(shared);
      expect(ovid).toContain(shared);
      expect(orphic).toContain(shared);
    }
    expect(homeric.indexOf(BEAT.truth)).toBeLessThan(homeric.indexOf(BEAT.famine));
    expect(ovid.indexOf(BEAT.famine)).toBeLessThan(ovid.indexOf(BEAT.truth));
    expect(orphic).not.toContain(BEAT.pomegranate);
    expect([...homeric, ...ovid, ...orphic]).not.toContain(BEAT.sirens);
  });

  test("gives every placed beat its own wording, and offers Italian", () => {
    for (const version of persephone.versions) {
      expect(new Set(version.beats.map((row) => row.wording)).size).toBe(version.beats.length);
    }
    expect(persephone.wordings.filter((row) => row.language === "it").length).toBeGreaterThanOrEqual(3);
  });
});

describe("validateFixture", () => {
  test("reports a duplicate key", () => {
    expect(broken((f) => f.beats.push({ ...f.beats[0] }))).toContain(`duplicate key ${BEAT.arrow}`);
  });

  test("reports a chosen wording of another beat", () => {
    const errors = broken((f) => {
      f.versions[0].beats[0].wording = "wording.narcissus.homeric";
    });
    expect(errors.join()).toContain("is of another beat");
  });

  test("reports a beat from another myth", () => {
    const errors = broken((f) => {
      f.myths.push({ key: "myth.other", title: "Other", summary: "Other" });
      f.beats[1].myth = "myth.other";
    });
    expect(errors.join()).toContain("beat belongs to another myth");
  });

  test("reports duplicate positions", () => {
    const errors = broken((f) => {
      f.versions[0].beats[1].position = f.versions[0].beats[0].position;
    });
    expect(errors.join()).toContain("duplicate position");
  });

  test("reports a translation of another beat", () => {
    const errors = broken((f) => {
      f.wordings.find((row: any) => row.key === "wording.narcissus.homeric.it").translatedFrom =
        "wording.meadow.homeric";
    });
    expect(errors.join()).toContain("translates another beat");
  });

  test("reports an unresolved key", () => {
    const errors = broken((f) => {
      f.traditions[0].mythologies = ["mythology.nowhere"];
    });
    expect(errors.join()).toContain("unknown mythology");
  });
});
