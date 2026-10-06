import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Home } from "./views/home.tsx";
import "./style.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Home />
  </StrictMode>,
);
