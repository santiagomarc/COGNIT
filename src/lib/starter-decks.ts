/**
 * Ready-made decks offered during onboarding.
 *
 * Every card must pass the app's own quality rules (isValidTermFront and
 * isEnumerationLike in src/lib/card-generation.ts):
 *   · front — 1-4 words, never a question, never a sentence, no trailing punctuation
 *   · back  — a concise factual definition, 1-3 sentences, never an enumeration
 *
 * Cards that would fail those checks make the product look worse than an empty
 * state, so `starter-decks.test.ts` asserts every one of them passes.
 */
export type StarterDeck = {
  title: string;
  shortLabel: string;
  tag: string;
  description: string;
  cards: { front: string; back: string }[];
};

export const STARTER_DECKS = {
  learning_science: {
    title: 'How Learning Works',
    shortLabel: 'Learning science',
    tag: 'bio',
    description: 'The evidence behind spaced repetition, active recall, and why cramming fails.',
    cards: [
      { front: 'Active recall', back: 'Retrieving information from memory rather than rereading it. The retrieval effort itself is what strengthens the memory.' },
      { front: 'Spacing effect', back: 'Reviews distributed over time produce far more durable memory than the same total study time spent in one session.' },
      { front: 'Forgetting curve', back: 'Ebbinghaus’s finding that retention decays roughly exponentially after learning unless the material is reviewed again.' },
      { front: 'Desirable difficulty', back: 'A condition that slows learning during practice but improves long-term retention, such as spacing or interleaving.' },
      { front: 'Interleaving', back: 'Mixing different problem types within one session instead of blocking them, which improves the ability to choose the right approach.' },
      { front: 'Testing effect', back: 'Taking a test on material produces better long-term retention than spending the same time restudying it.' },
      { front: 'Elaborative interrogation', back: 'Asking why a stated fact is true, which forces new material to connect with knowledge you already hold.' },
      { front: 'Retrieval strength', back: 'How easily something can be recalled right now. It rises sharply after review and decays quickly.' },
      { front: 'Storage strength', back: 'How deeply something is learned. It grows slowly, never decreases, and is what spaced repetition is really building.' },
      { front: 'Massed practice', back: 'Cramming all study of one topic into a single block. It produces strong short-term performance and poor long-term retention.' },
      { front: 'Overlearning', back: 'Continuing to drill material already answered correctly, which yields sharply diminishing returns compared with spacing.' },
      { front: 'Encoding specificity', back: 'Recall improves when the conditions at retrieval resemble the conditions at learning, including place, mood, and cues.' },
      { front: 'Generation effect', back: 'Information you produce yourself is remembered better than the identical information you simply read.' },
      { front: 'Dual coding', back: 'Pairing verbal material with a visual representation, giving memory two independent routes to the same idea.' },
      { front: 'Chunking', back: 'Grouping individual items into larger meaningful units so that working memory can hold more at once.' },
      { front: 'Interference', back: 'Competition between similar memories, where older learning disrupts newer material or the reverse.' },
      { front: 'Metacognition', back: 'Awareness of your own understanding. Poor metacognition is why rereading feels effective while producing little learning.' },
      { front: 'Fluency illusion', back: 'Mistaking the ease of reading familiar material for actual mastery of it. This is the main reason highlighting underperforms.' },
      { front: 'Spaced repetition', back: 'Scheduling each review just before the material is predicted to be forgotten, expanding the interval after every success.' },
      { front: 'Lag effect', back: 'Among spaced schedules, longer gaps between reviews produce better retention than shorter ones, up to the point of forgetting.' },
    ],
  },

  world_geography: {
    title: 'Capitals of the World',
    shortLabel: 'World capitals',
    tag: 'history',
    description: 'Twenty capital cities. Concrete, quick, and attemptable with no prior study.',
    cards: [
      { front: 'Japan', back: 'Tokyo, the most populous metropolitan area in the world and the seat of the Japanese government.' },
      { front: 'Australia', back: 'Canberra, purpose-built as a compromise between the rival claims of Sydney and Melbourne.' },
      { front: 'Brazil', back: 'Brasília, planned and built in the 1950s to move the capital inland from the coast.' },
      { front: 'Canada', back: 'Ottawa, in Ontario, chosen by Queen Victoria partly for its distance from the United States border.' },
      { front: 'Egypt', back: 'Cairo, the largest city in the Arab world, situated on the Nile near the Giza pyramid complex.' },
      { front: 'Switzerland', back: 'Bern, which acts as the seat of government although Switzerland names no official capital in its constitution.' },
      { front: 'Turkey', back: 'Ankara, which replaced Istanbul as capital in 1923 with the founding of the republic.' },
      { front: 'South Africa', back: 'Pretoria is the executive capital, with Cape Town legislative and Bloemfontein judicial.' },
      { front: 'New Zealand', back: 'Wellington, at the southern tip of the North Island, and the southernmost capital of any sovereign state.' },
      { front: 'Vietnam', back: 'Hanoi, in the north of the country, distinct from the larger Ho Chi Minh City in the south.' },
      { front: 'Morocco', back: 'Rabat, on the Atlantic coast, though Casablanca is considerably larger.' },
      { front: 'Norway', back: 'Oslo, at the head of the Oslofjord, and the country’s economic and governmental centre.' },
      { front: 'Argentina', back: 'Buenos Aires, on the Rio de la Plata estuary, home to roughly a third of the national population.' },
      { front: 'Nigeria', back: 'Abuja, purpose-built and made capital in 1991 to replace the coastal city of Lagos.' },
      { front: 'Portugal', back: 'Lisbon, one of the oldest cities in western Europe and a major Atlantic port.' },
      { front: 'Thailand', back: 'Bangkok, whose full ceremonial Thai name is the longest place name in the world.' },
      { front: 'Kazakhstan', back: 'Astana, which has been renamed several times and became the capital in 1997, replacing Almaty.' },
      { front: 'Peru', back: 'Lima, founded by Spanish colonists in 1535 and now home to roughly a third of Peruvians.' },
      { front: 'Poland', back: 'Warsaw, rebuilt extensively after being largely destroyed in the Second World War.' },
      { front: 'Indonesia', back: 'Jakarta, on the island of Java, though the government has begun relocating the capital to Nusantara.' },
    ],
  },

  cs_fundamentals: {
    title: 'Computer Science Fundamentals',
    shortLabel: 'CS basics',
    tag: 'cs',
    description: 'Core data structures, complexity, and systems ideas every developer meets.',
    cards: [
      { front: 'Big-O notation', back: 'A description of how an algorithm’s cost grows as its input grows, ignoring constants and lower-order terms.' },
      { front: 'Hash table', back: 'A structure that maps keys to values through a hash function, giving average constant-time lookup.' },
      { front: 'Binary search', back: 'Repeatedly halving a sorted range to locate a value, running in logarithmic time.' },
      { front: 'Linked list', back: 'A sequence where each element holds a reference to the next, giving cheap insertion but no random access.' },
      { front: 'Stack', back: 'A last-in-first-out collection where elements are added and removed only at the same end.' },
      { front: 'Queue', back: 'A first-in-first-out collection where elements are added at one end and removed from the other.' },
      { front: 'Binary search tree', back: 'A tree where every left descendant is smaller than its node and every right descendant is larger.' },
      { front: 'Recursion', back: 'A function defined in terms of itself, requiring a base case to stop it from descending forever.' },
      { front: 'Memoization', back: 'Caching the result of a function call so that repeating the same input returns the stored answer.' },
      { front: 'Dynamic programming', back: 'Solving a problem by combining answers to overlapping subproblems, each computed only once.' },
      { front: 'Race condition', back: 'A defect where the result depends on the unpredictable relative timing of concurrent operations.' },
      { front: 'Deadlock', back: 'A standstill where each of several processes waits for a resource that another is holding.' },
      { front: 'Idempotence', back: 'A property where applying an operation repeatedly produces the same result as applying it once.' },
      { front: 'Garbage collection', back: 'Automatic reclamation of memory that a program can no longer reach through any reference.' },
      { front: 'Immutability', back: 'A guarantee that a value cannot change after creation, which removes a large class of concurrency bugs.' },
      { front: 'Pure function', back: 'A function whose output depends only on its inputs and which produces no observable side effects.' },
      { front: 'Time complexity', back: 'How the running time of an algorithm scales with input size, usually expressed in Big-O notation.' },
      { front: 'Space complexity', back: 'How much additional memory an algorithm needs as its input grows.' },
      { front: 'Amortized analysis', back: 'Averaging the cost of an operation across a long sequence, so a rare expensive step is spread over many cheap ones.' },
      { front: 'Cache invalidation', back: 'Deciding when stored data has become stale and must be discarded or refreshed.' },
    ],
  },
} as const satisfies Record<string, StarterDeck>;

export type StarterDeckKey = keyof typeof STARTER_DECKS;

export const STARTER_DECK_KEYS = Object.keys(STARTER_DECKS) as StarterDeckKey[];
