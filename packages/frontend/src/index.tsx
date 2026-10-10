/* @refresh reload */

import * as Sentry from "@sentry/solid";
import { render } from "solid-js/web";

import * as catlog from "catlog-wasm";
import App from "./App";

import "catcolab-ui-components/global.css";
import "katex/dist/katex.min.css";

// Set panic hook for nice tracebacks from Rust core.
catlog.set_panic_hook();

const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
if (sentryDsn) {
    Sentry.init({
        dsn: sentryDsn,
        environment: import.meta.env.VITE_SENTRY_ENVIRONMENT,
        tracesSampleRate: 1.0,
    });
}

const root = document.getElementById("root");

render(() => <App />, root!);
