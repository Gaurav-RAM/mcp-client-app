/**
 * ChatWidget.tsx — Complete self-contained AI chat popup
 *
 * ✅ All config, API logic, UI in ONE file
 * ✅ Auto-opens 2s after page load with a chime sound
 * ✅ "May I help you?" greeting banner
 * ✅ Fixed bottom-right popup with FAB launcher
 *
 * Usage:  import { ChatWidget } from "./ChatWidget";
 *         <ChatWidget />   (replace your old <Chat /> anywhere in your app)
 */

import { useState, useRef, useEffect, useCallback } from "react";

// ─── Config — edit these ─────────────────────────────────────────────────────
import { getServerUrl } from "./serverUrl";

const SERVER_URL   = getServerUrl();
const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY || "";
const GROQ_API     = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL   = "llama-3.3-70b-versatile";

const AUTO_OPEN_DELAY   = 2000; // ms before popup auto-opens on page load
const MAX_TOOL_ITERS    = 10;   // safety cap on tool call loops

// ─── Types ───────────────────────────────────────────────────────────────────
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

type GroqMsg =
  | { role: "system" | "user" | "assistant"; content: string }
  | { role: "assistant"; content: null; tool_calls: GroqToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

type GroqToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 10);

const formatTime = (d: Date) =>
  d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function toGroqSchema(tool: Tool) {
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

// ─── Sound — soft 3-note chime via Web Audio API (no file needed) ─────────────
function playChime() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const play = (freq: number, start: number, dur: number, vol: number) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(vol, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
      osc.start(start);
      osc.stop(start + dur);
    };
    const t = ctx.currentTime;
    play(880,  t,        0.5, 0.14);
    play(1108, t + 0.13, 0.5, 0.11);
    play(1318, t + 0.26, 0.6, 0.09);
  } catch { /* silently ignore if browser blocks audio */ }
}

// ─── API ─────────────────────────────────────────────────────────────────────
async function fetchTools(): Promise<Tool[]> {
  const res = await fetch(`${SERVER_URL}/tools`);
  if (!res.ok) throw new Error(`Tools fetch failed: ${res.statusText}`);
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

async function callGroq(messages: GroqMsg[], tools: Tool[]) {
  const res = await fetch(GROQ_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      tools: tools.map(toGroqSchema),
      tool_choice: tools.length > 0 ? "auto" : "none",
      max_tokens: 1024,
      parallel_tool_calls: false,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "Groq API error");
  return data.choices?.[0]?.message;
}

// ─── Suggestions ──────────────────────────────────────────────────────────────
const SUGGESTIONS = [
  "What is 128 divided by 4?",
  "Convert 100 USD to INR",
  "Generate a 16-character password",
  "How many words in: The quick brown fox?",
];

// ─── Sub-components ───────────────────────────────────────────────────────────
function ToolAccordion({ calls }: { calls: ToolCallEntry[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="cw-tool-wrap">
      <button className="cw-tool-trigger" onClick={() => setOpen(o => !o)}>
        <span>⚙</span>
        <span>Used {calls.length} tool{calls.length !== 1 ? "s" : ""}</span>
        <span className={`cw-caret ${open ? "cw-caret-open" : ""}`}>›</span>
      </button>
      {open && (
        <div className="cw-tool-list">
          {calls.map((c, i) => (
            <div key={i} className="cw-tool-item">
              <div className="cw-tool-item-head">
                <code>{c.name}</code>
                <span>{c.durationMs}ms</span>
              </div>
              <div className="cw-tool-kv">
                <span className="cw-kv-label">Args</span>
                <pre>{JSON.stringify(c.args, null, 2)}</pre>
              </div>
              <div className="cw-tool-kv">
                <span className="cw-kv-label">Result</span>
                <pre>{JSON.stringify(c.result, null, 2)}</pre>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Bubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <div className={`cw-row ${isUser ? "cw-row-user" : "cw-row-ai"}`}>
      {!isUser && <div className="cw-ai-pip">AI</div>}
      <div className={`cw-bubble ${isUser ? "cw-bubble-user" : "cw-bubble-ai"} ${msg.isError ? "cw-bubble-err" : ""}`}>
        {msg.toolCalls?.length ? <ToolAccordion calls={msg.toolCalls} /> : null}
        <p className="cw-bubble-text">{msg.content}</p>
        <span className="cw-bubble-ts">{formatTime(msg.timestamp)}</span>
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="cw-row cw-row-ai">
      <div className="cw-ai-pip">AI</div>
      <div className="cw-bubble cw-bubble-ai cw-typing">
        <span className="cw-dot"/><span className="cw-dot"/><span className="cw-dot"/>
      </div>
    </div>
  );
}

// ─── Main ChatWidget ──────────────────────────────────────────────────────────
export function ChatWidget() {
  // popup state
  const [open, setOpen]                       = useState(false);
  const [greetingDismissed, setGreetingDismissed] = useState(false);
  const [unread, setUnread]                   = useState(0);
  const hasAutoOpened                         = useRef(false);

  // chat state
  const [tools, setTools]         = useState<Tool[]>([]);
  const [toolsError, setToolsError] = useState(false);
  const [toolsReady, setToolsReady] = useState(false);
  const [messages, setMessages]   = useState<Message[]>([]);
  const [input, setInput]         = useState("");
  const [loading, setLoading]     = useState(false);

  const bottomRef  = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLTextAreaElement>(null);
  const abortRef   = useRef<AbortController | null>(null);

  // Load tools
  useEffect(() => {
    fetchTools()
      .then(t  => { setTools(t); setToolsReady(true); })
      .catch(() => { setToolsError(true); setToolsReady(true); });
  }, []);

  // Auto-open after delay
  useEffect(() => {
    if (hasAutoOpened.current) return;
    const t = setTimeout(() => {
      hasAutoOpened.current = true;
      playChime();
      setOpen(true);
    }, AUTO_OPEN_DELAY);
    return () => clearTimeout(t);
  }, []);

  // Focus input when panel opens
  useEffect(() => {
    if (open) {
      setUnread(0);
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [open]);

  // Scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Escape to close
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape" && open) setOpen(false); };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [open]);

  const handleOpen = () => {
    if (!open) playChime();
    setOpen(true);
    setUnread(0);
  };

  const handleClose = () => setOpen(false);

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
  };

  // Send message
  const sendMessage = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || loading) return;

    // No API key guard
    if (!GROQ_API_KEY) {
      setMessages(prev => [
        ...prev,
        { id: uid(), role: "user",      content: text, timestamp: new Date() },
        { id: uid(), role: "assistant", content: "No GROQ API key found. Please set VITE_GROQ_API_KEY in your .env file.", timestamp: new Date(), isError: true },
      ]);
      setInput("");
      return;
    }

    const userMsg: Message = { id: uid(), role: "user", content: text, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    setLoading(true);
    abortRef.current = new AbortController();

    const history: GroqMsg[] = [
      { role: "system", content: "You are a helpful, concise AI assistant. Use tools whenever the user's request matches one. Never calculate manually — always call the tool. Be brief and direct." },
      ...messages.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user", content: text },
    ];

    try {
      const collectedCalls: ToolCallEntry[] = [];
      let iterations = 0, finalContent = "";

      while (iterations < MAX_TOOL_ITERS) {
        iterations++;
        const message = await callGroq(history, tools);
        if (!message) throw new Error("Empty response from Groq");

        if (!message.tool_calls?.length) {
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

          collectedCalls.push({
            name: tc.function.name, args, result,
            durationMs: Math.round(performance.now() - t0),
          });
          history.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) });
        }
      }

      if (!finalContent && iterations >= MAX_TOOL_ITERS)
        finalContent = "Reached maximum tool iterations without a final answer.";

      const reply: Message = {
        id: uid(), role: "assistant", content: finalContent, timestamp: new Date(),
        toolCalls: collectedCalls.length > 0 ? collectedCalls : undefined,
      };
      setMessages(prev => [...prev, reply]);
      if (!open) setUnread(n => n + 1);

    } catch (err: any) {
      if (err.name === "AbortError") return;
      setMessages(prev => [
        ...prev,
        { id: uid(), role: "assistant", content: `Error: ${err.message}`, timestamp: new Date(), isError: true },
      ]);
    } finally {
      setLoading(false);
      abortRef.current = null;
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [input, loading, messages, tools, open]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const stopGeneration = () => { abortRef.current?.abort(); setLoading(false); };
  const clearChat      = () => { if (!loading) setMessages([]); };

  const isEmpty = messages.length === 0;

  return (
    <>
      <style>{CSS}</style>

      {/* ── Greeting bubble above FAB (when panel is closed) ── */}
      {!open && !greetingDismissed && (
        <div className="cw-greeting" onClick={handleOpen}>
          <div className="cw-greeting-avatar">✦</div>
          <div className="cw-greeting-body">
            <p className="cw-greeting-name">AI Assistant</p>
            <p className="cw-greeting-text">👋 May I help you today?</p>
          </div>
          <button
            className="cw-greeting-x"
            onClick={e => { e.stopPropagation(); setGreetingDismissed(true); }}
          >✕</button>
        </div>
      )}

      {/* ── Panel ── */}
      <div
        className={`cw-panel ${open ? "cw-panel-open" : "cw-panel-closed"}`}
        role="dialog"
        aria-label="AI Assistant"
        aria-hidden={!open}
      >
        {/* Header */}
        <div className="cw-header">
          <div className="cw-header-brand">
            <div className="cw-header-avatar">✦</div>
            <div>
              <div className="cw-header-name">AI Assistant</div>
              <div className="cw-header-sub">
                <span className="cw-online-dot"/>
                {!toolsReady ? "Connecting…"
                  : toolsError ? "⚠ Tool server offline"
                  : tools.length > 0 ? `${tools.length} tool${tools.length !== 1 ? "s" : ""} ready`
                  : "Online · Llama 3.3"}
              </div>
            </div>
          </div>
          <div className="cw-header-actions">
            {messages.length > 0 && (
              <button className="cw-icon-btn" onClick={clearChat} disabled={loading} title="Clear chat">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-1 14H6L5 6"/>
                  <path d="M10 11v6M14 11v6M9 6V4h6v2"/>
                </svg>
              </button>
            )}
            <button className="cw-icon-btn" onClick={handleClose} title="Close (Esc)">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Welcome banner — dismissable */}
        {!greetingDismissed && (
          <div className="cw-welcome">
            <span className="cw-welcome-wave">👋</span>
            <div className="cw-welcome-copy">
              <strong>May I help you today?</strong>
              <p>Ask me anything — I'll use your tools automatically.</p>
            </div>
            <button className="cw-welcome-x" onClick={() => setGreetingDismissed(true)}>✕</button>
          </div>
        )}

        {/* Messages */}
        <main className="cw-messages" role="log" aria-live="polite">
          {isEmpty && (
            <div className="cw-empty">
              <div className="cw-empty-icon">✦</div>
              <p className="cw-empty-title">How can I help?</p>
              <p className="cw-empty-sub">Pick a suggestion or type your question below.</p>
              <div className="cw-suggestions">
                {SUGGESTIONS.map(s => (
                  <button key={s} className="cw-suggestion" onClick={() => sendMessage(s)} disabled={loading}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map(msg => <Bubble key={msg.id} msg={msg} />)}
          {loading && <TypingIndicator />}
          <div ref={bottomRef} />
        </main>

        {/* Input */}
        <div className="cw-footer">
          <div className="cw-input-shell">
            <textarea
              ref={inputRef}
              className="cw-input"
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Ask me anything… (Enter to send)"
              disabled={loading}
              rows={1}
              aria-label="Message input"
            />
            {loading ? (
              <button className="cw-send cw-send-stop" onClick={stopGeneration} title="Stop">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="4" y="4" width="16" height="16" rx="2"/>
                </svg>
              </button>
            ) : (
              <button className="cw-send" onClick={() => sendMessage()} disabled={!input.trim()}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="19" x2="12" y2="5"/>
                  <polyline points="5 12 12 5 19 12"/>
                </svg>
              </button>
            )}
          </div>
          <p className="cw-hint">Shift+Enter for new line · Powered by Groq</p>
        </div>
      </div>

      {/* ── FAB ── */}
      <button
        className={`cw-fab ${open ? "cw-fab-open" : ""}`}
        onClick={() => open ? handleClose() : handleOpen()}
        aria-label={open ? "Close assistant" : "Open AI assistant"}
        aria-expanded={open}
      >
        {!open && <span className="cw-fab-ripple"/>}
        <span className="cw-fab-icon cw-fab-chat">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </span>
        <span className="cw-fab-icon cw-fab-close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </span>
        {unread > 0 && <span className="cw-badge">{unread > 9 ? "9+" : unread}</span>}
      </button>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&family=DM+Mono:wght@400&display=swap');

:root {
  --cw-ink:    #111;
  --cw-ink2:   #555;
  --cw-ink3:   #999;
  --cw-ink4:   #bbb;
  --cw-paper:  #fff;
  --cw-paper2: #f7f7f5;
  --cw-paper3: #f1f0eb;
  --cw-border: #e8e7e2;
  --cw-border2:#f0efe9;
  --cw-accent: #111;
  --cw-accent2:#764ba2;
  --cw-accent3:#667eea;
  --cw-green:  #16a34a;
  --cw-red:    #dc2626;
  --cw-r:      16px;
  --cw-r-sm:   9px;
  --cw-font:   'DM Sans', system-ui, sans-serif;
  --cw-mono:   'DM Mono', monospace;
  --cw-shadow: 0 24px 64px rgba(0,0,0,.17), 0 6px 20px rgba(0,0,0,.1), 0 1px 4px rgba(0,0,0,.06);
  --cw-fab-sh: 0 14px 38px rgba(17, 24, 39, .28), 0 6px 16px rgba(17, 24, 39, .18);
}

/* ── FAB ── */
.cw-fab {
  position:fixed; bottom:28px; right:28px; z-index:9999;
  width:60px; height:60px; border-radius:50%;
  background:linear-gradient(135deg, var(--cw-accent3), var(--cw-accent2));
  border:none; cursor:pointer;
  display:flex; align-items:center; justify-content:center;
  box-shadow:var(--cw-fab-sh); outline:none;
  transition:transform .25s cubic-bezier(.34,1.56,.64,1), box-shadow .2s;
}
.cw-fab:hover  { transform:scale(1.07); box-shadow:0 18px 52px rgba(17,24,39,.32), 0 6px 18px rgba(17,24,39,.18); }
.cw-fab:active { transform:scale(.94); }
.cw-fab:focus-visible { box-shadow:var(--cw-fab-sh),0 0 0 3px rgba(255,255,255,.55),0 0 0 6px rgba(118,75,162,.65); }

.cw-fab-ripple {
  position:absolute; width:60px; height:60px; border-radius:50%;
  border:2px solid rgba(255,255,255,.35);
  animation:cw-ripple 2s ease-out infinite; pointer-events:none;
}
@keyframes cw-ripple {
  0%   { transform:scale(1);   opacity:.7; }
  100% { transform:scale(2);   opacity:0;  }
}

.cw-fab-icon {
  position:absolute; display:flex; align-items:center; justify-content:center;
  transition:opacity .2s, transform .25s cubic-bezier(.34,1.56,.64,1);
}
.cw-fab-chat  { opacity:1; transform:scale(1) rotate(0deg); }
.cw-fab-close { opacity:0; transform:scale(.4) rotate(-80deg); }
.cw-fab.cw-fab-open .cw-fab-chat  { opacity:0; transform:scale(.4) rotate(80deg); }
.cw-fab.cw-fab-open .cw-fab-close { opacity:1; transform:scale(1) rotate(0deg); }

.cw-badge {
  position:absolute; top:-2px; right:-2px;
  min-width:19px; height:19px; border-radius:10px;
  background:#ef4444; color:#fff;
  font-family:var(--cw-font); font-size:10px; font-weight:600;
  display:flex; align-items:center; justify-content:center;
  padding:0 4px; border:2.5px solid #fff; pointer-events:none;
}

/* ── Greeting bubble ── */
.cw-greeting {
  position:fixed; bottom:104px; right:28px; z-index:9998;
  background:rgba(255,255,255,.92);
  border:1px solid rgba(255,255,255,.55);
  border-radius:20px; padding:12px 12px;
  display:flex; align-items:center; gap:11px;
  box-shadow:0 18px 55px rgba(17,24,39,.22),0 6px 16px rgba(17,24,39,.12);
  cursor:pointer; max-width:320px;
  font-family:var(--cw-font);
  animation:cw-popUp .4s cubic-bezier(.34,1.56,.64,1);
  transition:box-shadow .2s, transform .2s, background .2s, border-color .2s;
  backdrop-filter: blur(10px);
}
.cw-greeting:hover {
  background:rgba(255,255,255,.97);
  border-color:rgba(255,255,255,.75);
  box-shadow:0 22px 70px rgba(17,24,39,.26),0 8px 20px rgba(17,24,39,.14);
  transform:translateY(-2px);
}
.cw-greeting::after {
  content:''; position:absolute; bottom:-7px; right:24px;
  width:13px; height:13px; background:rgba(255,255,255,.92);
  border-right:1px solid rgba(255,255,255,.55);
  border-bottom:1px solid rgba(255,255,255,.55);
  transform:rotate(45deg);
}
@keyframes cw-popUp {
  from { opacity:0; transform:translateY(14px) scale(.92); }
  to   { opacity:1; transform:translateY(0)    scale(1);   }
}
.cw-greeting-avatar {
  width:40px; height:40px; border-radius:14px;
  background:linear-gradient(135deg, var(--cw-accent3), var(--cw-accent2));
  color:#fff;
  display:flex; align-items:center; justify-content:center;
  font-size:16px; flex-shrink:0;
  box-shadow:0 10px 26px rgba(17,24,39,.22);
}
.cw-greeting-body { flex:1; min-width:0; }
.cw-greeting-name {
  font-size:10px; font-weight:800; text-transform:uppercase;
  letter-spacing:.08em; color:rgba(17,24,39,.45); margin-bottom:2px;
}
.cw-greeting-text { font-size:14px; font-weight:650; color:#111827; line-height:1.25; }
.cw-greeting-x {
  width:26px; height:26px; border-radius:10px; border:none; background:none;
  cursor:pointer; display:flex; align-items:center; justify-content:center;
  color:rgba(17,24,39,.45); font-size:12px; flex-shrink:0;
  transition:background .12s, color .12s;
}
.cw-greeting-x:hover { background:rgba(102,126,234,.10); color:#111827; }

/* ── Panel ── */
.cw-panel {
  position:fixed; bottom:104px; right:28px; z-index:9998;
  width:400px; height:600px; max-height:calc(100dvh - 120px);
  background:var(--cw-paper); border:1px solid var(--cw-border);
  border-radius:26px;
  box-shadow:0 26px 80px rgba(17,24,39,.22), 0 10px 26px rgba(17,24,39,.12);
  display:flex; flex-direction:column; overflow:hidden;
  font-family:var(--cw-font); color:var(--cw-ink);
  transform-origin:bottom right;
  transition:opacity .24s ease, transform .3s cubic-bezier(.34,1.56,.64,1);
}
.cw-panel-closed { opacity:0; transform:scale(.86) translateY(20px); pointer-events:none; }
.cw-panel-open   { opacity:1; transform:scale(1)   translateY(0);    pointer-events:all;  }

/* Header */
.cw-header {
  display:flex; align-items:center; justify-content:space-between;
  padding:14px 16px; border-bottom:1px solid var(--cw-border);
  background:var(--cw-paper); flex-shrink:0;
}
.cw-header-brand { display:flex; align-items:center; gap:10px; }
.cw-header-avatar {
  width:40px; height:40px; border-radius:13px;
  background:linear-gradient(135deg, var(--cw-accent3), var(--cw-accent2));
  color:#fff;
  display:flex; align-items:center; justify-content:center;
  font-size:17px; flex-shrink:0;
}
.cw-header-name { font-size:14px; font-weight:750; color:var(--cw-ink); letter-spacing:-.01em; }
.cw-header-sub {
  font-size:11.5px; color:var(--cw-ink3); margin-top:2px;
  display:flex; align-items:center; gap:5px;
}
.cw-online-dot {
  width:6px; height:6px; border-radius:50%; background:var(--cw-green);
  animation:cw-pulse 2.5s ease-in-out infinite;
}
@keyframes cw-pulse {
  0%,100% { box-shadow:0 0 0 2px rgba(22,163,74,.2); }
  50%      { box-shadow:0 0 0 5px rgba(22,163,74,.07); }
}
.cw-header-actions { display:flex; gap:4px; }
.cw-icon-btn {
  width:30px; height:30px; border-radius:8px; border:none; background:none;
  cursor:pointer; display:flex; align-items:center; justify-content:center;
  color:var(--cw-ink3); transition:background .12s, color .12s;
}
.cw-icon-btn:hover:not(:disabled) { background:var(--cw-paper2); color:var(--cw-ink); }
.cw-icon-btn:disabled { opacity:.4; cursor:not-allowed; }

/* Welcome banner */
.cw-welcome {
  display:flex; align-items:flex-start; gap:10px;
  padding:11px 16px; background:#f0fdf4; border-bottom:1px solid #bbf7d0;
  flex-shrink:0; animation:cw-slideDown .4s ease .3s both;
}
@keyframes cw-slideDown {
  from { opacity:0; transform:translateY(-8px); }
  to   { opacity:1; transform:translateY(0);    }
}
.cw-welcome-wave { font-size:20px; flex-shrink:0; line-height:1; margin-top:1px; }
.cw-welcome-copy { flex:1; min-width:0; }
.cw-welcome-copy strong { display:block; font-size:13px; font-weight:600; color:#15803d; margin-bottom:2px; }
.cw-welcome-copy p     { font-size:12px; color:#166534; line-height:1.4; }
.cw-welcome-x {
  width:20px; height:20px; border-radius:50%; border:none; background:none;
  cursor:pointer; display:flex; align-items:center; justify-content:center;
  color:#4ade80; font-size:11px; flex-shrink:0; margin-top:1px;
  transition:background .12s, color .12s;
}
.cw-welcome-x:hover { background:#dcfce7; color:#15803d; }

/* Messages */
.cw-messages {
  flex:1; overflow-y:auto; padding:14px;
  display:flex; flex-direction:column; gap:4px; scroll-behavior:smooth;
}
.cw-messages::-webkit-scrollbar { width:3px; }
.cw-messages::-webkit-scrollbar-thumb { background:var(--cw-border); border-radius:4px; }

/* Empty state */
.cw-empty {
  flex:1; display:flex; flex-direction:column;
  align-items:center; justify-content:center;
  text-align:center; gap:6px; padding:30px 16px;
}
.cw-empty-icon { font-size:28px; opacity:.25; margin-bottom:4px; }
.cw-empty-title { font-size:15px; font-weight:600; color:var(--cw-ink); letter-spacing:-.01em; }
.cw-empty-sub   { font-size:12.5px; color:var(--cw-ink3); margin-bottom:12px; }
.cw-suggestions { display:grid; grid-template-columns:1fr 1fr; gap:7px; width:100%; }
.cw-suggestion {
  font-family:var(--cw-font); font-size:12px; text-align:left;
  background:var(--cw-paper); border:1px solid var(--cw-border);
  border-radius:10px; padding:9px 11px; cursor:pointer;
  color:var(--cw-ink2); line-height:1.4;
  transition:border-color .12s, color .12s, box-shadow .12s, transform .1s;
}
.cw-suggestion:hover:not(:disabled) {
  border-color:#bbb; color:var(--cw-ink);
  box-shadow:0 2px 8px rgba(0,0,0,.07); transform:translateY(-1px);
}
.cw-suggestion:disabled { opacity:.5; cursor:not-allowed; }

/* Message rows */
.cw-row {
  display:flex; align-items:flex-end; gap:7px;
  max-width:100%; margin-bottom:4px;
  animation:cw-msgUp .16s ease;
}
@keyframes cw-msgUp {
  from { opacity:0; transform:translateY(6px); }
  to   { opacity:1; transform:translateY(0);   }
}
.cw-row-user { flex-direction:row-reverse; }
.cw-row-ai   { flex-direction:row; }

.cw-ai-pip {
  flex-shrink:0; width:26px; height:26px; border-radius:50%;
  background:var(--cw-accent); color:#fff;
  display:flex; align-items:center; justify-content:center;
  font-size:9px; font-weight:700; font-family:var(--cw-font);
}
.cw-bubble {
  max-width:80%; padding:9px 12px; border-radius:var(--cw-r);
  display:flex; flex-direction:column; gap:6px;
}
.cw-bubble-user { background:var(--cw-accent); color:#fff; border-bottom-right-radius:4px; }
.cw-bubble-ai   { background:var(--cw-paper3); color:var(--cw-ink); border-bottom-left-radius:4px; }
.cw-bubble-err  { background:#fff5f5 !important; color:#b91c1c !important; border:1px solid #fecaca; }
.cw-bubble-text { font-size:13.5px; line-height:1.6; white-space:pre-wrap; word-break:break-word; }
.cw-bubble-ts   { font-size:10px; opacity:.38; align-self:flex-end; margin-top:-2px; }

/* Typing dots */
.cw-typing { padding:12px 16px; flex-direction:row !important; align-items:center; gap:4px; }
.cw-dot {
  display:inline-block; width:5px; height:5px; border-radius:50%;
  background:var(--cw-ink3); animation:cw-bounce 1.2s ease-in-out infinite;
}
.cw-dot:nth-child(2) { animation-delay:.2s; }
.cw-dot:nth-child(3) { animation-delay:.4s; }
@keyframes cw-bounce {
  0%,80%,100% { transform:translateY(0);    opacity:.4; }
  40%          { transform:translateY(-4px); opacity:1;  }
}

/* Tool accordion */
.cw-tool-wrap {
  border:1px solid var(--cw-border); border-radius:var(--cw-r-sm);
  overflow:hidden; background:var(--cw-paper);
}
.cw-tool-trigger {
  display:flex; align-items:center; gap:5px;
  width:100%; padding:6px 9px; background:none; border:none;
  cursor:pointer; font-family:var(--cw-font); font-size:11.5px;
  color:var(--cw-ink3); text-align:left; transition:background .1s;
}
.cw-tool-trigger:hover { background:var(--cw-paper2); }
.cw-caret { margin-left:auto; font-size:15px; transition:transform .2s; display:inline-block; }
.cw-caret-open { transform:rotate(90deg); }
.cw-tool-list { border-top:1px solid var(--cw-border); }
.cw-tool-item {
  padding:7px 9px; display:flex; flex-direction:column; gap:4px;
  border-bottom:1px solid var(--cw-border2);
}
.cw-tool-item:last-child { border-bottom:none; }
.cw-tool-item-head { display:flex; justify-content:space-between; align-items:center; }
.cw-tool-item-head code {
  font-family:var(--cw-mono); font-size:11px;
  background:var(--cw-paper2); padding:2px 5px; border-radius:4px; color:var(--cw-ink);
}
.cw-tool-item-head span { font-family:var(--cw-mono); font-size:10px; color:var(--cw-ink4); }
.cw-tool-kv { display:flex; flex-direction:column; gap:2px; }
.cw-kv-label {
  font-size:9.5px; font-weight:600; text-transform:uppercase;
  letter-spacing:.06em; color:var(--cw-ink4);
}
.cw-tool-kv pre {
  font-family:var(--cw-mono); font-size:10.5px; color:var(--cw-ink3);
  background:var(--cw-paper2); padding:5px 7px; border-radius:5px;
  white-space:pre-wrap; word-break:break-all; max-height:90px; overflow-y:auto;
}

/* Footer / Input */
.cw-footer {
  padding:10px 14px 12px; border-top:1px solid var(--cw-border);
  flex-shrink:0; display:flex; flex-direction:column; gap:5px;
  background:var(--cw-paper);
}
.cw-input-shell {
  display:flex; align-items:flex-end; gap:8px;
  background:var(--cw-paper2); border:1.5px solid var(--cw-border);
  border-radius:14px; padding:8px 8px 8px 13px;
  transition:border-color .15s, box-shadow .15s;
}
.cw-input-shell:focus-within {
  border-color:#c0bfb8;
  box-shadow:0 0 0 3px rgba(0,0,0,.04);
  background:var(--cw-paper);
}
.cw-input {
  flex:1; font-family:var(--cw-font); font-size:13.5px; line-height:1.5;
  color:var(--cw-ink); background:transparent; border:none; outline:none;
  resize:none; min-height:22px; max-height:140px; overflow-y:auto;
}
.cw-input::placeholder { color:var(--cw-ink4); }
.cw-input:disabled     { opacity:.6; cursor:not-allowed; }
.cw-send {
  flex-shrink:0; width:32px; height:32px; border-radius:9px;
  border:none; background:var(--cw-accent); color:#fff;
  display:flex; align-items:center; justify-content:center;
  cursor:pointer; transition:opacity .15s, transform .1s;
}
.cw-send:disabled          { opacity:.28; cursor:not-allowed; }
.cw-send:not(:disabled):hover  { opacity:.82; }
.cw-send:not(:disabled):active { transform:scale(.9); }
.cw-send-stop { background:var(--cw-red); }
.cw-hint { font-size:10.5px; color:var(--cw-ink4); text-align:center; }

/* Mobile */
@media (max-width:480px) {
  .cw-panel {
    right:0; bottom:0; width:100vw;
    height:80dvh; max-height:80dvh;
    border-radius:22px 22px 0 0; transform-origin:bottom center;
  }
  .cw-fab       { bottom:20px; right:20px; }
  .cw-greeting  { right:20px; bottom:96px; max-width:calc(100vw - 40px); }
  .cw-suggestions { grid-template-columns:1fr; }
}
`;
