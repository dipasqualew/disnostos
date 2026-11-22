import type { Fixture, FixtureVersionBeat } from "./types";

// Original English and Italian retellings. Nothing here is quoted from a published translation.

export const MYTHOLOGY = { greek: "mythology.greek", roman: "mythology.roman" } as const;

export const TRADITION = {
  eleusinian: "tradition.eleusinian",
  romanPoetic: "tradition.roman-poetic",
  orphic: "tradition.orphic",
} as const;

export const MYTH = { persephone: "myth.persephone" } as const;

export const VERSION = {
  homeric: "version.homeric",
  ovid: "version.ovid",
  orphic: "version.orphic",
} as const;

export const BEAT = {
  arrow: "beat.arrow",
  meadow: "beat.meadow",
  narcissus: "beat.narcissus",
  seizure: "beat.seizure",
  witnesses: "beat.witnesses",
  cyane: "beat.cyane",
  swine: "beat.swine",
  search: "beat.search",
  truth: "beat.truth",
  eleusis: "beat.eleusis",
  laughter: "beat.laughter",
  demophon: "beat.demophon",
  famine: "beat.famine",
  appeal: "beat.appeal",
  hermes: "beat.hermes",
  queen: "beat.queen",
  pomegranate: "beat.pomegranate",
  ascalaphus: "beat.ascalaphus",
  reunion: "beat.reunion",
  division: "beat.division",
  grain: "beat.grain",
  mysteries: "beat.mysteries",
  sirens: "beat.sirens",
} as const;

const LABELS: Record<keyof typeof BEAT, string> = {
  arrow: "Cupid's arrow",
  meadow: "Flowers in the meadow",
  narcissus: "The narcissus",
  seizure: "Hades seizes her",
  witnesses: "Hecate and the Sun hear",
  cyane: "Cyane bars the way",
  swine: "The swine of Eubouleus",
  search: "A mother's search",
  truth: "The mother learns the truth",
  eleusis: "Arrival at Eleusis",
  laughter: "The goddess laughs",
  demophon: "The child in the fire",
  famine: "The barren year",
  appeal: "Ceres before Jupiter",
  hermes: "Hermes sent below",
  queen: "Queen of the dead",
  pomegranate: "The pomegranate",
  ascalaphus: "Ascalaphus informs",
  reunion: "Mother and daughter",
  division: "The divided year",
  grain: "The grain returns",
  mysteries: "The Mysteries founded",
  sirens: "The Sirens take wing",
};

const wordings = [
  // Homeric Hymn to Demeter
  {
    key: "wording.meadow.homeric",
    beat: BEAT.meadow,
    language: "en",
    text: "Persephone was wandering the soft grass of the Nysian plain with the daughters of Ocean, far from her mother and easy in the morning. They gathered as girls gather, without hurry: roses and crocus, violets, iris and hyacinth, until their arms were heavy with colour.",
  },
  {
    key: "wording.narcissus.homeric",
    beat: BEAT.narcissus,
    language: "en",
    text: "Among them stood a flower that no spring had made unaided. Earth had raised it at the will of Zeus, a favour to the lord of many guests and a snare for the girl: a narcissus with a hundred blooms on a single root, so sweet that the wide sky laughed above it, and the land, and the salt swell of the sea. Amazed, she reached out with both hands.",
  },
  {
    key: "wording.seizure.homeric",
    beat: BEAT.seizure,
    language: "en",
    text: "The ground split open along the plain, and up through the gap came the Lord of Many, son of Cronos, behind his deathless horses. He caught her as she wept and lifted her into his golden chariot, and she screamed for her father, the highest of the gods. Zeus did not turn; he sat far off in a temple, taking the prayers of mortals.",
  },
  {
    key: "wording.witnesses.homeric",
    beat: BEAT.witnesses,
    language: "en",
    text: "For as long as she could still see the earth, the starry sky and the running sea, she went on calling, and went on hoping. Only two caught the sound: Hecate, listening from her cave, and the Sun, Hyperion's bright son, at his labour in the sky.",
  },
  {
    key: "wording.search.homeric",
    beat: BEAT.search,
    language: "en",
    text: "Then the peaks and the floor of the sea rang with her voice, and her mother heard. Demeter tore the veil from her hair, threw a dark cloak over her shoulders and swept out across land and water like a bird. For nine days she roamed the earth with a burning torch in each hand, tasting neither nectar nor ambrosia, and never once stopping to wash.",
  },
  {
    key: "wording.truth.homeric",
    beat: BEAT.truth,
    language: "en",
    text: "On the tenth dawn Hecate came to her carrying a light, and said she had heard the cry but had not seen the face. Together they went to the Sun, who looks down on everything, and he told it plainly: Zeus had given the girl to his own brother to be his wife. He urged her to let go of her anger, for the lord of a third of all creation was no shameful match.",
  },
  {
    key: "wording.eleusis.homeric",
    beat: BEAT.eleusis,
    language: "en",
    text: "Grief hardened into fury, and she left Olympus for the towns of men, her beauty hidden under the shape of an old woman. At Eleusis she sat down by the Maiden's Well in the shade of an olive, and there the daughters of Keleos, coming with their bronze pitchers, took pity on the stranger and brought her home.",
  },
  {
    key: "wording.laughter.homeric",
    beat: BEAT.laughter,
    language: "en",
    text: "She came in under the lintel and sat veiled and silent, refusing food and drink, until Iambe, who knew how, began to tease her with jokes and broad mockery. The goddess smiled, then laughed, and her heart eased a little. She would not touch the wine they offered, but asked for barley and water stirred with pennyroyal, and drank.",
  },
  {
    key: "wording.demophon.homeric",
    beat: BEAT.demophon,
    language: "en",
    text: "They gave her the queen's late-born son, Demophon, to nurse, and he grew like a god on no mortal food. She rubbed him with ambrosia by day and at night hid him in the heart of the fire like a brand, and would have made him ageless. But Metaneira crept in to watch and shrieked at what she saw, and the goddess in her rage set the child on the floor, threw off her disguise, filled the house with light and commanded that a temple be raised to her.",
  },
  {
    key: "wording.famine.homeric",
    beat: BEAT.famine,
    language: "en",
    text: "The temple rose, and she sat down inside it, apart from all the blessed gods, wasting with longing for her daughter. Then she made that year the cruellest the earth had known. Seed lay dead in the furrows, oxen dragged the curved ploughs through the fields for nothing, and the whole race of mortals would have starved, and the gods gone without their offerings.",
  },
  {
    key: "wording.hermes.homeric",
    beat: BEAT.hermes,
    language: "en",
    text: "Zeus sent Iris to call her back, and then every god in turn with gifts and honours, and she turned them all away: she would not climb Olympus or let a single grain grow until she saw her child. So he sent Hermes with his golden wand down into the dark, to bid Hades release the girl.",
  },
  {
    key: "wording.queen.homeric",
    beat: BEAT.queen,
    language: "en",
    text: "The lord of the dead heard him out with a hard half-smile and did not refuse. Go back to your mother, he told Persephone, and do not be so heavy-hearted: I am no unworthy husband, and while you are here you will rule over everything that lives and moves, and those who wrong you and will not honour you with offerings will pay for it for ever.",
  },
  {
    key: "wording.pomegranate.homeric",
    beat: BEAT.pomegranate,
    language: "en",
    text: "She leapt up in joy. But he, watching her, looked to his own advantage, and slipped into her mouth a single honey-sweet pomegranate seed, so that she would not stay for ever above with her mother. Then he yoked the immortal horses, Hermes took the reins, and they ran so fast that neither sea nor river nor mountain slowed them.",
  },
  {
    key: "wording.reunion.homeric",
    beat: BEAT.reunion,
    language: "en",
    text: "Demeter saw them from her temple at Eleusis and ran as a maenad runs down a wooded mountain, and Persephone sprang from the chariot into her arms. Even as she held her she felt a dread, and asked whether she had eaten anything below: if not, she could live with her parents always; if so, she must go back beneath the earth. The girl told her everything, the seed and the force of it, and they spent the rest of that day warming each other's hearts, and Hecate came and embraced her and was her companion from then on.",
  },
  {
    key: "wording.division.homeric",
    beat: BEAT.division,
    language: "en",
    text: "Zeus sent Rhea, his own mother, to bring Demeter back among the gods and to name the terms. For one third of the turning year the girl would live in the misty dark with her husband, and for two thirds with her mother and the other deathless ones. When spring thickened the earth with flowers she would rise again, a wonder to gods and men.",
  },
  {
    key: "wording.grain.homeric",
    beat: BEAT.grain,
    language: "en",
    text: "Demeter did not refuse. At once she sent the fruit up through the deep-soiled fields, and the whole wide earth grew heavy with leaf and flower.",
  },
  {
    key: "wording.mysteries.homeric",
    beat: BEAT.mysteries,
    language: "en",
    text: "Then she went to the kings who kept law at Eleusis, Triptolemos and Diokles, Eumolpos and Keleos, and showed them how her rites were to be performed: holy things that may not be altered, questioned or spoken aloud. Happy is the mortal who has seen them. Whoever has no part in them will have no such portion when he lies dead in the wide dark.",
  },

  // Ovid, Metamorphoses 5
  {
    key: "wording.arrow.ovid",
    beat: BEAT.arrow,
    language: "en",
    text: "Dis had driven up from his kingdom behind his black horses to see whether the giant's struggles under Sicily had cracked the roof of the dead, and Venus, on her mountain at Eryx, watched him go by. “Why should the third part of the world escape us?” she said to her son, and reminded him that Ceres' daughter meant to stay a virgin if they let her. Cupid chose from his thousand arrows the sharpest and the most obedient to the bow, braced it against his knee, and shot Dis through the heart.",
  },
  {
    key: "wording.meadow.ovid",
    beat: BEAT.meadow,
    language: "en",
    text: "Not far from Henna lies a deep lake called Pergus, where more swans sing than on the Cayster. Trees ring the water and hold off the sun like an awning, the ground is damp and bright with flowers, and spring never leaves. Here Proserpina was playing, picking violets and white lilies, packing her basket and the fold of her dress, eager to outdo the other girls.",
  },
  {
    key: "wording.seizure.ovid",
    beat: BEAT.seizure,
    language: "en",
    text: "It took Dis hardly a breath to see her, to want her and to carry her off, for love of that kind does not wait. Terrified, she called for her friends and, again and again, for her mother, and when she tore her dress at the neck the gathered flowers spilled out, and in her innocence she grieved for them too. Her captor whipped his horses on, shaking the dark reins over their necks, past the deep lakes and the sulphur-reeking pools of the Palici.",
  },
  {
    key: "wording.cyane.ovid",
    beat: BEAT.cyane,
    language: "en",
    text: "Near Syracuse the nymph Cyane rose waist-high from her pool and knew the girl at once. “You go no further,” she cried, spreading her arms across his road. “You cannot be Ceres' son-in-law against her will; she should have been asked for, not seized.” Dis, past all patience, hurled his royal sceptre into the depths, and the struck earth opened a road to Tartarus and swallowed the chariot. Cyane, mourning the girl and the insult to her spring, wept without comfort until her limbs softened and she thinned away into the very water whose goddess she had been.",
  },
  {
    key: "wording.search.ovid",
    beat: BEAT.search,
    language: "en",
    text: "Meanwhile the frightened mother looked for her daughter over every land and every sea. Neither Dawn with her wet hair nor the evening star ever found her resting. She lit two pines in the fires of Etna and carried them, sleepless, through the frosty dark, and when kind day dimmed the stars she was still seeking her child from the sun's rising to its setting.",
  },
  {
    key: "wording.famine.ovid",
    beat: BEAT.famine,
    language: "en",
    text: "Returning at last to Sicily she came to Cyane's pool, and Cyane would have told her everything, but had no mouth or tongue left to tell it with. All she could do was lift to the surface the girdle Proserpina had dropped there, and the mother knew it. Ceres tore her hair and beat her breast and cursed every land as thankless, Sicily above all; she broke the ploughs, sent death upon farmers and cattle alike, and made the fields betray their seed.",
  },
  {
    key: "wording.truth.ovid",
    beat: BEAT.truth,
    language: "en",
    text: "Then Arethusa lifted her head from her Elean waters, pushed the dripping hair behind her ears, and begged the goddess to spare the loyal earth. Her own stream ran under the world on its way to Sicily, she said, and there in the Stygian dark she had seen Proserpina with her own eyes: sad, and still afraid, but a queen, the great consort of the king of the shadows.",
  },
  {
    key: "wording.appeal.ovid",
    beat: BEAT.appeal,
    language: "en",
    text: "Ceres stood as if turned to stone, then, when grief gave way to anger, drove her chariot up into the bright air and stood before Jupiter with her hair undone. If she herself counted for nothing, she demanded, let him at least care for his own daughter. Jupiter answered that this was love and no injury, and that such a son-in-law was no disgrace; still, Proserpina might come back to the sky on one condition, that she had touched no food below, for so the Fates had laid it down.",
  },
  {
    key: "wording.pomegranate.ovid",
    beat: BEAT.pomegranate,
    language: "en",
    text: "But the girl had already broken her fast. Straying through the cultivated gardens of the dead, she had pulled a red fruit down from a curved branch, split its pale rind, and let seven seeds burst against her tongue.",
  },
  {
    key: "wording.ascalaphus.ovid",
    beat: BEAT.ascalaphus,
    language: "en",
    text: "No one had seen her but Ascalaphus, whom the nymph Orphne bore to Acheron in the dark woods of Avernus. He saw, and he told, and his telling shut her out of the upper air. The queen of Erebus turned her anger on the informer: she flicked water from Phlegethon into his face, and his eyes swelled, his beak hooked, and he dwindled into the sluggish screech owl, a bird that brings mortals word of grief.",
  },
  {
    key: "wording.division.ovid",
    beat: BEAT.division,
    language: "en",
    text: "Jupiter, set between his brother and his grieving sister, cut the turning year in two. Now the goddess, a power shared by two kingdoms, spends as many months with her mother as with her husband. Her mind and her face change together: the brow that even Dis found sad clears, as the sun comes out from the rainclouds that had hidden it.",
  },
  {
    key: "wording.sirens.ovid",
    beat: BEAT.sirens,
    language: "en",
    text: "And you, daughters of Achelous, why do you have feathers and the feet of birds, yet keep a girl's face? You were among her companions when she gathered the spring flowers, and when you had searched every land in vain you prayed for wings, so that the sea too might know your searching. The gods were willing and gold plumage came over you at once, but your faces and your voices stayed, so that your song might still charm the ear.",
  },

  // An Orphic telling
  {
    key: "wording.seizure.orphic",
    beat: BEAT.seizure,
    language: "en",
    text: "In the hymn sung to Plouton it is told that love drove him to harness four horses and carry the daughter of Demeter away across the sea. He brought her to the land of Eleusis and a deep cave in Attic country, where the gates of his unlit kingdom stand open.",
  },
  {
    key: "wording.swine.orphic",
    beat: BEAT.swine,
    language: "en",
    text: "Eubouleus the swineherd was feeding his pigs on that ground when it gave way, and the chasm took his herd down with the goddesses. Long afterwards, at the festival of the Thesmophoria, women still cast out swine in memory of it.",
  },
  {
    key: "wording.search.orphic",
    beat: BEAT.search,
    language: "en",
    text: "Deo went looking for her child, and the fragments do not say for how long. Her wandering brought her at last to Eleusis, to a people who did not yet sow grain.",
  },
  {
    key: "wording.eleusis.orphic",
    beat: BEAT.eleusis,
    language: "en",
    text: "The people of that place were said to be born of the earth itself: Baubo and Dysaules, Triptolemos the herdsman, Eumolpos who kept sheep, and Eubouleus with his pigs. Baubo took the grieving stranger in.",
  },
  {
    key: "wording.laughter.orphic",
    beat: BEAT.laughter,
    language: "en",
    text: "She offered the goddess a restoring drink, and the goddess, in mourning, would not take it. Stung by the refusal, Baubo drew up her robes and uncovered herself. Deo's grief broke into delight, and she took the cup and drank.",
  },
  {
    key: "wording.truth.orphic",
    beat: BEAT.truth,
    language: "en",
    text: "The verses that Pausanias knew under the name of Orpheus give the herdsmen the part the Sun plays elsewhere: Eubouleus and Triptolemos, sons of Dysaules, told Deo what had become of her daughter. It would be fitting, if the two stories are one, since one of them had lost his herd to the same chasm.",
  },
  {
    key: "wording.grain.orphic",
    beat: BEAT.grain,
    language: "en",
    text: "For that news she paid them with the greatest thing she had, the knowledge of how to sow. So, in this telling, the grain that feeds the living is the price of a word about the dead.",
  },
  {
    key: "wording.queen.orphic",
    beat: BEAT.queen,
    language: "en",
    text: "Of what came after, only pieces remain, and no single Orphic poem can be read whole. The hymn to Persephone keeps her where the others leave her, at the gates below: wife of Plouton, queen of those under the earth, and mistress too of the green shoots of spring. Life and death, it tells her, are hers to give.",
  },

  // Italian translations
  {
    key: "wording.narcissus.homeric.it",
    beat: BEAT.narcissus,
    language: "it",
    translatedFrom: "wording.narcissus.homeric",
    text: "Fra quei fiori ce n'era uno che nessuna primavera aveva fatto da sola. La Terra lo aveva innalzato per volere di Zeus, come favore al signore dei molti ospiti e come laccio per la fanciulla: un narciso con cento corolle su una sola radice, così dolce che il vasto cielo rise sopra di lui, e la terra, e il gonfiore salato del mare. Stupita, lei tese entrambe le mani.",
  },
  {
    key: "wording.seizure.homeric.it",
    beat: BEAT.seizure,
    language: "it",
    translatedFrom: "wording.seizure.homeric",
    text: "Il suolo si spaccò lungo la pianura, e dalla fenditura salì il Signore dei Molti, figlio di Crono, dietro i suoi cavalli immortali. La afferrò mentre piangeva e la sollevò sul carro d'oro, e lei gridò il nome del padre, il più alto degli dèi. Zeus non si voltò: sedeva lontano, in un tempio, ad accogliere le preghiere dei mortali.",
  },
  {
    key: "wording.pomegranate.homeric.it",
    beat: BEAT.pomegranate,
    language: "it",
    translatedFrom: "wording.pomegranate.homeric",
    text: "Lei balzò in piedi di gioia. Ma lui, osservandola, badò al proprio vantaggio e le fece scivolare in bocca un solo chicco di melagrana, dolce come il miele, perché non restasse per sempre lassù con la madre. Poi aggiogò i cavalli immortali, Ermes prese le redini, e corsero così veloci che né mare né fiume né montagna poté rallentarli.",
  },
  {
    key: "wording.division.homeric.it",
    beat: BEAT.division,
    language: "it",
    translatedFrom: "wording.division.homeric",
    text: "Zeus mandò Rea, sua stessa madre, a ricondurre Demetra fra gli dèi e a dettare i patti. Per un terzo dell'anno che gira la fanciulla avrebbe abitato il buio nebbioso accanto allo sposo, e per due terzi con la madre e con gli altri immortali. Quando la primavera avesse addensato la terra di fiori, sarebbe risalita, meraviglia per gli dèi e per gli uomini.",
  },
  {
    key: "wording.division.ovid.it",
    beat: BEAT.division,
    language: "it",
    translatedFrom: "wording.division.ovid",
    text: "Giove, stretto fra il fratello e la sorella in lutto, tagliò in due l'anno che gira. Ora la dea, potenza comune a due regni, passa tanti mesi con la madre quanti con lo sposo. Mente e volto mutano insieme: la fronte che perfino a Dite era parsa triste si rasserena, come il sole quando esce dalle nubi di pioggia che lo nascondevano.",
  },
] as const;

export type WordingKey = (typeof wordings)[number]["key"];

const POSITION_GAP = 1024;
type Told = { beat: string; wording: WordingKey; note?: string };
const inOrder = (rows: Told[]): FixtureVersionBeat[] =>
  rows.map((row, index) => ({ ...row, position: (index + 1) * POSITION_GAP }));

export const persephone: Fixture = {
  mythologies: [
    { key: MYTHOLOGY.greek, name: "Greek", description: "The myths and cults of the Greek-speaking world." },
    { key: MYTHOLOGY.roman, name: "Roman", description: "Roman myth and poetry, often reworking Greek material." },
  ],
  traditions: [
    {
      key: TRADITION.eleusinian,
      name: "Eleusinian",
      description: "The story as told around the Mysteries of Demeter and Kore at Eleusis.",
      mythologies: [MYTHOLOGY.greek],
    },
    {
      key: TRADITION.romanPoetic,
      name: "Roman poetic",
      description: "Latin literary retellings, in which Demeter and Persephone become Ceres and Proserpina.",
      mythologies: [MYTHOLOGY.roman],
    },
    {
      key: TRADITION.orphic,
      name: "Orphic",
      description: "Poems and hymns ascribed to Orpheus. They survive in fragments and later quotation.",
      mythologies: [MYTHOLOGY.greek],
    },
  ],
  myths: [
    {
      key: MYTH.persephone,
      title: "Persephone and Hades",
      summary: "The daughter of the grain goddess is carried off by the king of the dead, and the year is divided to bring her back.",
    },
  ],
  beats: (Object.keys(BEAT) as (keyof typeof BEAT)[]).map((name) => ({
    key: BEAT[name],
    myth: MYTH.persephone,
    label: LABELS[name],
  })),
  wordings,
  versions: [
    {
      key: VERSION.homeric,
      myth: MYTH.persephone,
      title: "Homeric Hymn to Demeter",
      description: "After the Homeric Hymn to Demeter (Hymn 2), an archaic Greek poem and the fullest early account, closely tied to the cult at Eleusis.",
      traditions: [TRADITION.eleusinian],
      beats: inOrder([
        { beat: BEAT.meadow, wording: "wording.meadow.homeric" },
        { beat: BEAT.narcissus, wording: "wording.narcissus.homeric", note: "The flower is a trap laid with Zeus's consent." },
        { beat: BEAT.seizure, wording: "wording.seizure.homeric" },
        { beat: BEAT.witnesses, wording: "wording.witnesses.homeric" },
        { beat: BEAT.search, wording: "wording.search.homeric" },
        { beat: BEAT.truth, wording: "wording.truth.homeric", note: "Here the Sun reveals it." },
        { beat: BEAT.eleusis, wording: "wording.eleusis.homeric" },
        { beat: BEAT.laughter, wording: "wording.laughter.homeric", note: "Iambe's jesting; the drink is the kykeon of the rites." },
        { beat: BEAT.demophon, wording: "wording.demophon.homeric" },
        { beat: BEAT.famine, wording: "wording.famine.homeric" },
        { beat: BEAT.hermes, wording: "wording.hermes.homeric" },
        { beat: BEAT.queen, wording: "wording.queen.homeric" },
        { beat: BEAT.pomegranate, wording: "wording.pomegranate.homeric", note: "One seed, given by Hades." },
        { beat: BEAT.reunion, wording: "wording.reunion.homeric" },
        { beat: BEAT.division, wording: "wording.division.homeric", note: "One third below, two thirds above." },
        { beat: BEAT.grain, wording: "wording.grain.homeric" },
        { beat: BEAT.mysteries, wording: "wording.mysteries.homeric" },
      ]),
    },
    {
      key: VERSION.ovid,
      myth: MYTH.persephone,
      title: "Ovid, Metamorphoses 5",
      description: "After Ovid, Metamorphoses 5.341-571, sung by the Muse Calliope. A Roman telling set in Sicily, driven by Venus and full of transformations.",
      traditions: [TRADITION.romanPoetic],
      beats: inOrder([
        { beat: BEAT.arrow, wording: "wording.arrow.ovid", note: "Love is Venus's political act." },
        { beat: BEAT.meadow, wording: "wording.meadow.ovid", note: "Henna, in Sicily, replaces Nysa." },
        { beat: BEAT.seizure, wording: "wording.seizure.ovid" },
        { beat: BEAT.cyane, wording: "wording.cyane.ovid" },
        { beat: BEAT.search, wording: "wording.search.ovid" },
        { beat: BEAT.famine, wording: "wording.famine.ovid", note: "The blight comes before she knows the truth." },
        { beat: BEAT.truth, wording: "wording.truth.ovid", note: "Here Arethusa reveals it." },
        { beat: BEAT.appeal, wording: "wording.appeal.ovid" },
        { beat: BEAT.pomegranate, wording: "wording.pomegranate.ovid", note: "Seven seeds, taken by her own hand." },
        { beat: BEAT.ascalaphus, wording: "wording.ascalaphus.ovid" },
        { beat: BEAT.division, wording: "wording.division.ovid", note: "Equal halves." },
      ]),
    },
    {
      key: VERSION.orphic,
      myth: MYTH.persephone,
      title: "An Orphic telling",
      description: "A modest reconstruction. The Orphic tradition is fragmentary: this draws on the Orphic Hymns to Plouton and Persephone, on verses quoted by Clement of Alexandria (Protrepticus 2), and on Pausanias 1.14.3. Joining them into one story is a modern convenience.",
      traditions: [TRADITION.orphic],
      beats: inOrder([
        { beat: BEAT.seizure, wording: "wording.seizure.orphic", note: "Orphic Hymn to Plouton." },
        { beat: BEAT.swine, wording: "wording.swine.orphic", note: "Clement, Protrepticus 2." },
        { beat: BEAT.search, wording: "wording.search.orphic" },
        { beat: BEAT.eleusis, wording: "wording.eleusis.orphic", note: "Clement, Protrepticus 2." },
        { beat: BEAT.laughter, wording: "wording.laughter.orphic", note: "Baubo, in verses Clement ascribes to Orpheus." },
        { beat: BEAT.truth, wording: "wording.truth.orphic", note: "Pausanias 1.14.3." },
        { beat: BEAT.grain, wording: "wording.grain.orphic", note: "Pausanias 1.14.3." },
        { beat: BEAT.queen, wording: "wording.queen.orphic", note: "Orphic Hymn to Persephone." },
      ]),
    },
  ],
};
