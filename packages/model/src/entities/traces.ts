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
    writtenOn: f.date("The calendar day the writer dates this entry, as YYYY-MM-DD."),
  },
  indexes: [
    [
      { field: "writtenOn", order: "desc" },
      { field: "createdAt", order: "desc" },
    ],
  ],
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
  description: "Connects a trace to a beat, version, or another trace without changing either.",
  scope: "dependent",
  fields: {
    traceId: f.ref("Trace", "The trace."),
    note: f.text("Why these connect.", { optional: true }),
  },
  arcs: { target: arc(["Beat", "Version", "Trace"], "What the trace connects to.") },
  unique: [["traceId", "target"]],
  invariants: [
    "A trace cannot link to itself.",
    "A link between two traces is undirected: `traceId` holds the lower ID and `targetTraceId` the higher, so A-B and B-A are one link.",
  ],
});
