import React from "react";
import ReactDOM from "react-dom/client";
import "./style.css";
import { MCPClient } from "./MCPClient";
import { Chat } from "./Chat";
import { GetAPIPage } from "./GetAPIPage";
import { HistoryPage } from "./HistoryPage";

ReactDOM.createRoot(document.getElementById("app") as HTMLElement).render(
  <React.StrictMode>
    <MCPClient />
    <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 20px 40px" }}>
      <HistoryPage />
      <GetAPIPage />
      <Chat />
    </div>
  </React.StrictMode>
);
