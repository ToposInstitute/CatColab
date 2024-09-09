import * as Sentry from "@sentry/node";

// Ensure to call this before importing any other modules!
Sentry.init({
    dsn: "https://20cd03309068e5710a7bc4d68526d029@o4507924347092992.ingest.us.sentry.io/4507924350173184",

    // Add Tracing by setting tracesSampleRate
    // We recommend adjusting this value in production
    tracesSampleRate: 1.0,
});
