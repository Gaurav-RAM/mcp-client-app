import { useState, useRef, useEffect } from "react";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3001";

const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY || "";
const GROQ_API = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type Tool = {
  name: string;
  description: string;
  parameters: Record<string, string>;
};

function toGroqTool(tool: Tool) {
  const properties: Record<string, { type: string; description: string }> = {};
  for (const [key, val] of Object.entries(tool.parameters)) {
    const isNumber = val.toLowerCase().startsWith("number");
    properties[key] = {
      type: isNumber ? "number" : "string",
      description: key,
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

export function Chat() {
  const [tools, setTools] = useState<Tool[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [toolLog, setToolLog] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`${SERVER_URL}/tools`)
      .then((r) => r.json())
      .then((d) => setTools(d.tools ?? []))
      .catch(() => setTools([]));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, toolLog]);

  const invokeToolOnServer = async (
    name: string,
    args: Record<string, unknown>
  ) => {
    const res = await fetch(`${SERVER_URL}/invoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool: name, args }),
    });
    return res.json();
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    if (!GROQ_API_KEY) {
      setMessages((prev) => [
        ...prev,
        { role: "user", content: input },
        {
          role: "assistant",
          content:
            "❌ No API key found. Please set VITE_GROQ_API_KEY in your .env file.",
        },
      ]);
      setInput("");
      return;
    }

    const userMessage: Message = { role: "user", content: input.trim() };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setLoading(true);
    setToolLog([]);

    try {
      const groqTools = tools.map(toGroqTool);

      let apiMessages: any[] = [
        {
          role: "system",
          content:
            "You are a helpful assistant. You have access to tools. Always use a tool when the user's request matches one. Never calculate manually — always call the tool.",
        },
        ...updatedMessages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      ];

      let finalReply = "";

      while (true) {
        const response = await fetch(GROQ_API, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${GROQ_API_KEY}`,
          },
          body: JSON.stringify({
            model: GROQ_MODEL,
            messages: apiMessages,
            tools: groqTools,
            tool_choice: "auto",
            max_tokens: 1024,
            parallel_tool_calls: false,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.error?.message || "Groq API error");
        }

        const choice = data.choices?.[0];
        const assistantMessage = choice?.message;

        if (
          !assistantMessage?.tool_calls ||
          assistantMessage.tool_calls.length === 0
        ) {
          finalReply = assistantMessage?.content || "";
          break;
        }

        apiMessages.push(assistantMessage);

        for (const toolCall of assistantMessage.tool_calls) {
          const name = toolCall.function.name;
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(toolCall.function.arguments || "{}");
          } catch {
            args = {};
          }

          setToolLog((prev) => [
            ...prev,
            `🔧 Calling ${name} with ${JSON.stringify(args)}`,
          ]);

          const result = await invokeToolOnServer(name, args);

          setToolLog((prev) => [
            ...prev,
            `✅ ${name} returned: ${JSON.stringify(result)}`,
          ]);

          apiMessages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify(result),
          });
        }
      }

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: finalReply },
      ]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `❌ Error: ${err.message}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ai-chat">
      <div className="chat-header">
        <h2>🤖 AI Assistant (Groq)</h2>
        <p>Llama 3.3 will automatically use your {tools.length} MCP tools</p>
      </div>

      {toolLog.length > 0 && (
        <div className="tool-log">
          {toolLog.map((log, i) => (
            <div key={i} className="tool-log-entry">{log}</div>
          ))}
        </div>
      )}

      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-placeholder">
            <p>👋 Ask me anything! I can use your tools automatically.</p>
            <p>Try: <em>"What is 128 divided by 4?"</em></p>
            <p>Try: <em>"Convert 100 USD to INR"</em></p>
            <p>Try: <em>"Generate a 16 character password"</em></p>
            <p>Try: <em>"How many words are in: The quick brown fox"</em></p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`chat-bubble ${msg.role}`}>
            <span className="bubble-label">
              {msg.role === "user" ? "You" : "Llama 3.3"}
            </span>
            <div className="bubble-text">{msg.content}</div>
          </div>
        ))}
        {loading && (
          <div className="chat-bubble assistant">
            <span className="bubble-label">AI</span>
            <div className="bubble-text typing">Thinking…</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="chat-input-row">
        <input
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          placeholder="Ask your question.."
          disabled={loading}
        />
        <button
          className="chat-send-btn"
          onClick={sendMessage}
          disabled={loading || !input.trim()}
        >
          Send
        </button>
      </div>
    </div>
  );
}
