// Backward-compatible barrel: re-exports every server action from its domain
// module in src/app/actions/*, so existing `from '@/app/actions'` imports
// keep working unchanged. New code should import directly from the domain
// module instead.
export { createDeck, deleteDeck, updateDeck } from './actions/deck';
export { createCard, updateCard, bulkImportCards, deleteCard, bulkDeleteCards } from './actions/card';
export { gradeCard } from './actions/study';
export { logQuizResult, getQuizHistory, getWeakestConcepts } from './actions/quiz';
export type { WeakestConcept } from './actions/quiz';
export { generateCards } from './actions/ai-generate';
export { enrichCards } from './actions/ai-enrich';
export { sanitizeNotes, getHint } from './actions/ai-assist';
export {
  syncEmbeddings,
  createDeckChatSession,
  getDeckChatSessions,
  getDeckChatMessages,
  chatWithDeck,
  semanticSearchCards,
} from './actions/chat';
export type { SemanticSearchResult } from './actions/chat';
