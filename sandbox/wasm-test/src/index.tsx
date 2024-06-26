/* @refresh reload */
import { render } from "solid-js/web";

import "./index.css";
import App from "./App";

// import { greet } from "../wasm-test/pkg/wasm_test";

const root = document.getElementById("root");

render(() => <App />, root!);
