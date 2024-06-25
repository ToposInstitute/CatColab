/* @refresh reload */
import { render } from "solid-js/web";

import "./index.css";
import App from "./App";

// import { greet } from "../wasm-test/pkg/wasm_test";
import * as wasm from "../wasm-test/pkg/wasm_test";

wasm.greet("Evan");

const root = document.getElementById("root");

render(() => <App />, root!);
