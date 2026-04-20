'use client';

import { useEffect, useMemo, useState } from 'react';
import { BrainCircuit, Loader2, MessageSquarePlus, Send } from 'lucide-react';
import {
  chatWithDeck,
  createDeckChatSession,
  getDeckChatMessages,
  getDeckChatSessions,
  syncEmbeddings,
} from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { formatActionError } from '@/lib/ai-feedback';
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
};

export function DeckChatWidget({ deckId }: DeckChatWidgetProps) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isCreatingSession, setIsCreatingSession] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadSessions() {
      const result = await getDeckChatSessions(deckId);
      if (!mounted) {
        return;
      }

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

    return () => {
      mounted = false;
    };
  }, [deckId]);

  useEffect(() => {
    let mounted = true;

    async function syncDeckVectors() {
      setIsSyncing(true);
      const result = await syncEmbeddings({ deck_id: deckId });
      if (mounted && result?.error) {
        toast.error(formatActionError(result.error, 'Embedding sync is temporarily unavailable.'));
      }
      if (mounted) {
        setIsSyncing(false);
      }
    }

    void syncDeckVectors();

    return () => {
      mounted = false;
    };
  }, [deckId]);

  useEffect(() => {
    if (!activeSessionId) {
      return;
    }

    const sessionId = activeSessionId;

    let mounted = true;

    async function loadMessages() {
      setIsLoadingMessages(true);
      const result = await getDeckChatMessages({
        deck_id: deckId,
        session_id: sessionId,
        limit: 80,
      });

      if (!mounted) {
        return;
      }

      if (result?.error) {
        toast.error(formatActionError(result.error, 'Failed to load chat history.'));
        setIsLoadingMessages(false);
        return;
      }

      setMessages(result?.success ? (result.messages as ChatMessage[]) : []);
      setIsLoadingMessages(false);
    }

    void loadMessages();

    return () => {
      mounted = false;
    };
  }, [activeSessionId, deckId]);

  const latestAssistantSuggestions = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message.role === 'assistant' && Array.isArray(message.followup_suggestions) && message.followup_suggestions.length > 0) {
        return message.followup_suggestions;
      }
    }

    return [] as string[];
  }, [messages]);

  async function handleCreateSession() {
    setIsCreatingSession(true);
    const result = await createDeckChatSession({
      deck_id: deckId,
      title: `Chat ${sessions.length + 1}`,
    });
    setIsCreatingSession(false);

    if (result?.error) {
      toast.error(formatActionError(result.error, 'Failed to create a chat session.'));
      return;
    }

    if (result?.success) {
      const nextSession = result.session as ChatSession;
      setSessions((prev) => [nextSession, ...prev]);
      setActiveSessionId(nextSession.id);
      setMessages([]);
    }
  }

  async function handleSendMessage(message: string) {
    const trimmed = message.trim();
    if (!trimmed || isSending) {
      return;
    }

    let sessionId = activeSessionId;
    if (!sessionId) {
      const sessionResult = await createDeckChatSession({
        deck_id: deckId,
        title: trimmed.slice(0, 80),
      });

      if (sessionResult?.error || !sessionResult?.success) {
        toast.error(formatActionError(sessionResult?.error, 'Failed to initialize chat session.'));
        return;
      }

      const createdSession = sessionResult.session as ChatSession;
      setSessions((prev) => [createdSession, ...prev]);
      setActiveSessionId(createdSession.id);
      sessionId = createdSession.id;
    }

    setIsSending(true);
    const result = await chatWithDeck({
      deck_id: deckId,
      session_id: sessionId,
      message: trimmed,
      top_k: 5,
    });
    setIsSending(false);

    if (result?.error) {
      toast.error(formatActionError(result.error, 'Deck chat failed.'));
      return;
    }

    const assistantAnswer = typeof result.answer === 'string' ? result.answer : '';
    if (!assistantAnswer) {
      toast.error('Deck chat returned an empty response. Please try again.');
      return;
    }

    const nowIso = new Date().toISOString();
    setMessages((prev) => [
      ...prev,
      {
        id: `tmp-user-${nowIso}`,
        role: 'user',
        content: trimmed,
        followup_suggestions: [],
        referenced_card_ids: [],
        created_at: nowIso,
      },
      {
        id: `tmp-assistant-${nowIso}`,
        role: 'assistant',
        content: assistantAnswer,
        followup_suggestions: Array.isArray(result.followupSuggestions) ? result.followupSuggestions : [],
        referenced_card_ids: Array.isArray(result.references) ? result.references.map((ref: { id: string }) => ref.id) : [],
        created_at: new Date().toISOString(),
      },
    ]);
    setInput('');
  }

  return (
    <section className="glass-card glow-border rounded-2xl p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Chat with Your Deck</h2>
          <p className="text-sm text-muted-foreground">Ask concept questions grounded in your own flashcards.</p>
        </div>
        <div className="flex items-center gap-2">
          {isSyncing ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-1 text-xs text-primary">
              <Loader2 className="h-3 w-3 animate-spin" />
              Syncing embeddings
            </span>
          ) : null}
          <Button type="button" variant="outline" size="sm" onClick={handleCreateSession} disabled={isCreatingSession} className="gap-2">
            <MessageSquarePlus className="h-4 w-4" />
            {isCreatingSession ? 'Creating...' : 'New Chat'}
          </Button>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {sessions.map((session) => (
          <button
            key={session.id}
            type="button"
            onClick={() => setActiveSessionId(session.id)}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              activeSessionId === session.id
                ? 'border-primary/35 bg-primary/15 text-primary'
                : 'border-primary/15 bg-card/50 text-muted-foreground hover:border-primary/25 hover:text-foreground'
            }`}
          >
            {session.title?.trim() || 'Untitled chat'}
          </button>
        ))}
      </div>

      <div className="h-[22rem] overflow-y-auto rounded-xl border border-primary/10 bg-card/20 p-3">
        {isLoadingMessages ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading chat history...
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-sm text-muted-foreground">
            <BrainCircuit className="mb-2 h-6 w-6 text-primary" />
            Ask your first question to start this study conversation.
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[90%] rounded-xl px-3 py-2 text-sm ${
                  message.role === 'user'
                    ? 'border border-primary/30 bg-primary/15 text-foreground'
                    : 'border border-primary/15 bg-card/60 text-muted-foreground'
                }`}>
                  <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                  {message.role === 'assistant' && Array.isArray(message.referenced_card_ids) && message.referenced_card_ids.length > 0 ? (
                    <p className="mt-2 text-[11px] uppercase tracking-[0.14em] text-primary/70">
                      References: {message.referenced_card_ids.slice(0, 3).map((id) => `#${id.slice(0, 8)}`).join(', ')}
                      {message.referenced_card_ids.length > 3 ? ` +${message.referenced_card_ids.length - 3}` : ''}
                    </p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {latestAssistantSuggestions.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {latestAssistantSuggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => void handleSendMessage(suggestion)}
              disabled={isSending}
              className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300 transition-colors hover:bg-emerald-500/15"
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
          className="min-h-[3rem] max-h-36"
          disabled={isSending}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void handleSendMessage(input);
            }
          }}
        />
        <Button type="button" onClick={() => void handleSendMessage(input)} disabled={isSending || !input.trim()} className="gap-2">
          {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Send
        </Button>
      </div>
    </section>
  );
}
