import { useState, useRef, useEffect, useCallback } from "react";

// ─── Config ────────────────────────────────────────────────────────────────
const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3001";
const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY || "";
const GROQ_API = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";
const MAX_TOOL_ITERATIONS = 10;

// ─── Types ──────────────────────────────────────────────────────────────────
type Role = "user" | "assistant";

type Message = {
  id: string;
  role: Role;
  content: string;
  timestamp: Date;
  toolCalls?: ToolCallEntry[];
  isError?: boolean;
};

type ToolCallEntry = {
  name: string;
  args: Record<string, unknown>;
  result: unknown;
  durationMs: number;
};

type Tool = {
  name: string;
  description: string;
  parameters: Record<string, string>;
};

type GroqApiMessage =
  | { role: "system" | "user" | "assistant"; content: string }
  | { role: "assistant"; content: null; tool_calls: GroqToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

type GroqToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

// ─── Helpers ────────────────────────────────────────────────────────────────
function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function toGroqToolSchema(tool: Tool) {
  const properties: Record<string, { type: string; description: string }> = {};
  for (const [key, val] of Object.entries(tool.parameters)) {
    properties[key] = {
      type: val.toLowerCase().startsWith("number") ? "number" : "string",
      description: val,
    };
  }
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters:
        Object.keys(properties).length > 0
          ? { type: "object", properties, required: Object.keys(properties) }
          : { type: "object", properties: {} },
    },
  };
}

// ─── API Layer ───────────────────────────────────────────────────────────────
async function fetchTools(): Promise<Tool[]> {
  const res = await fetch(`${SERVER_URL}/tools`);
  if (!res.ok) throw new Error(`Failed to fetch tools: ${res.statusText}`);
  const data = await res.json();
  return data.tools ?? [];
}

async function invokeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${SERVER_URL}/invoke`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tool: name, args }),
  });
  if (!res.ok) throw new Error(`Tool "${name}" failed: ${res.statusText}`);
  return res.json();
}

async function callGroq(messages: GroqApiMessage[], tools: Tool[]) {
  const res = await fetch(GROQ_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      tools: tools.map(toGroqToolSchema),
      tool_choice: tools.length > 0 ? "auto" : "none",
      max_tokens: 1024,
      parallel_tool_calls: false,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "Groq API error");
  return { message: data.choices?.[0]?.message };
}

// ─── Suggestions ─────────────────────────────────────────────────────────────
const SUGGESTIONS = [
  "What is 128 ÷ 4?",
  "Convert 100 USD → INR",
  "Generate a password",
  "Word count a sentence",
];

// ─── ToolCallAccordion ───────────────────────────────────────────────────────
function ToolCallAccordion({ calls }: { calls: ToolCallEntry[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="cw-tool-accordion">
      <button
        className="cw-tool-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
        </svg>
        Used {calls.length} tool{calls.length !== 1 ? "s" : ""}
        <span className={`cw-chevron ${open ? "open" : ""}`}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </span>
      </button>
      {open && (
        <div className="cw-tool-body">
          {calls.map((c, i) => (
            <div key={i} className="cw-tool-entry">
              <div className="cw-tool-row">
                <code>{c.name}</code>
                <span className="cw-tool-ms">{c.durationMs}ms</span>
              </div>
              <div className="cw-tool-block">
                <span className="cw-tool-label">Args</span>
                <pre>{JSON.stringify(c.args, null, 2)}</pre>
              </div>
              <div className="cw-tool-block">
                <span className="cw-tool-label">Result</span>
                <pre>{JSON.stringify(c.result, null, 2)}</pre>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── MessageBubble ───────────────────────────────────────────────────────────
function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <div className={`cw-msg-row ${isUser ? "cw-user" : "cw-ai"}`}>
      {!isUser && (
        <div className="cw-avatar cw-ai-avatar">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2M9 11a2 2 0 0 0-2 2 2 2 0 0 0 2 2 2 2 0 0 0 2-2 2 2 0 0 0-2-2m6 0a2 2 0 0 0-2 2 2 2 0 0 0 2 2 2 2 0 0 0 2-2 2 2 0 0 0-2-2z"/>
          </svg>
        </div>
      )}
      <div className={`cw-bubble ${isUser ? "cw-bubble-user" : "cw-bubble-ai"} ${msg.isError ? "cw-bubble-error" : ""}`}>
        {msg.toolCalls && msg.toolCalls.length > 0 && (
          <ToolCallAccordion calls={msg.toolCalls} />
        )}
        <p className="cw-bubble-text">{msg.content}</p>
        <span className="cw-bubble-time">{formatTime(msg.timestamp)}</span>
      </div>
    </div>
  );
}

// ─── TypingIndicator ─────────────────────────────────────────────────────────
function TypingIndicator() {
  return (
    <div className="cw-msg-row cw-ai">
      <div className="cw-avatar cw-ai-avatar">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2M9 11a2 2 0 0 0-2 2 2 2 0 0 0 2 2 2 2 0 0 0 2-2 2 2 0 0 0-2-2m6 0a2 2 0 0 0-2 2 2 2 0 0 0 2 2 2 2 0 0 0 2-2 2 2 0 0 0-2-2z"/>
        </svg>
      </div>
      <div className="cw-bubble cw-bubble-ai cw-typing">
        <span className="cw-dot" /><span className="cw-dot" /><span className="cw-dot" />
      </div>
    </div>
  );
}

// ─── Unread Badge ─────────────────────────────────────────────────────────────
function UnreadBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return <span className="cw-badge">{count > 9 ? "9+" : count}</span>;
}

// ─── Main ChatWidget ──────────────────────────────────────────────────────────
export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [tools, setTools] = useState<Tool[]>([]);
  const [toolsError, setToolsError] = useState(false);
  const [toolsReady, setToolsReady] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [unread, setUnread] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchTools()
      .then((t) => { setTools(t); setToolsReady(true); })
      .catch(() => { setToolsError(true); setToolsReady(true); });
  }, []);

  useEffect(() => {
    if (open) {
      setUnread(0);
      setTimeout(() => inputRef.current?.focus(), 120);
    }
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
  };

  const sendMessage = useCallback(
    async (overrideText?: string) => {
      const text = (overrideText ?? input).trim();
      if (!text || loading) return;

      if (!GROQ_API_KEY) {
        setMessages((prev) => [
          ...prev,
          { id: uid(), role: "user", content: text, timestamp: new Date() },
          {
            id: uid(), role: "assistant", isError: true,
            content: "No GROQ API key. Set VITE_GROQ_API_KEY in your .env file.",
            timestamp: new Date(),
          },
        ]);
        setInput("");
        return;
      }

      const userMsg: Message = { id: uid(), role: "user", content: text, timestamp: new Date() };
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      if (inputRef.current) inputRef.current.style.height = "auto";
      setLoading(true);
      abortRef.current = new AbortController();

      const history: GroqApiMessage[] = [
        {
          role: "system",
          content:
            "You are a helpful, concise assistant. Use tools whenever the user's request matches one. Never calculate manually — always call the tool. Be brief and direct.",
        },
        ...messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
        { role: "user", content: text },
      ];

      try {
        const collectedToolCalls: ToolCallEntry[] = [];
        let iterations = 0;
        let finalContent = "";

        while (iterations < MAX_TOOL_ITERATIONS) {
          iterations++;
          const { message } = await callGroq(history, tools);
          if (!message) throw new Error("Empty response from Groq");

          if (!message.tool_calls || message.tool_calls.length === 0) {
            finalContent = message.content ?? "";
            break;
          }

          history.push(message);

          for (const tc of message.tool_calls as GroqToolCall[]) {
            let args: Record<string, unknown> = {};
            try { args = JSON.parse(tc.function.arguments || "{}"); } catch { args = {}; }

            const t0 = performance.now();
            let result: unknown;
            try { result = await invokeTool(tc.function.name, args); }
            catch (err: any) { result = { error: err.message }; }
            const durationMs = Math.round(performance.now() - t0);

            collectedToolCalls.push({ name: tc.function.name, args, result, durationMs });
            history.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) });
          }
        }

        if (!finalContent && iterations >= MAX_TOOL_ITERATIONS)
          finalContent = "Reached maximum tool iterations without a final answer.";

        const reply: Message = {
          id: uid(),
          role: "assistant",
          content: finalContent,
          timestamp: new Date(),
          toolCalls: collectedToolCalls.length > 0 ? collectedToolCalls : undefined,
        };

        setMessages((prev) => [...prev, reply]);
        if (!open) setUnread((n) => n + 1);
      } catch (err: any) {
        if (err.name === "AbortError") return;
        setMessages((prev) => [
          ...prev,
          { id: uid(), role: "assistant", content: `Error: ${err.message}`, timestamp: new Date(), isError: true },
        ]);
      } finally {
        setLoading(false);
        abortRef.current = null;
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    },
    [input, loading, messages, tools, open]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const stopGeneration = () => { abortRef.current?.abort(); setLoading(false); };
  const clearChat = () => { if (!loading) setMessages([]); };

  const isEmpty = messages.length === 0;

  return (
    <>
      <style>{CSS}</style>

      {/* ── Floating panel ── */}
      <div
        ref={panelRef}
        className={`cw-panel ${open ? "cw-panel-open" : "cw-panel-closed"}`}
        role="dialog"
        aria-label="AI Assistant"
        aria-hidden={!open}
      >
        {/* Header */}
        <div className="cw-header">
          <div className="cw-header-left">
            <div className="cw-ai-dot" />
            <div>
              <div className="cw-model-name">Llama 3.3 · 70B</div>
              <div className="cw-status">
                {!toolsReady
                  ? "Connecting…"
                  : toolsError
                  ? "⚠ Tool server offline"
                  : tools.length > 0
                  ? `${tools.length} tool${tools.length !== 1 ? "s" : ""} ready`
                  : "Plain chat mode"}
              </div>
            </div>
          </div>
          <div className="cw-header-actions">
            {messages.length > 0 && (
              <button className="cw-icon-btn" onClick={clearChat} disabled={loading} title="Clear chat">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                </svg>
              </button>
            )}
            <button className="cw-icon-btn" onClick={() => setOpen(false)} title="Close (Esc)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Messages */}
        <main className="cw-messages" role="log" aria-live="polite">
          {isEmpty && (
            <div className="cw-empty">
              <div className="cw-empty-glyph">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              </div>
              <p className="cw-empty-title">Ask me anything</p>
              <p className="cw-empty-sub">I'll use your tools automatically.</p>
              <div className="cw-suggestions">
                {SUGGESTIONS.map((s) => (
                  <button key={s} className="cw-suggestion" onClick={() => sendMessage(s)} disabled={loading}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)}
          {loading && <TypingIndicator />}
          <div ref={bottomRef} />
        </main>

        {/* Input */}
        <div className="cw-footer">
          <div className="cw-input-box">
            <textarea
              ref={inputRef}
              className="cw-textarea"
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Message… (Enter to send)"
              disabled={loading}
              rows={1}
              aria-label="Type a message"
            />
            {loading ? (
              <button className="cw-send cw-stop" onClick={stopGeneration} title="Stop">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="3" y="3" width="18" height="18" rx="2"/>
                </svg>
              </button>
            ) : (
              <button className="cw-send" onClick={() => sendMessage()} disabled={!input.trim()} aria-label="Send">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
                </svg>
              </button>
            )}
          </div>
          <p className="cw-powered">Powered by Groq</p>
        </div>
      </div>

      {/* ── FAB Launcher ── */}
      <button
        className={`cw-fab ${open ? "cw-fab-open" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close chat" : "Open AI assistant"}
        aria-expanded={open}
      >
        <span className="cw-fab-icon cw-fab-chat">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </span>
        <span className="cw-fab-icon cw-fab-close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </span>
        <UnreadBadge count={unread} />
      </button>
    </>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500&family=DM+Mono:wght@400;500&display=swap');

  /* ── Reset scoped to widget ── */
  .cw-panel *, .cw-panel *::before, .cw-panel *::after,
  .cw-fab *, .cw-fab *::before, .cw-fab *::after { box-sizing: border-box; margin: 0; padding: 0; }

  /* ── Tokens ── */
  .cw-panel, .cw-fab {
    --bg: #ffffff;
    --surface: #f8f8f8;
    --border: #ebebeb;
    --border-subtle: #f3f3f3;
    --text: #111111;
    --text-2: #555555;
    --text-3: #999999;
    --accent: #111111;
    --accent-fg: #ffffff;
    --user-bg: #111111;
    --user-fg: #ffffff;
    --ai-bg: #f1f1f1;
    --ai-fg: #111111;
    --error-bg: #fff5f5;
    --error-fg: #c0392b;
    --error-border: #ffd5d5;
    --green: #16a34a;
    --red: #dc2626;
    --r: 16px;
    --r-sm: 9px;
    --font: 'DM Sans', system-ui, sans-serif;
    --mono: 'DM Mono', monospace;
    --shadow-panel: 0 8px 30px rgba(0,0,0,.12), 0 2px 8px rgba(0,0,0,.08);
    --shadow-fab: 0 4px 16px rgba(0,0,0,.22), 0 1px 4px rgba(0,0,0,.12);
  }

  /* ── FAB ── */
  .cw-fab {
    position: fixed;
    bottom: 28px;
    right: 28px;
    z-index: 9999;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: var(--accent);
    border: none;
    cursor: pointer;
    box-shadow: var(--shadow-fab);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform .2s cubic-bezier(.34,1.56,.64,1), box-shadow .2s;
    outline: none;
  }
  .cw-fab:hover { transform: scale(1.08); box-shadow: 0 6px 24px rgba(0,0,0,.28); }
  .cw-fab:active { transform: scale(.96); }
  .cw-fab:focus-visible { box-shadow: var(--shadow-fab), 0 0 0 3px rgba(0,0,0,.2); }

  /* Icon swap animation */
  .cw-fab-icon {
    position: absolute;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: opacity .2s, transform .25s cubic-bezier(.34,1.56,.64,1);
  }
  .cw-fab-chat  { opacity: 1;  transform: scale(1) rotate(0deg); }
  .cw-fab-close { opacity: 0;  transform: scale(.5) rotate(-90deg); }
  .cw-fab.cw-fab-open .cw-fab-chat  { opacity: 0;  transform: scale(.5) rotate(90deg); }
  .cw-fab.cw-fab-open .cw-fab-close { opacity: 1;  transform: scale(1) rotate(0deg); }

  /* Unread badge */
  .cw-badge {
    position: absolute;
    top: -3px;
    right: -3px;
    min-width: 18px;
    height: 18px;
    border-radius: 9px;
    background: #ef4444;
    color: #fff;
    font-family: var(--font);
    font-size: 10px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 4px;
    border: 2px solid #fff;
    pointer-events: none;
  }

  /* ── Panel ── */
  .cw-panel {
    position: fixed;
    bottom: 100px;
    right: 28px;
    z-index: 9998;
    width: 380px;
    height: 560px;
    max-height: calc(100dvh - 120px);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 20px;
    box-shadow: var(--shadow-panel);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    font-family: var(--font);
    color: var(--text);
    transform-origin: bottom right;
    transition: opacity .22s ease, transform .25s cubic-bezier(.34,1.56,.64,1);
  }
  .cw-panel-closed {
    opacity: 0;
    transform: scale(.88) translateY(12px);
    pointer-events: none;
  }
  .cw-panel-open {
    opacity: 1;
    transform: scale(1) translateY(0);
    pointer-events: all;
  }

  /* ── Header ── */
  .cw-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    background: var(--bg);
  }
  .cw-header-left {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .cw-ai-dot {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--accent);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    position: relative;
  }
  .cw-ai-dot::after {
    content: '';
    position: absolute;
    bottom: 1px;
    right: 1px;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--green);
    border: 2px solid var(--bg);
  }
  .cw-model-name {
    font-size: 13.5px;
    font-weight: 500;
    color: var(--text);
    letter-spacing: -.01em;
  }
  .cw-status {
    font-size: 11px;
    color: var(--text-3);
    margin-top: 1px;
  }
  .cw-header-actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .cw-icon-btn {
    width: 30px;
    height: 30px;
    border-radius: 7px;
    border: none;
    background: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-3);
    transition: background .12s, color .12s;
  }
  .cw-icon-btn:hover:not(:disabled) { background: var(--surface); color: var(--text); }
  .cw-icon-btn:disabled { opacity: .4; cursor: not-allowed; }

  /* ── Messages ── */
  .cw-messages {
    flex: 1;
    overflow-y: auto;
    padding: 16px 14px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    scroll-behavior: smooth;
  }
  .cw-messages::-webkit-scrollbar { width: 3px; }
  .cw-messages::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }

  /* ── Empty state ── */
  .cw-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    gap: 6px;
    padding: 32px 16px;
  }
  .cw-empty-glyph {
    width: 52px;
    height: 52px;
    border-radius: 16px;
    background: var(--surface);
    border: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-3);
    margin-bottom: 4px;
  }
  .cw-empty-title {
    font-size: 15px;
    font-weight: 500;
    color: var(--text);
    letter-spacing: -.01em;
  }
  .cw-empty-sub {
    font-size: 12.5px;
    color: var(--text-3);
    margin-bottom: 12px;
  }
  .cw-suggestions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    width: 100%;
  }
  .cw-suggestion {
    font-family: var(--font);
    font-size: 12px;
    text-align: left;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--r-sm);
    padding: 8px 10px;
    cursor: pointer;
    color: var(--text-2);
    line-height: 1.4;
    transition: border-color .12s, color .12s, box-shadow .12s;
  }
  .cw-suggestion:hover:not(:disabled) {
    border-color: #bbb;
    color: var(--text);
    box-shadow: 0 1px 4px rgba(0,0,0,.07);
  }
  .cw-suggestion:disabled { opacity: .5; cursor: not-allowed; }

  /* ── Message rows ── */
  .cw-msg-row {
    display: flex;
    align-items: flex-end;
    gap: 7px;
    max-width: 100%;
    margin-bottom: 4px;
    animation: cw-up .16s ease;
  }
  @keyframes cw-up {
    from { opacity: 0; transform: translateY(5px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .cw-user { flex-direction: row-reverse; }
  .cw-ai   { flex-direction: row; }

  .cw-avatar {
    flex-shrink: 0;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .cw-ai-avatar { background: var(--accent); color: #fff; }

  .cw-bubble {
    max-width: 82%;
    padding: 9px 12px;
    border-radius: var(--r);
    display: flex;
    flex-direction: column;
    gap: 7px;
  }
  .cw-bubble-user {
    background: var(--user-bg);
    color: var(--user-fg);
    border-bottom-right-radius: 4px;
  }
  .cw-bubble-ai {
    background: var(--ai-bg);
    color: var(--ai-fg);
    border-bottom-left-radius: 4px;
  }
  .cw-bubble-error {
    background: var(--error-bg) !important;
    color: var(--error-fg) !important;
    border: 1px solid var(--error-border);
  }
  .cw-bubble-text {
    font-size: 13.5px;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .cw-bubble-time {
    font-size: 10px;
    opacity: .4;
    align-self: flex-end;
    margin-top: -3px;
  }

  /* ── Typing dots ── */
  .cw-typing {
    padding: 12px 16px;
    display: flex !important;
    flex-direction: row !important;
    align-items: center;
    gap: 4px;
  }
  .cw-dot {
    display: inline-block;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--text-3);
    animation: cw-bounce 1.2s ease-in-out infinite;
  }
  .cw-dot:nth-child(2) { animation-delay: .2s; }
  .cw-dot:nth-child(3) { animation-delay: .4s; }
  @keyframes cw-bounce {
    0%,80%,100% { transform: translateY(0); opacity:.4; }
    40%          { transform: translateY(-4px); opacity:1; }
  }

  /* ── Tool accordion ── */
  .cw-tool-accordion {
    border: 1px solid var(--border);
    border-radius: var(--r-sm);
    overflow: hidden;
    background: var(--bg);
    font-size: 11.5px;
  }
  .cw-tool-trigger {
    display: flex;
    align-items: center;
    gap: 5px;
    width: 100%;
    padding: 6px 9px;
    background: none;
    border: none;
    cursor: pointer;
    font-family: var(--font);
    font-size: 11.5px;
    color: var(--text-2);
    text-align: left;
    transition: background .1s;
  }
  .cw-tool-trigger:hover { background: var(--border-subtle); }
  .cw-chevron { margin-left: auto; display: flex; transition: transform .2s; }
  .cw-chevron.open { transform: rotate(90deg); }
  .cw-tool-body { border-top: 1px solid var(--border); }
  .cw-tool-entry {
    padding: 7px 9px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    border-bottom: 1px solid var(--border-subtle);
  }
  .cw-tool-entry:last-child { border-bottom: none; }
  .cw-tool-row { display: flex; justify-content: space-between; align-items: center; }
  .cw-tool-row code {
    font-family: var(--mono);
    font-size: 11px;
    background: var(--border-subtle);
    padding: 2px 5px;
    border-radius: 4px;
  }
  .cw-tool-ms { font-family: var(--mono); font-size: 10px; color: var(--text-3); }
  .cw-tool-block { display: flex; flex-direction: column; gap: 2px; }
  .cw-tool-label {
    font-size: 9.5px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: .06em;
    color: var(--text-3);
  }
  .cw-tool-block pre {
    font-family: var(--mono);
    font-size: 10.5px;
    color: var(--text-2);
    background: var(--border-subtle);
    padding: 5px 7px;
    border-radius: 4px;
    white-space: pre-wrap;
    word-break: break-all;
    max-height: 100px;
    overflow-y: auto;
  }

  /* ── Footer ── */
  .cw-footer {
    padding: 10px 14px 12px;
    border-top: 1px solid var(--border);
    background: var(--bg);
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .cw-input-box {
    display: flex;
    align-items: flex-end;
    gap: 7px;
    background: var(--surface);
    border: 1.5px solid var(--border);
    border-radius: var(--r);
    padding: 7px 7px 7px 13px;
    transition: border-color .15s, box-shadow .15s;
  }
  .cw-input-box:focus-within {
    border-color: #c0c0c0;
    box-shadow: 0 0 0 3px rgba(0,0,0,.04);
  }
  .cw-textarea {
    flex: 1;
    font-family: var(--font);
    font-size: 13.5px;
    line-height: 1.5;
    color: var(--text);
    background: transparent;
    border: none;
    outline: none;
    resize: none;
    min-height: 22px;
    max-height: 120px;
    overflow-y: auto;
  }
  .cw-textarea::placeholder { color: var(--text-3); }
  .cw-textarea:disabled { opacity: .6; cursor: not-allowed; }
  .cw-send {
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    border-radius: 9px;
    border: none;
    background: var(--accent);
    color: var(--accent-fg);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: opacity .15s, transform .1s;
  }
  .cw-send:disabled { opacity: .3; cursor: not-allowed; }
  .cw-send:not(:disabled):hover { opacity: .85; }
  .cw-send:not(:disabled):active { transform: scale(.92); }
  .cw-stop { background: var(--red); }
  .cw-powered {
    font-size: 10.5px;
    color: var(--text-3);
    text-align: center;
    letter-spacing: .01em;
  }

  /* ── Mobile ── */
  @media (max-width: 480px) {
    .cw-panel {
      right: 0;
      bottom: 0;
      width: 100vw;
      height: 75dvh;
      max-height: 75dvh;
      border-radius: 20px 20px 0 0;
      transform-origin: bottom center;
    }
    .cw-fab { bottom: 20px; right: 20px; }
    .cw-suggestions { grid-template-columns: 1fr; }
  }
`;
