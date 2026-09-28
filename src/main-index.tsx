import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MotionConfig } from "motion/react";
import { PublicApp } from "./features/public-shell/PublicApp";
import { ThemeProvider } from "./lib/theme";
import "./styles/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <MotionConfig reducedMotion="user">
        <PublicApp />
      </MotionConfig>
    </ThemeProvider>
  </StrictMode>,
);
