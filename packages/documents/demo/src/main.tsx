/* @refresh reload */
import { initializeWebMCPPolyfill } from "@mcp-b/webmcp-polyfill";
import { render } from "solid-js/web";

import { App } from "./App";

// Side-effect import: registers the wired-* custom elements used by the demo UI.
// oxlint-disable-next-line eslint-plugin-import(no-unassigned-import)
import "wired-elements";
import "catcolab-ui-components/global.css";
import "./styles.css";

// Install `document.modelContext` (the WebMCP standard surface) before the app
// mounts, so components can register WebMCP tools during render. The polyfill is
// a no-op when a native implementation already exists.
initializeWebMCPPolyfill();

const root = document.getElementById("root");
if (!root) {
    throw new Error("No #root element found in the demo page.");
}

render(() => <App />, root);
