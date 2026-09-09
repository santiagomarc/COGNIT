'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, MessageSquarePlus, RotateCcw, Send, TriangleAlert } from 'lucide-react';
import {
  createDeckChatSession,
  getDeckChatMessages,
  getDeckChatSessions,
  getDeckIndexStatus,
  syncEmbeddings,
} from '@/app/actions/chat';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { formatActionError } from '@/lib/ai-feedback';
import { useDeckChatStream, type ChatReference } from '@/lib/use-deck-chat-stream';
import { toast } from 'sonner';

type DeckChatWidgetProps = {
  deckId: string;
};

type ChatSession = {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
};

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  followup_suggestions: string[];
  referenced_card_ids: string[];
  created_at: string;
  /** Assistant only: the deck did not cover the question. */
  ungrounded?: boolean;
  /** Assistant only: chips resolved from the live stream's meta frame. */
  references?: ChatReference[];
};

type IndexStatus = { total: number; pending: number } | null;

export function DeckChatWidget({ deckId }: DeckChatWidgetProps) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [indexStatus, setIndexStatus] = useState<IndexStatus>(null);
  const [lastQuestion, setLastQuestion] = useState('');
  const hasAutoSyncedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { state, send, cancel, reset } = useDeckChatStream();

  // Derived from stream state rather than a manually managed boolean. This is
  // what makes the permanently-stuck Send button (finding R-2) structurally
  // impossible: there is no setIsSending(false) that an early return can skip.
  const isStreaming = state.status === 'retrieving' || state.status === 'streaming';

  useEffect(() => {
    let mounted = true;

    async function loadSessions() {
      const result = await getDeckChatSessions(deckId);
      if (!mounted) return;

      if (result?.error) {
        toast.error(formatActionError(result.error, 'Failed to load deck chat sessions.'));
        return;
      }

      const loadedSessions = result?.success ? (result.sessions as ChatSession[]) : [];
      setSessions(loadedSessions);
      if (loadedSessions.length > 0) {
        setActiveSessionId((current) => current ?? loadedSessions[0].id);
      }
    }

    void loadSessions();
    return () => { mounted = false; };
  }, [deckId]);

  // Cheap COUNT-only probe. Does NOT call the embedding API.
  useEffect(() => {
    let mounted = true;
    void getDeckIndexStatus(deckId).then((result) => {
      if (mounted && result?.success) {
        setIndexStatus({ total: result.total, pending: result.pending });
      }
    });
    return () => { mounted = false; };
  }, [deckId]);

  // Abort any in-flight stream when the deck changes or the widget unmounts.
  useEffect(() => cancel, [cancel, deckId]);

  const runSync = useCallback(async () => {
    setIsSyncing(true);
    try {
      // Bounded loop: CARDS_PER_SYNC_BATCH is 200, and we stop on no-progress.
      for (let round = 0; round < 20; round += 1) {
        const result = await syncEmbeddings({ deck_id: deckId });
        if (result?.error) {
          toast.error(formatActionError(result.error, 'Indexing is temporarily unavailable.'));
          break;
        }
        if (!result?.success) break;
        setIndexStatus({ total: result.total ?? 0, pending: result.pending });
        if (result.pending <= 0 || result.synced === 0) break;
      }
    } finally {
      setIsSyncing(false);
    }
  }, [deckId]);

  useEffect(() => {
    if (!activeSessionId) return;

    const sessionId = activeSessionId;
    let mounted = true;

    async function loadMessages() {
      setIsLoadingMessages(true);
      const result = await getDeckChatMessages({
        deck_id: deckId,
        session_id: sessionId,
        limit: 80,
      });

      if (!mounted) return;

      if (result?.error) {
        toast.error(formatActionError(result.error, 'Failed to load messages.'));
        setIsLoadingMessages(false);
        return;
      }

      setMessages(result?.success ? (result.messages as ChatMessage[]) : []);
      setIsLoadingMessages(false);
    }

    void loadMessages();
    return () => { mounted = false; };
  }, [activeSessionId, deckId]);

  // Keep the newest content in view while tokens arrive.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, state.answer]);

  // Commit the streamed answer to the message list once the stream closes.
  useEffect(() => {
    if (state.status !== 'done' || !state.answer) return;

    setMessages((prev) => [...prev, {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: state.answer,
      followup_suggestions: state.followupSuggestions,
      referenced_card_ids: state.references.map((ref) => ref.id),
      references: state.references,
      ungrounded: !state.grounded,
      created_at: new Date().toISOString(),
    }]);

    if (state.sessionId) {
      setActiveSessionId((current) => current ?? state.sessionId);
    }

    reset();
  }, [
    state.status,
    state.answer,
    state.followupSuggestions,
    state.references,
    state.grounded,
    state.sessionId,
    reset,
  ]);

  const latestAssistantSuggestions = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message.role === 'assistant' && message.followup_suggestions?.length > 0) {
        return message.followup_suggestions;
      }
    }
    return [] as string[];
  }, [messages]);

  const handleCreateSession = useCallback(async () => {
    if (isCreatingSession) return;

    setIsCreatingSession(true);
    const result = await createDeckChatSession({ deck_id: deckId, title: 'New chat' });
    setIsCreatingSession(false);

    if (result?.error || !result?.success) {
      toast.error(formatActionError(result?.error, 'Failed to create chat session.'));
      return;
    }

    const created = result.session as ChatSession;
    setSessions((prev) => [created, ...prev]);
    setActiveSessionId(created.id);
    setMessages([]);
    setInput('');
    reset();
  }, [deckId, isCreatingSession, reset]);

  const handleSendMessage = useCallback(async (message: string) => {
    const trimmed = message.trim();
    // The server schema requires >= 3 chars; checking here keeps the user out
    // of a validation round trip for an obvious typo.
    if (trimmed.length < 3 || isStreaming) return;

    setLastQuestion(trimmed);
    setInput('');

    // Optimistic: the user's own words appear instantly. Previously they did
    // not render until the assistant's full reply came back.
    setMessages((prev) => [...prev, {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed,
      followup_suggestions: [],
      referenced_card_ids: [],
      created_at: new Date().toISOString(),
    }]);

    if (indexStatus && indexStatus.pending > 0 && !hasAutoSyncedRef.current) {
      hasAutoSyncedRef.current = true;
      await runSync();
    }

    await send({ deckId, message: trimmed, sessionId: activeSessionId });
  }, [activeSessionId, deckId, indexStatus, isStreaming, runSync, send]);

  const retry = useCallback(() => {
    if (lastQuestion) void send({ deckId, message: lastQuestion, sessionId: activeSessionId });
  }, [activeSessionId, deckId, lastQuestion, send]);

  const showEmptyState = messages.length === 0 && !isStreaming && state.status !== 'error';

  return (
    <section className="surface p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
            Chat with your deck
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Ask concept questions grounded in your own flashcards.
          </p>
        </div>
        <Button type="button" size="sm" onClick={handleCreateSession} disabled={isCreatingSession} className="gap-2">
          <MessageSquarePlus className="h-4 w-4" />
          {isCreatingSession ? 'Creating…' : 'New chat'}
        </Button>
      </div>

      {indexStatus && indexStatus.pending > 0 ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-l-2 border-[var(--state-learning)] py-1 pl-3 text-xs">
          <span className="text-muted-foreground">
            {indexStatus.pending} of {indexStatus.total} cards aren&apos;t indexed yet.
            Chat can only answer from indexed cards.
          </span>
          <Button type="button" size="sm" onClick={runSync} disabled={isSyncing}>
            {isSyncing ? (
              <><Loader2 className="mr-1 h-3 w-3 animate-spin" /> Indexing…</>
            ) : 'Index now'}
          </Button>
        </div>
      ) : null}

      <div className="mb-3 flex flex-wrap gap-2">
        {sessions.map((session) => (
          <button
            key={session.id}
            type="button"
            onClick={() => setActiveSessionId(session.id)}
            aria-pressed={activeSessionId === session.id}
            className={`rounded-[var(--radius-control)] border px-3 py-1 text-xs transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
              activeSessionId === session.id
                ? 'border-[var(--border-control)] bg-surface-raised text-ink'
                : 'border-border text-ink-dim hover:border-border-strong hover:text-ink'
            }`}
          >
            {session.title?.trim() || 'Untitled chat'}
          </button>
        ))}
      </div>

      <div
        ref={scrollRef}
        className="h-[22rem] overflow-y-auto overscroll-contain rounded-[var(--radius-container)] border border-border p-3"
      >
        {isLoadingMessages ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading chat history…
          </div>
        ) : showEmptyState ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
            Ask your first question to start this study conversation.
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((message) => (
              <ChatBubble key={message.id} message={message} />
            ))}

            {/* Live streaming bubble */}
            {isStreaming ? (
              <div className="flex justify-start">
                <div className="max-w-[90%] space-y-2 rounded-[var(--radius-container)] border border-border px-3 py-2 text-sm">
                  {state.references.length > 0 ? (
                    <SourceChips references={state.references} />
                  ) : null}

                  {state.answer ? (
                    <p className="whitespace-pre-wrap leading-relaxed text-muted-foreground">
                      {state.answer}
                      <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-ink align-text-bottom" />
                    </p>
                  ) : (
                    <p className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {state.status === 'retrieving' ? 'Searching your cards…' : 'Thinking…'}
                    </p>
                  )}
                </div>
              </div>
            ) : null}

            {state.status === 'error' ? (
              <div className="flex items-start gap-2 rounded-[var(--radius-container)] border border-[var(--state-lapsed)] px-3 py-2 text-sm">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <div className="space-y-2">
                  {state.answer ? (
                    <p className="whitespace-pre-wrap leading-relaxed text-muted-foreground">{state.answer}</p>
                  ) : null}
                  <p className="text-destructive">{state.errorMessage}</p>
                  {state.retryable ? (
                    <Button type="button" size="sm" variant="outline" onClick={retry} className="gap-1.5">
                      <RotateCcw className="h-3 w-3" /> Retry
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {latestAssistantSuggestions.length > 0 && !isStreaming ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {latestAssistantSuggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => void handleSendMessage(suggestion)}
              disabled={isStreaming}
              className="rounded-[var(--radius-control)] border border-[var(--border-control)] px-3 py-1 text-xs text-ink-dim transition-colors outline-none hover:bg-surface-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex items-end gap-2">
        <Textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask a question about this deck..."
          className="max-h-36 min-h-[3rem]"
          disabled={isStreaming}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void handleSendMessage(input);
            }
          }}
        />
        <Button
          type="button"
          onClick={() => void handleSendMessage(input)}
          disabled={isStreaming || input.trim().length < 3}
          className="gap-2"
        >
          {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Send
        </Button>
      </div>
    </section>
  );
}

function SourceChips({ references }: { references: ChatReference[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {references.map((ref) => (
        <span
          key={ref.id}
          title={ref.similarity !== null ? `${Math.round(ref.similarity * 100)}% match` : undefined}
          className="rounded-[var(--radius-control)] border border-border px-2 py-0.5 font-mono text-[10px] text-ink-dimmer"
        >
          {ref.front}
        </span>
      ))}
    </div>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  // An un-grounded answer says "your deck doesn't cover this". Rendering it in
  // the normal assistant style would make a refusal look like an answer.
  const bubbleClass = isUser
    ? 'border border-[var(--border-control)] bg-surface-raised text-ink'
    : message.ungrounded
      ? 'border border-border border-l-2 border-l-[var(--state-learning)] text-ink-dim'
      : 'border border-border text-ink-dim';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[90%] space-y-2 rounded-[var(--radius-container)] px-3 py-2 text-sm ${bubbleClass}`}>
        {message.references && message.references.length > 0 ? (
          <SourceChips references={message.references} />
        ) : null}

        {message.ungrounded ? (
          <p className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-[var(--state-learning)]">
            Not covered by this deck
          </p>
        ) : null}

        <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>

        {!message.references && !isUser && message.referenced_card_ids?.length > 0 ? (
          <p className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] tnum text-ink-dimmer">
            {message.referenced_card_ids.length} source
            {message.referenced_card_ids.length === 1 ? '' : 's'} from your deck
          </p>
        ) : null}
      </div>
    </div>
  );
}
