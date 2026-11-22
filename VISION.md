# disnostos — Vision

disnostos is a place to explore myths as living, plural things, and to tell the story of your own life with the same tools.

A myth has no single canonical text. Antigone, Orpheus, and Odysseus survive as competing tellings, each shaped by a place, a cult, a poet, or a purpose. disnostos makes that plurality the core of its model: you collect the atoms of a story, arrange them into versions, surround them with art and scholarship, and trace how stories echo one another.

The same structure applies to a life. "My 20s narrative" and "my 30s narrative" are traditions that retell the same events differently. Asking "how does my life look like Odysseus's right now?" becomes a link you can create, annotate, and revisit.

## Who it is for

The first user is the founder, exploring mythology and building a personal mythology. Other people come in first as invited readers of private mythologies, and later as readers of public ones.

## Core concepts

| Concept | What it is | Example |
| --- | --- | --- |
| **Narration line** | An atomic story beat | "Antigone goes back to Thebes and finds her brothers dead" |
| **Media** | A poem, image, song, or other work | A Rilke sonnet, a painting |
| **Study** | An essay or other analysis | A paper on Antigone and burial law |
| **Myth** | The unit of disnostos: a story and its pool of atoms | Antigone |
| **Version** | A specific ordered selection of a myth's lines and media | Sophocles' Antigone |
| **Tradition** | A collection of versions | Chthonic, Olympic, Orphic, "my 20s" |
| **Mythology** | A collection of traditions | Greek, Christian, Norse, Star Wars, personal |
| **Derivation** | A typed link between myths, versions, or lines, across any mythologies | "This chapter of my life echoes Odysseus's homecoming" |

```text
Mythology ──< Tradition >──< Version >── Myth
                               │           │
                               │ ordered   │ owns pool of
                               ▼           ▼
                             Narration lines, media

Studies and media attach to versions or to individual lines.
Derivations connect myths, versions, and lines across mythologies.
```

## Modelling principles

1. **Lines are reusable; order belongs to the version.** A version references lines by position, so swapping a line in or out never changes another version.
2. **Versions are many-to-many with traditions.** One telling can belong to more than one tradition.
3. **Attachments can target any level.** Media and studies can support a whole version, several versions, or one line.
4. **Derivations are first-class and typed.** Starting vocabulary: *retells*, *echoes*, *inverts*, *borrows from*, *contradicts*. Each derivation can carry a note explaining the connection.
5. **Personal and public mythologies share one model.** A personal mythology has no special case beyond its default privacy.
6. **Provenance matters.** Lines and versions should be able to cite a source, so an ancient attestation stays distinct from a modern retelling or a personal invention.

## Privacy and sharing

Mythologies are **public** or **private**, and private mythologies can be shared with specific people. Personal mythologies are private by default and may hold intimate material, so privacy is a core requirement.

The hard case is a link across a privacy boundary. When a private life chapter derives from public Odysseus:

- The derivation belongs to the private side and inherits its visibility.
- A public myth never reveals that a private myth links to it.
- A viewer sees a derivation only if they can see both of its ends.

Access checks belong in the API's data layer, so that no endpoint can forget them.

## Open questions

- **Line ownership:** does a line belong to one myth, or can it be shared directly between myths? The current assumption is that it belongs to one myth and derivations connect it to others.
- **History:** are versions immutable snapshots, or editable with a revision history?
- **Copyright:** how should public pages handle in-copyright poems, songs, and translations? Links or short excerpts may be safer than hosted copies.
- **Forking:** can someone fork a shared or public version into their own mythology?

## Suggested first milestone

Build one complete loop for one user: create a myth, add lines, assemble two versions, attach a poem to a line, and link one personal version to Odysseus. If comparing those two versions side by side feels illuminating, the core idea works.
