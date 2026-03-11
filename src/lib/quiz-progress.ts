type QuizResultRow = {
  id: string;
  deck_id: string;
  created_at: string;
};

type QuizCardResultRow = {
  quiz_result_id: string;
  card_id: string;
  correct: boolean;
};

export type DeckMasterySnapshot = {
  masteryPercentage: number;
  assessedCards: number;
  masteredCards: number;
  totalCards: number;
  lastQuizAt: string | null;
};

type ComputeDeckMasteryInput = {
  totalCardsByDeck: Map<string, number>;
  quizResults: QuizResultRow[];
  quizCardResults: QuizCardResultRow[];
};

export function computeDeckMasterySnapshots({
  totalCardsByDeck,
  quizResults,
  quizCardResults,
}: ComputeDeckMasteryInput): Map<string, DeckMasterySnapshot> {
  const quizResultById = new Map(quizResults.map((row) => [row.id, row]));
  const latestByDeckCard = new Map<string, { createdAt: string; correct: boolean }>();

  for (const row of quizCardResults) {
    const quizResult = quizResultById.get(row.quiz_result_id);
    if (!quizResult) {
      continue;
    }

    const key = `${quizResult.deck_id}:${row.card_id}`;
    const existing = latestByDeckCard.get(key);
    if (!existing || existing.createdAt < quizResult.created_at) {
      latestByDeckCard.set(key, {
        createdAt: quizResult.created_at,
        correct: row.correct,
      });
    }
  }

  const deckSnapshots = new Map<string, DeckMasterySnapshot>();
  for (const [deckId, totalCards] of totalCardsByDeck.entries()) {
    deckSnapshots.set(deckId, {
      masteryPercentage: 0,
      assessedCards: 0,
      masteredCards: 0,
      totalCards,
      lastQuizAt: null,
    });
  }

  for (const [key, latest] of latestByDeckCard.entries()) {
    const separatorIndex = key.indexOf(':');
    const deckId = key.slice(0, separatorIndex);
    const snapshot = deckSnapshots.get(deckId);

    if (!snapshot) {
      continue;
    }

    snapshot.assessedCards += 1;
    snapshot.masteredCards += latest.correct ? 1 : 0;
    if (!snapshot.lastQuizAt || snapshot.lastQuizAt < latest.createdAt) {
      snapshot.lastQuizAt = latest.createdAt;
    }
  }

  for (const snapshot of deckSnapshots.values()) {
    snapshot.masteryPercentage = snapshot.totalCards > 0
      ? Math.round((snapshot.masteredCards / snapshot.totalCards) * 100)
      : 0;
  }

  return deckSnapshots;
}