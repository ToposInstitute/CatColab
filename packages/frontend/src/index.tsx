/* @refresh reload */

import { render } from "solid-js/web";

import * as catlog from "catlog-wasm";
import App from "./App";

import "catcolab-ui-components/global.css";
import "katex/dist/katex.min.css";

// Set panic hook for nice tracebacks from Rust core.
catlog.set_panic_hook();

const root = document.getElementById("root");

render(() => <App />, root!);
