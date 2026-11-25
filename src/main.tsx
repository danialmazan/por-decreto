import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/schibsted-grotesk";
import "./styles.css";
import { App } from "./App";
import type { Lang } from "./i18n";

const lang: Lang = document.documentElement.lang === "en" ? "en" : "es";
createRoot(document.getElementById("root")!).render(<StrictMode><App lang={lang} /></StrictMode>);
