import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { Viewer } from "./ui/Viewer";
import { TutorialMount } from "./ui/onboarding/TutorialOverlay";
import "@fontsource/bebas-neue";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "./ui/styles.css";
// The HUD's own sheets (ui/hud/*.css, drop U) sit between the two, where their rules always were.
import "./ui/hud/index.css";
import "./ui/cinematic.css";

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
    {/* P8b onboarding: the five-step tutorial overlay lives at the app root, a sibling of <App/>,
        so it outlives the menu that starts it and lays itself over the live match. */}
    {!viewing && <TutorialMount />}
  </React.StrictMode>,
);
