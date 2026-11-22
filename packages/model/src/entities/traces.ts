import { arc, defineEntity, f } from "../dsl";

const group = "Traces";

export const Trace = defineEntity({
  name: "Trace",
  group,
  description:
    "A piece of personal writing. Promotion copies it into a wording or interpretation and leaves it unchanged.",
  scope: "object",
  fields: {
    title: f.text("Optional title.", { optional: true }),
    body: f.text("The writing."),
    language: f.language("BCP 47 language tag.", { optional: true }),
    writtenAt: f.timestamp("When the writer dates this entry.", { optional: true }),
  },
});

export const Journal = defineEntity({
  name: "Journal",
  group,
  description: "An ordered collection of traces.",
  scope: "object",
  fields: {
    name: f.text("Name of the journal."),
    description: f.text("What this journal is for.", { optional: true }),
  },
});

export const JournalTrace = defineEntity({
  name: "JournalTrace",
  group,
  description: "Places a trace at a position in a journal.",
  scope: "dependent",
  fields: {
    journalId: f.ref("Journal", "The journal."),
    traceId: f.ref("Trace", "The trace."),
    position: f.float("Sort key. Moving a trace assigns the midpoint of its new neighbours."),
  },
  unique: [
    ["journalId", "traceId"],
    ["journalId", "position"],
  ],
});

export const TraceLink = defineEntity({
  name: "TraceLink",
  group,
  description: "Attaches a trace to a beat or version without changing either.",
  scope: "dependent",
  fields: {
    traceId: f.ref("Trace", "The trace."),
    note: f.text("Why these connect.", { optional: true }),
  },
  arcs: { target: arc(["Beat", "Version"], "What the trace attaches to.") },
});
