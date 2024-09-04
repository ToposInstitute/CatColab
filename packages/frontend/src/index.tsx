/* @refresh reload */
import { render } from "solid-js/web";

import "./index.css";

const root = document.getElementById("root");
import App from "./App";

// biome-ignore lint/style/noNonNullAssertion: we know that root exists
render(() => <App />, root!);
