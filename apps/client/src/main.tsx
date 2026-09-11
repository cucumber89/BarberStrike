import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { Viewer } from "./ui/Viewer";
import "@fontsource/bebas-neue";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "./ui/styles.css";

/**
 * `/viewer` is its own page, not a mode of the game.
 *
 * The lobby, the HUD and the whole match flow assume there is a you; a spectator has no body and
 * never will, so routing it into `App` would mean teaching every one of those that the player might
 * be absent. The server already treats a watcher as a client it does not model, and this is the
 * same idea on the client: a different page that happens to share the renderer.
 */
const viewing = /^\/viewer\/?$/.test(location.pathname);

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {viewing ? <Viewer /> : <App />}
  </React.StrictMode>,
);
