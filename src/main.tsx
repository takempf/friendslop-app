import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { initWarningFilters } from "@/utils/suppressDeprecationWarnings";
import "./index.css";
import App from "./App.tsx";

initWarningFilters();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
