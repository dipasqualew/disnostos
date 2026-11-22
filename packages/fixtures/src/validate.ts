import type { Fixture } from "./types";

/** Every broken reference or invariant in a fixture. Empty means it is safe to load. */
export function validateFixture(fixture: Fixture): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  const allKeys = [
    ...fixture.mythologies,
    ...fixture.traditions,
    ...fixture.myths,
    ...fixture.beats,
    ...fixture.wordings,
    ...fixture.versions,
  ].map((record) => record.key);
  for (const key of allKeys) {
    if (seen.has(key)) errors.push(`duplicate key ${key}`);
    seen.add(key);
  }

  const mythologies = new Set(fixture.mythologies.map((row) => row.key));
  const traditions = new Set(fixture.traditions.map((row) => row.key));
  const myths = new Set(fixture.myths.map((row) => row.key));
  const beats = new Map(fixture.beats.map((row) => [row.key, row]));
  const wordings = new Map(fixture.wordings.map((row) => [row.key, row]));

  for (const tradition of fixture.traditions) {
    for (const key of tradition.mythologies) {
      if (!mythologies.has(key)) errors.push(`${tradition.key}: unknown mythology ${key}`);
    }
  }
  for (const beat of fixture.beats) {
    if (!myths.has(beat.myth)) errors.push(`${beat.key}: unknown myth ${beat.myth}`);
  }

  const listed = new Set<string>();
  for (const wording of fixture.wordings) {
    if (!beats.has(wording.beat)) errors.push(`${wording.key}: unknown beat ${wording.beat}`);
    if (wording.translatedFrom !== undefined) {
      const source = wordings.get(wording.translatedFrom);
      if (!source) errors.push(`${wording.key}: unknown source ${wording.translatedFrom}`);
      else if (source.beat !== wording.beat) errors.push(`${wording.key}: translates another beat`);
      else if (!listed.has(source.key)) errors.push(`${wording.key}: source must be listed first`);
    }
    listed.add(wording.key);
  }

  for (const version of fixture.versions) {
    if (!myths.has(version.myth)) errors.push(`${version.key}: unknown myth ${version.myth}`);
    for (const key of version.traditions) {
      if (!traditions.has(key)) errors.push(`${version.key}: unknown tradition ${key}`);
    }
    const positions = new Set<number>();
    for (const row of version.beats) {
      const where = `${version.key}/${row.beat}`;
      const beat = beats.get(row.beat);
      if (!beat) errors.push(`${where}: unknown beat`);
      else if (beat.myth !== version.myth) errors.push(`${where}: beat belongs to another myth`);
      const wording = wordings.get(row.wording);
      if (!wording) errors.push(`${where}: unknown wording ${row.wording}`);
      else if (wording.beat !== row.beat) errors.push(`${where}: wording ${row.wording} is of another beat`);
      if (positions.has(row.position)) errors.push(`${where}: duplicate position ${row.position}`);
      positions.add(row.position);
    }
  }
  return errors;
}
