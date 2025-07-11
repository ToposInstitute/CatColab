/* @refresh reload */
import { render } from "solid-js/web";

import * as catlog from "catlog-wasm";
import App from "./App";

import "./index.css";
import "katex/dist/katex.min.css";

// Set panic hook for nice tracebacks from Rust core.
catlog.set_panic_hook();

const root = document.getElementById("root");

// biome-ignore lint/style/noNonNullAssertion: we know that root exists
render(() => <App />, root!);
