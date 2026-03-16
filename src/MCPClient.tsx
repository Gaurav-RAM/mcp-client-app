import { useEffect, useState } from "react";
import { addToHistory } from "./HistoryPage";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3001";

type Tool = {
  name: string;
  description: string;
  parameters: Record<string, string>;
};

type InvokeResult = unknown;

export function MCPClient() {
  const [tools, setTools] = useState<Tool[]>([]);
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);
  const [params, setParams] = useState<Record<string, string>>({});
  const [loadingTools, setLoadingTools] = useState(false);
  const [loadingInvoke, setLoadingInvoke] = useState(false);
  const [result, setResult] = useState<InvokeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadTools = () => {
    setLoadingTools(true);
    setError(null);

    fetch(`${SERVER_URL}/tools`)
      .then((res) => res.json())
      .then((data) => {
        const loaded = (data.tools ?? []) as Tool[];
        setTools(loaded);
        if (!selectedTool && loaded.length > 0) {
          setSelectedTool(loaded[0]);
        }
      })
      .catch((err) => {
        console.error(err);
        setError("Failed to load tools from MCP server.");
      })
      .finally(() => {
        setLoadingTools(false);
      });
  };

  useEffect(() => {
    loadTools();
  }, []);

  const handleParamChange = (name: string, value: string) => {
    setParams((prev) => ({ ...prev, [name]: value }));
  };

  const handleInvoke = async () => {
    if (!selectedTool) return;

    setLoadingInvoke(true);
    setError(null);
    setResult(null);
    const start = Date.now();

    try {
      const res = await fetch(`${SERVER_URL}/invoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: selectedTool.name,
          args: params,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed with ${res.status}`);
      }

      const body = await res.json();
      setResult(body);

      // ✅ Save to history so HistoryPage picks it up
      addToHistory({
        id: Date.now().toString(),
        tool: selectedTool.name,
        args: { ...params },
        result: body,
        timestamp: new Date().toISOString(),
        duration: Date.now() - start,
        status: "success",
      });

    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to call MCP server.");

      // ✅ Save errors to history too
      if (selectedTool) {
        addToHistory({
          id: Date.now().toString(),
          tool: selectedTool.name,
          args: { ...params },
          result: { error: err.message },
          timestamp: new Date().toISOString(),
          duration: Date.now() - start,
          status: "error",
        });
      }
    } finally {
      setLoadingInvoke(false);
    }
  };

  return (
    <div className="mcp-client">
      <div className="container">
        <header className="header">
          <h1>MCP React Client</h1>
          <p>Connected to {SERVER_URL}</p>
        </header>

        {error && (
          <div className="alert alert-error">
            <span>{error}</span>
            <div>
              <button className="retry-btn" type="button" onClick={loadTools}>
                Retry
              </button>
            </div>
          </div>
        )}

        <section className="tools-section">
          <h2>Available Tools</h2>
          {loadingTools && <p>Loading tools…</p>}
          {!loadingTools && tools.length === 0 && (
            <p>No tools available. Is the server running?</p>
          )}
          {tools.length > 0 && (
            <div className="tools-grid">
              {tools.map((tool) => (
                <button
                  key={tool.name}
                  type="button"
                  className={
                    "tool-card" +
                    (selectedTool?.name === tool.name ? " active" : "")
                  }
                  onClick={() => {
                    setSelectedTool(tool);
                    setParams({});
                    setResult(null);
                  }}
                >
                  <h3>{tool.name}</h3>
                  <p>{tool.description}</p>
                </button>
              ))}
            </div>
          )}
        </section>

        {selectedTool && (
          <section className="tool-form-section">
            <h2>Call: {selectedTool.name}</h2>
            <p className="description">{selectedTool.description}</p>

            <form
              className="tool-form"
              onSubmit={(e) => {
                e.preventDefault();
                handleInvoke();
              }}
            >
              {Object.keys(selectedTool.parameters ?? {}).map((name) => (
                <div className="form-group" key={name}>
                  <label htmlFor={name}>
                    {name}
                    <span className="required">*</span>
                  </label>
                  <input
                    id={name}
                    className="param-input"
                    value={params[name] ?? ""}
                    onChange={(e) => handleParamChange(name, e.target.value)}
                    placeholder={`Enter ${selectedTool.parameters[name]}`}
                  />
                  <div className="help-text">
                    Type: {selectedTool.parameters[name]}
                  </div>
                </div>
              ))}

              <button
                className="call-button"
                type="submit"
                disabled={loadingInvoke}
              >
                {loadingInvoke ? "Calling tool…" : "Call tool"}
              </button>
            </form>

            {result !== null && (
              <div className="result-section">
                <h3>Result</h3>
                <pre className="result-box">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
