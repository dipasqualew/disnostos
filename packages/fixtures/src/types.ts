/** Declarative story data. Records refer to each other by stable key, never by database ID. */
export type FixtureMythology = { key: string; name: string; description: string };
export type FixtureTradition = {
  key: string;
  name: string;
  description: string;
  mythologies: readonly string[];
};
export type FixtureMyth = { key: string; title: string; summary: string };
export type FixtureBeat = { key: string; myth: string; label: string };
export type FixtureWording = {
  key: string;
  beat: string;
  language: string;
  text: string;
  /** Must be a wording of the same beat, listed earlier. */
  translatedFrom?: string;
};
export type FixtureVersionBeat = {
  beat: string;
  wording: string;
  position: number;
  note?: string;
};
export type FixtureVersion = {
  key: string;
  myth: string;
  title: string;
  description: string;
  traditions: readonly string[];
  beats: readonly FixtureVersionBeat[];
};
export type Fixture = {
  mythologies: readonly FixtureMythology[];
  traditions: readonly FixtureTradition[];
  myths: readonly FixtureMyth[];
  beats: readonly FixtureBeat[];
  wordings: readonly FixtureWording[];
  versions: readonly FixtureVersion[];
};
