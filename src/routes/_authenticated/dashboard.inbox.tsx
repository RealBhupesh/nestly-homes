import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  listConversations,
  listMessages,
  sendMessage,
  markConversationRead,
  setPhoneRevealed,
  type ConversationRow,
  type MessageRow,
} from "@/lib/messaging.functions";

export const Route = createFileRoute("/_authenticated/dashboard/inbox")({
  head: () => ({
    meta: [
      { title: "Inbox · Nestly" },
      { name: "description", content: "Chat with owners and seekers about your listings." },
      { name: "robots", content: "noindex" },
    ],
  }),
  errorComponent: ({ error }) => (
    <div className="p-8 text-center text-ink/70">Inbox unavailable: {error.message}</div>
  ),
  notFoundComponent: () => <div className="p-8 text-center text-ink/70">Not found</div>,
  component: InboxPage,
});

function formatRelative(iso: string) {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString();
}

function InboxPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const list = useServerFn(listConversations);
  const listMsgs = useServerFn(listMessages);
  const send = useServerFn(sendMessage);
  const markRead = useServerFn(markConversationRead);
  const toggleReveal = useServerFn(setPhoneRevealed);

  // Initial + realtime load of conversations
  useEffect(() => {
    if (!user) return;
    let alive = true;
    async function load() {
      try {
        const rows = await list();
        if (!alive) return;
        setConversations(rows);
        if (!activeId && rows.length) setActiveId(rows[0].id);
      } catch {
        /* ignore */
      }
    }
    load();
    const ch = supabase
      .channel("inbox-conversations")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () =>
        load(),
      )
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Messages for active conversation + realtime
  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    let alive = true;
    async function load() {
      try {
        const rows = await listMsgs({ data: { conversationId: activeId! } });
        if (!alive) return;
        setMessages(rows);
        await markRead({ data: { conversationId: activeId! } });
      } catch {
        /* ignore */
      }
    }
    load();
    const ch = supabase
      .channel(`inbox-msgs-${activeId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${activeId}`,
        },
        (payload) => {
          const m = payload.new as MessageRow;
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
          markRead({ data: { conversationId: activeId! } }).catch(() => {});
        },
      )
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const active = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  );
  const isOwnerSide = !!(active && user && active.owner_id === user.id);
  const otherLabel = isOwnerSide ? "Seeker" : (active?.owner_name ?? "Owner");

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!activeId || !draft.trim() || sending) return;
    const body = draft.trim();
    setDraft("");
    setSending(true);
    // optimistic
    const optimistic: MessageRow = {
      id: `tmp-${Date.now()}`,
      conversation_id: activeId,
      sender_id: user!.id,
      body,
      kind: "text",
      read_at: null,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    try {
      const saved = await send({ data: { conversationId: activeId, body, kind: "text" } });
      setMessages((prev) => prev.map((m) => (m.id === optimistic.id ? saved : m)));
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setDraft(body);
    } finally {
      setSending(false);
    }
  }

  if (loading) return <div className="p-8 text-ink/60">Loading…</div>;
  if (!user) {
    navigate({ to: "/auth" });
    return null;
  }

  return (
    <div className="-mx-4 grid h-[calc(100dvh-4rem)] grid-cols-1 overflow-hidden border-y border-border/60 bg-card sm:mx-0 sm:rounded-2xl sm:border lg:grid-cols-[340px_1fr]">
      {/* Conversation list */}
      <aside className={`flex flex-col border-r border-border/60 ${active && "hidden lg:flex"}`}>
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <h2 className="font-display text-[15px] font-semibold text-ink">Inbox</h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-ink/60">
            {conversations.length}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 && (
            <div className="p-6 text-center text-[13px] text-ink/55">
              No conversations yet. Contact any listing to start a thread.
            </div>
          )}
          <ul>
            {conversations.map((c) => {
              const mine = user.id === c.seeker_id;
              const unread = mine ? c.unread_seeker : c.unread_owner;
              const isActive = c.id === activeId;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setActiveId(c.id)}
                    className={`flex w-full items-start gap-3 border-b border-border/40 px-4 py-3 text-left transition ${
                      isActive ? "bg-muted/70" : "hover:bg-muted/40"
                    }`}
                  >
                    {c.listing_photo ? (
                      <img
                        src={c.listing_photo}
                        alt=""
                        className="h-11 w-11 shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="h-11 w-11 shrink-0 rounded-lg bg-muted" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-[13px] font-semibold text-ink">
                          {c.listing_title ?? "Listing"}
                        </p>
                        <span className="shrink-0 text-[10.5px] text-ink/45">
                          {formatRelative(c.last_message_at)}
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-1 text-[12px] text-ink/55">
                        {c.last_message_preview ?? "No messages yet"}
                      </p>
                    </div>
                    {unread > 0 && (
                      <span className="ml-1 inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-coral px-1.5 text-[10.5px] font-bold text-background">
                        {unread}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </aside>

      {/* Message pane */}
      <section className={`flex min-w-0 flex-col ${!active && "hidden lg:flex"}`}>
        {active ? (
          <>
            <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3">
              <button
                type="button"
                onClick={() => setActiveId(null)}
                className="rounded-full p-1.5 text-ink/60 hover:bg-muted lg:hidden"
                aria-label="Back"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {active.listing_photo && (
                <img
                  src={active.listing_photo}
                  alt=""
                  className="h-9 w-9 rounded-lg object-cover"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-semibold text-ink">
                  {active.listing_title ?? "Listing"}
                </p>
                <p className="text-[11.5px] text-ink/55">
                  {otherLabel}{" "}
                  {active.phone_revealed && active.owner_phone && !isOwnerSide && (
                    <>
                      ·{" "}
                      <a href={`tel:${active.owner_phone}`} className="text-teal hover:underline">
                        {active.owner_phone}
                      </a>
                    </>
                  )}
                </p>
              </div>
              {isOwnerSide && (
                <button
                  type="button"
                  onClick={async () => {
                    await toggleReveal({
                      data: { conversationId: active.id, revealed: !active.phone_revealed },
                    });
                  }}
                  className={`rounded-full border px-3 py-1.5 text-[11.5px] font-medium transition ${
                    active.phone_revealed
                      ? "border-teal/40 bg-teal/10 text-teal"
                      : "border-border/70 text-ink/70 hover:border-ink hover:text-ink"
                  }`}
                >
                  {active.phone_revealed ? "Phone shared" : "Share phone"}
                </button>
              )}
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto bg-[color-mix(in_oklab,var(--cream)_65%,white)] p-4">
              {messages.map((m) => {
                const mine = m.sender_id === user.id;
                if (m.kind === "system" || m.kind === "booking") {
                  return (
                    <div
                      key={m.id}
                      className="mx-auto max-w-md rounded-full bg-ink/[0.06] px-3 py-1 text-center text-[11.5px] text-ink/60"
                    >
                      {m.body}
                    </div>
                  );
                }
                return (
                  <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-[13.5px] leading-snug shadow-sm ${
                        mine ? "bg-ink text-cream" : "bg-card text-ink border border-border/60"
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words">{m.body}</p>
                      <div
                        className={`mt-0.5 text-right text-[10px] ${mine ? "text-cream/60" : "text-ink/40"}`}
                      >
                        {formatRelative(m.created_at)}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            <form
              onSubmit={handleSend}
              className="flex items-end gap-2 border-t border-border/60 bg-card p-3"
            >
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend(e as unknown as React.FormEvent);
                  }
                }}
                rows={1}
                placeholder="Write a message…"
                className="max-h-32 min-h-[42px] flex-1 resize-none rounded-2xl border border-border/70 bg-background px-3 py-2 text-[13.5px] text-ink outline-none focus:border-ink/40"
              />
              <button
                type="submit"
                disabled={!draft.trim() || sending}
                className="inline-flex h-10 items-center gap-1.5 rounded-full bg-ink px-4 text-[13px] font-semibold text-background transition hover:brightness-110 disabled:opacity-40"
              >
                Send
              </button>
            </form>
          </>
        ) : (
          <div className="grid flex-1 place-items-center p-8 text-center">
            <div>
              <p className="font-display text-lg font-semibold text-ink">Pick a conversation</p>
              <p className="mt-1 text-[13px] text-ink/55">Or start one from any listing.</p>
              <Link
                to="/search"
                search={{ mode: "rent" }}
                className="mt-4 inline-flex rounded-full bg-ink px-4 py-2 text-[12.5px] font-semibold text-cream hover:brightness-110"
              >
                Browse listings
              </Link>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
