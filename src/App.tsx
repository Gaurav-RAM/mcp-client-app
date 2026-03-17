import { useMemo, useState } from "react";
import { MCPClient } from "./MCPClient";
import { HistoryPage } from "./HistoryPage";
import { GetAPIPage } from "./GetAPIPage";
import { ChatWidget } from "./ChatWidget";
import { getServerUrl } from "./serverUrl";

type TabId = "tools" | "history" | "getapi";

export function App() {
  const serverUrl = useMemo(() => getServerUrl(), []);
  const [tab, setTab] = useState<TabId>("tools");

  return (
    <div className="app-shell">
      <div className="container">
        <header className="app-header">
          <div className="app-brand">
            <div className="app-mark">MCP</div>
            <div>
              <h1 className="app-title">MCP React Client</h1>
              <p className="app-sub">
                Connected to <span className="app-mono">{serverUrl}</span>
              </p>
            </div>
          </div>
        </header>

        <nav className="app-tabs" aria-label="Primary">
          <button
            type="button"
            className={`app-tab ${tab === "tools" ? "active" : ""}`}
            onClick={() => setTab("tools")}
          >
            Tools
          </button>
          <button
            type="button"
            className={`app-tab ${tab === "history" ? "active" : ""}`}
            onClick={() => setTab("history")}
          >
            History
          </button>
          <button
            type="button"
            className={`app-tab ${tab === "getapi" ? "active" : ""}`}
            onClick={() => setTab("getapi")}
          >
            Get API
          </button>
        </nav>

        <main className="app-main">
          {tab === "tools" && <MCPClient />}
          {tab === "history" && <HistoryPage />}
          {tab === "getapi" && <GetAPIPage />}
        </main>

        <ChatWidget />
      </div>
    </div>
  );
}

