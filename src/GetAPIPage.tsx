import { useEffect, useState } from "react";

import { getServerUrl } from "./serverUrl";

const SERVER_URL = getServerUrl();
const ENDPOINTS = [
  {
    id: "tools",
    label: "All Tools",
    url: `${SERVER_URL}/tools`,
    description: "Basic list of all registered MCP tools",
    color: "#6366f1",
  },
  {
    id: "tools-all",
    label: "Tools Full Detail",
    url: `${SERVER_URL}/tools/all`,
    description: "All tools with parameters, examples & metadata",
    color: "#8b5cf6",
  },
  {
    id: "health",
    label: "Health Check",
    url: `${SERVER_URL}/health`,
    description: "Server status, uptime and tool names",
    color: "#22c55e",
  },
];

type EndpointResult = {
  id: string;
  url: string;
  data: any;
  status: number;
  time: number;
  loading: boolean;
  error: string | null;
};

export function GetAPIPage() {
  const [results, setResults] = useState<Record<string, EndpointResult>>({});
  const [activeId, setActiveId] = useState<string>("tools-all");
  const [copied, setCopied] = useState(false);
  const [fetchingAll, setFetchingAll] = useState(false);

  const readBodySafe = async (res: Response) => {
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      return await res.json().catch(() => null);
    }
    const text = await res.text().catch(() => "");
    return text ? { message: text.slice(0, 2000) } : null;
  };

  const callEndpoint = async (ep: (typeof ENDPOINTS)[number]) => {
    setResults((prev) => ({
      ...prev,
      [ep.id]: {
        id: ep.id,
        url: ep.url,
        data: null,
        status: 0,
        time: 0,
        loading: true,
        error: null,
      },
    }));

    const start = Date.now();
    try {
      const res = await fetch(ep.url);
      const data = await readBodySafe(res);
      if (!res.ok) {
        const msg =
          (data as any)?.error ||
          (data as any)?.message ||
          res.statusText ||
          `HTTP ${res.status}`;
        throw new Error(msg);
      }
      setResults((prev) => ({
        ...prev,
        [ep.id]: {
          id: ep.id,
          url: ep.url,
          data,
          status: res.status,
          time: Date.now() - start,
          loading: false,
          error: null,
        },
      }));
    } catch (err: any) {
      setResults((prev) => ({
        ...prev,
        [ep.id]: {
          id: ep.id,
          url: ep.url,
          data: null,
          status: 0,
          time: Date.now() - start,
          loading: false,
          error:
            err?.message ||
            "Failed to fetch — check VITE_SERVER_URL or your server/CORS settings.",
        },
      }));
    }
  };

  const callAll = async () => {
    setFetchingAll(true);
    await Promise.all(ENDPOINTS.map(callEndpoint));
    setFetchingAll(false);
  };

  useEffect(() => {
    callAll();
  }, []);

  const active = ENDPOINTS.find((e) => e.id === activeId)!;
  const activeResult = results[activeId];

  const copyJSON = () => {
    if (!activeResult?.data) return;
    navigator.clipboard.writeText(JSON.stringify(activeResult.data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="gap-page">
      {/* ── Header ── */}
      <div className="gap-header">
        <div className="gap-header-left">
          <div className="gap-logo">
            <span className="gap-logo-icon">⚡</span>
            <div>
              <h1>GET API Dashboard</h1>
              <p>Live data from your MCP server endpoints</p>
            </div>
          </div>
        </div>
        <button
          className={`gap-fetch-all ${fetchingAll ? "loading" : ""}`}
          onClick={callAll}
          disabled={fetchingAll}
        >
          {fetchingAll ? (
            <><span className="spin-icon">↻</span> Fetching…</>
          ) : (
            <>🔄 Refresh All</>
          )}
        </button>
      </div>

      {/* ── Endpoint Cards ── */}
      <div className="gap-endpoint-row">
        {ENDPOINTS.map((ep) => {
          const r = results[ep.id];
          return (
            <button
              key={ep.id}
              className={`gap-ep-card ${activeId === ep.id ? "active" : ""} ${r?.error ? "errored" : ""}`}
              onClick={() => { setActiveId(ep.id); if (!r) callEndpoint(ep); }}
              style={{ "--ep-color": ep.color } as any}
            >
              <div className="gap-ep-top">
                <span className="gap-method">GET</span>
                {r?.loading && <span className="gap-loading-dot" />}
                {r && !r.loading && !r.error && (
                  <span className="gap-status ok">{r.status}</span>
                )}
                {r?.error && <span className="gap-status err">ERR</span>}
              </div>
              <div className="gap-ep-label">{ep.label}</div>
              <div className="gap-ep-url">{ep.url.replace(SERVER_URL, "")}</div>
              {r && !r.loading && !r.error && (
                <div className="gap-ep-time">{r.time}ms</div>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Main Panel ── */}
      <div className="gap-main">

        {/* Left — request info */}
        <div className="gap-left">
          <div className="gap-section-label">Request</div>

          <div className="gap-request-box">
            <div className="gap-request-method">GET</div>
            <div className="gap-request-url">{active.url}</div>
            <button
              className="gap-open-btn"
              onClick={() => window.open(active.url, "_blank")}
            >↗ Open
            </button>
          </div>

          <div className="gap-desc">{active.description}</div>

          <div className="gap-section-label" style={{ marginTop: 20 }}>Response Info</div>
          {activeResult ? (
            <div className="gap-meta-grid">
              <div className="gap-meta-item">
                <span className="meta-label">Status</span>
                <span className={`meta-val ${activeResult.error ? "red" : "green"}`}>
                  {activeResult.error ? "Error" : activeResult.status + " OK"}
                </span>
              </div>
              <div className="gap-meta-item">
                <span className="meta-label">Time</span>
                <span className="meta-val">{activeResult.time}ms</span>
              </div>
              <div className="gap-meta-item">
                <span className="meta-label">Format</span>
                <span className="meta-val">JSON</span>
              </div>
              <div className="gap-meta-item">
                <span className="meta-label">Size</span>
                <span className="meta-val">
                  {activeResult.data
                    ? (JSON.stringify(activeResult.data).length / 1024).toFixed(1) + " KB"
                    : "—"}
                </span>
              </div>
            </div>
          ) : (
            <div className="gap-meta-placeholder">Fetching…</div>
          )}

          <button
            className="gap-refetch-btn"
            onClick={() => callEndpoint(active)}
            disabled={activeResult?.loading}
          >
            {activeResult?.loading ? "⏳ Fetching…" : "▶ Call This Endpoint"}
          </button>
        </div>

        {/* Right — response */}
        <div className="gap-right">
          <div className="gap-response-header">
            <div className="gap-section-label">Response Body</div>
            <button className="gap-copy-btn" onClick={copyJSON} disabled={!activeResult?.data}>
              {copied ? "✅ Copied!" : "📋 Copy JSON"}
            </button>
          </div>

          <div className="gap-response-body">
            {!activeResult || activeResult.loading ? (
              <div className="gap-spinner-wrap">
                <div className="gap-spinner" />
                <span>Calling {active.url}…</span>
              </div>
            ) : activeResult.error ? (
              <div className="gap-error-wrap">
                <div className="gap-error-icon">⚠️</div>
                <div className="gap-error-msg">{activeResult.error}</div>
                <div className="gap-error-hint">Make sure your MCP server is running:<br /><code>cd D:\reactmcp && npm start</code></div>
              </div>
            ) : (
              <pre className="gap-json">
                {JSON.stringify(activeResult.data, null, 2)}
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
