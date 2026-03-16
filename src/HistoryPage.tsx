import { useState, useEffect } from "react";

const STORAGE_KEY = "mcp_invoke_history";

export type HistoryEntry = {
  id: string;
  tool: string;
  args: Record<string, string>;
  result: any;
  timestamp: string;
  duration: number;
  status: "success" | "error";
};

export function loadHistory(): HistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

export function addToHistory(entry: HistoryEntry) {
  const existing = loadHistory();
  const updated = [entry, ...existing].slice(0, 50);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

export function HistoryPage() {
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory());
  const [selectedEntry, setSelectedEntry] = useState<HistoryEntry | null>(null);
  const [filter, setFilter] = useState("all");

  // Poll localStorage every second so new entries from MCPClient appear instantly
  useEffect(() => {
    const interval = setInterval(() => {
      const latest = loadHistory();
      setHistory(latest);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const clearHistory = () => {
    localStorage.removeItem(STORAGE_KEY);
    setHistory([]);
    setSelectedEntry(null);
  };

  const uniqueTools = [...new Set(history.map((h) => h.tool))];

  const filtered =
    filter === "all"
      ? history
      : filter === "success"
      ? history.filter((h) => h.status === "success")
      : filter === "error"
      ? history.filter((h) => h.status === "error")
      : history.filter((h) => h.tool === filter);

  return (
    <div className="hist-page">

      {/* Header */}
      <div className="hist-header">
        <div>
          <h2>🗂️ Invocation History</h2>
          <p>All results from tools you call in the MCP Client above</p>
        </div>
        <div className="hist-header-right">
          <span className="hist-total">{history.length} total calls</span>
          {history.length > 0 && (
            <button className="hist-clear-btn" onClick={clearHistory}>
              🗑 Clear All
            </button>
          )}
        </div>
      </div>

      <div className="hist-body-simple">

        {/* Left — list */}
        <div className="hist-list-panel">

          {/* Filters */}
          <div className="hist-filter-bar">
            {["all", "success", "error", ...uniqueTools].map((f) => (
              <button
                key={f}
                className={`hist-filter-btn ${filter === f ? "active" : ""}`}
                onClick={() => setFilter(f)}
              >
                {f === "all" && `All (${history.length})`}
                {f === "success" && `✅ Success (${history.filter(h => h.status === "success").length})`}
                {f === "error" && `❌ Error (${history.filter(h => h.status === "error").length})`}
                {f !== "all" && f !== "success" && f !== "error" && (
                  `${f} (${history.filter(h => h.tool === f).length})`
                )}
              </button>
            ))}
          </div>

          {/* Empty state */}
          {filtered.length === 0 ? (
            <div className="hist-empty">
              <div className="hist-empty-icon">📭</div>
              <p>No results yet.</p>
              <p style={{ fontSize: "0.82em", color: "#bbb" }}>
                Use the <strong>MCP Client</strong> above to call a tool — results will appear here automatically.
              </p>
            </div>
          ) : (
            <div className="hist-list">
              {filtered.map((entry) => (
                <button
                  key={entry.id}
                  className={`hist-entry ${selectedEntry?.id === entry.id ? "active" : ""}`}
                  onClick={() => setSelectedEntry(entry)}
                >
                  <div className="hist-entry-top">
                    <span>{entry.status === "success" ? "✅" : "❌"}</span>
                    <span className="hist-entry-tool">{entry.tool}</span>
                    <span className="hist-entry-time">{entry.duration}ms</span>
                  </div>
                  <div className="hist-entry-args">
                    {Object.entries(entry.args).length === 0
                      ? "no args"
                      : Object.entries(entry.args).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                  </div>
                  <div className="hist-entry-ts">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right — detail */}
        <div className="hist-right">
          <div className="hist-result-title">Result Detail</div>
          {!selectedEntry ? (
            <div className="hist-result-empty">
              <div style={{ fontSize: "2.5em" }}>👈</div>
              <p>Click any entry to see its full result</p>
            </div>
          ) : (
            <div className="hist-result-detail">

              {/* Meta */}
              <div className="hist-result-meta">
                <div className="hrm-item">
                  <span className="hrm-label">Tool</span>
                  <span className="hrm-val tool">{selectedEntry.tool}</span>
                </div>
                <div className="hrm-item">
                  <span className="hrm-label">Status</span>
                  <span className={`hrm-val ${selectedEntry.status}`}>
                    {selectedEntry.status === "success" ? "✅ Success" : "❌ Error"}
                  </span>
                </div>
                <div className="hrm-item">
                  <span className="hrm-label">Duration</span>
                  <span className="hrm-val">{selectedEntry.duration}ms</span>
                </div>
                <div className="hrm-item">
                  <span className="hrm-label">Called At</span>
                  <span className="hrm-val">{new Date(selectedEntry.timestamp).toLocaleString()}</span>
                </div>
              </div>

              {/* Args */}
              <div className="hist-result-section">
                <div className="hrs-label">Input Arguments</div>
                {Object.keys(selectedEntry.args).length === 0 ? (
                  <div className="hrs-empty">No arguments</div>
                ) : (
                  <div className="hrs-args">
                    {Object.entries(selectedEntry.args).map(([k, v]) => (
                      <div key={k} className="hrs-arg-row">
                        <span className="hrs-arg-key">{k}</span>
                        <span className="hrs-arg-val">{v}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Result JSON */}
              <div className="hist-result-section">
                <div className="hrs-label">Response Data</div>
                <pre className="hrs-json">
                  {JSON.stringify(selectedEntry.result, null, 2)}
                </pre>
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}
