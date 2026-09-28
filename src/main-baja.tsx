import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MotionConfig } from "motion/react";
import { BajaPage } from "./features/baja/BajaPage";
import { ThemeProvider } from "./lib/theme";
import "./styles/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <MotionConfig reducedMotion="user">
        <BajaPage />
      </MotionConfig>
    </ThemeProvider>
  </StrictMode>,
);
