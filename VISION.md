# disnostos — Vision

disnostos is a place to explore myths as living, plural things, and to tell the story of your own life with the same tools.

A myth has no single canonical text. Antigone, Orpheus, and Odysseus survive as competing tellings, each shaped by a place, a cult, a poet, or a purpose. disnostos makes that plurality the core of its model: you collect the atoms of a story, arrange them into versions, surround them with art and scholarship, and trace how stories echo one another.

The same structure applies to a life. "My 20s narrative" and "my 30s narrative" are traditions that retell the same events differently. Asking "how does my life look like Odysseus's right now?" becomes a link you can create, annotate, and revisit.

## Who it is for

The first user is the founder, exploring mythology and building a personal mythology. Other people come in first as invited readers of private mythologies, and later as readers of public ones.

## Core concepts

The programmatic source of truth is `packages/model/src/entities`. The full reference is generated to `packages/model/generated/data-model.md`.

| Concept | What it is | Example |
| --- | --- | --- |
| **Beat** | An atomic story moment | "Antigone goes back to Thebes and finds her brothers dead" |
| **Wording** | The text of a beat in one language | An English or Italian phrasing of that moment |
| **Work** | A poem, image, song, study, or other cited work | A Rilke sonnet, a paper on burial law |
| **Asset** | A stored file for a work | A scan of a painting |
| **Myth** | The unit of disnostos: a story and its pool of beats | Antigone |
| **Version** | A specific ordered selection of a myth's beats | Sophocles' Antigone |
| **Interpretation** | The owner's reading of a version or beat | "Antigone's refusal as grief" |
| **Tradition** | A collection of versions | Chthonic, Olympic, Orphic, "my 20s" |
| **Mythology** | A collection of traditions | Greek, Christian, Norse, Star Wars, personal |
| **Figure** | A specific character, place, or object | Persephone, the Underworld, the pomegranate |
| **Archetype** | A recurring role, setting, symbol, or trope | Seasonal Goddess, Descent |
| **Trace** | A piece of personal writing, collected in a **Journal** | A diary entry |
| **Derivation** | A typed link between myths, versions, beats, or figures, across any mythologies | "This chapter of my life echoes Odysseus's homecoming" |
| **Tag** | A private, freeform label for organising your own content | "to reread", "thesis" |

```text
Mythology >──< Tradition >──< Version >── Myth
                                 │          │
                                 │ ordered  │ owns pool of
                                 ▼          ▼
                                Beats ──< Wordings
                                 │
                                 ├──< Figures >──< Archetypes
                                 └──< Archetypes

Works attach to beats, versions, and traces.
Traces link to beats and versions, and can be promoted by copy.
Derivations connect myths, versions, beats, and figures across mythologies.
```

## Modelling principles

1. **Beats are reusable; order belongs to the version.** A version references beats by position, so swapping a beat in or out never changes another version.
2. **Versions are many-to-many with traditions.** One telling can belong to more than one tradition.
3. **Attachments can target any level.** Works can support a whole version, several versions, or one beat.
4. **Derivations are first-class and typed.** Starting vocabulary: *retells*, *echoes*, *inverts*, *borrows from*, *contradicts*. Each derivation can carry a note explaining the connection.
5. **Personal and public mythologies share one model.** A personal mythology has no special case beyond its default privacy.
6. **Provenance matters.** Beats, wordings, and versions can cite a work, so an ancient attestation stays distinct from a modern retelling or a personal invention.
7. **Reuse across users is a fork.** Objects reference only objects with the same owner, so another user's edits or deletions cannot break yours. Derivation and tag targets are the only exceptions.
8. **Concrete and abstract stay separate.** A figure is a specific character, place, or object. An archetype is a recurring pattern that many figures and beats can embody, either generally or within one tradition.
9. **Traces are promoted by copy.** The original trace stays unchanged, and its link to the promoted object is visible only to the owner.
10. **Versions and wordings are editable, with an append-only revision log.**
11. **Tags are personal organisation.** They carry no mythological meaning, can label anything their owner can see, and are never visible to anyone else.

## Privacy and sharing

Every object is **private** by default, **public** by opt-in, and can be shared with specific people. Publishing a parent requires publishing its children, after confirming the list with the owner. Personal mythologies may hold intimate material, so privacy is a core requirement.

The hard case is a link across a privacy boundary. When a private life chapter derives from public Odysseus:

- The derivation belongs to the private side and inherits its visibility.
- A public myth never reveals that a private myth links to it.
- A viewer sees a derivation only if they can see both of its ends.

Access checks belong in the API's data layer, so that no endpoint can forget them.

## Open questions

- **Beat ownership:** does a beat belong to one myth, or can it be shared directly between myths? The current assumption is that it belongs to one myth and derivations connect it to others.
- **Copyright:** how should public pages handle in-copyright poems, songs, and translations? Links or short excerpts may be safer than hosted copies.

## Suggested first milestone

Build one complete loop for one user: create a myth, add beats, assemble two versions, attach a poem to a beat, and link one personal version to Odysseus. If comparing those two versions side by side feels illuminating, the core idea works.
