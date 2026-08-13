import {
    createEffect,
    createMemo,
    createResource,
    createSignal,
    onCleanup,
    onMount,
    Show,
} from "solid-js";

import { createDemoDocument, type DemoDocument } from "./document";
import { EXAMPLE_QUERY, loadExampleData } from "./example-data";
import { InstanceEditor } from "./InstanceEditor";
import { DEFAULT_QUERY, QUERY_STORAGE_KEY, QuerySidebar } from "./QuerySidebar";
import { SchemaEditor } from "./SchemaEditor";
import { demoScript, formatRunValue, runScript } from "./script-scopes";
import { ScriptSidebar } from "./ScriptSidebar";
import { ScriptToggle } from "./ScriptToggle";

import styles from "./App.module.css";

/** Which panel currently owns keyboard focus, so only its shortcuts fire. */
export type ActivePanel = "schema" | "instance";

/**
 * The instances demo: a schema editor on the left and a live, editable
 * spreadsheet instance of that schema on the right, with a single script pane
 * (toggled from the top bar) docked along the bottom that can edit both sides.
 */
export function App() {
    const [doc] = createResource(createDemoDocument);

    // Exactly one panel is "active" at a time: the last one the user focused or
    // clicked into. Its undo/redo shortcuts fire; the other's do not, matching
    // the frontend's per-pane behaviour. Starts on the schema panel.
    const [activePanel, setActivePanel] = createSignal<ActivePanel>("schema");

    // The single script pane spans the whole app and edits both sides, so its
    // open state lives here rather than in either editor.
    const [scriptOpen, setScriptOpen] = createSignal(false);
    const [queryOpen, setQueryOpen] = createSignal(false);

    return (
        <div class={styles.app}>
            <Show
                when={doc()}
                fallback={
                    <div class={styles.loading}>
                        <wired-spinner spinning duration="1200" />
                        <span>Loading the sketch…</span>
                    </div>
                }
            >
                {(loaded) => (
                    <Loaded
                        doc={loaded()}
                        activePanel={activePanel}
                        setActivePanel={setActivePanel}
                        scriptOpen={scriptOpen}
                        setScriptOpen={setScriptOpen}
                        queryOpen={queryOpen}
                        setQueryOpen={setQueryOpen}
                    />
                )}
            </Show>
        </div>
    );
}

/**
 * The demo once its document has loaded. The script source lives here — above
 * both the (toggleable) {@link ScriptSidebar} and the always-mounted WebMCP tool
 * — so the tool can author a script whether or not the pane is currently open,
 * and the editor renders that same state when opened.
 */
function Loaded(props: {
    doc: DemoDocument;
    activePanel: () => ActivePanel;
    setActivePanel: (panel: ActivePanel) => void;
    scriptOpen: () => boolean;
    setScriptOpen: (open: boolean) => void;
    queryOpen: () => boolean;
    setQueryOpen: (open: boolean) => void;
}) {
    // The demo's single script config: the merged scope, starter script, and the
    // localStorage key its source is persisted under.
    const script = createMemo(() => demoScript(props.doc));
    const [scriptStorageProblem, setScriptStorageProblem] = createSignal<string>();
    const [queryStorageProblem, setQueryStorageProblem] = createSignal<string>();
    const storageProblem = createMemo(() =>
        [props.doc.storageProblem(), scriptStorageProblem(), queryStorageProblem()]
            .filter(Boolean)
            .join(" "),
    );
    const [storageDialogOpen, setStorageDialogOpen] = createSignal(false);
    createEffect(() => {
        if (storageProblem()) {
            setStorageDialogOpen(true);
        }
    });

    // The schema/instance split as the schema panel's width fraction (0..1),
    // adjusted by dragging the divider and persisted across reloads.
    const [splitFraction, setSplitFraction] = createSignal(loadSplitFraction());
    let splitEl!: HTMLDivElement;
    const startSplitDrag = (event: PointerEvent) => {
        event.preventDefault();
        const onMove = (move: PointerEvent) => {
            const bounds = splitEl.getBoundingClientRect();
            if (bounds.width === 0) {
                return;
            }
            setSplitFraction(clampSplitFraction((move.clientX - bounds.left) / bounds.width));
        };
        const onUp = () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            try {
                localStorage.setItem(SPLIT_FRACTION_STORAGE_KEY, String(splitFraction()));
            } catch {
                // A failed persist should not interrupt editing.
            }
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
    };

    // The editor source, owned here and persisted on every change, so both the
    // editor and the `set_script` WebMCP tool write to the same state.
    const [source, setSource] = createSignal(
        loadScriptSource(script().storageKey, script().defaultScript),
    );
    const setScript = (value: string) => {
        setSource(value);
        try {
            localStorage.setItem(script().storageKey, value);
        } catch (error) {
            setScriptStorageProblem(storageProblemMessage("save the script to", error));
        }
    };
    const [querySource, setQuerySource] = createSignal(
        loadSource(QUERY_STORAGE_KEY, DEFAULT_QUERY, setQueryStorageProblem),
    );
    const setQuery = (value: string) => {
        setQuerySource(value);
        try {
            localStorage.setItem(QUERY_STORAGE_KEY, value);
        } catch (error) {
            setQueryStorageProblem(storageProblemMessage("save the query to", error));
        }
    };

    function loadScriptSource(storageKey: string, defaultScript: string) {
        try {
            return localStorage.getItem(storageKey) ?? defaultScript;
        } catch (error) {
            setScriptStorageProblem(storageProblemMessage("read the script from", error));
            return defaultScript;
        }
    }

    function loadSource(
        storageKey: string,
        fallback: string,
        reportProblem: (message: string) => void,
    ) {
        try {
            return localStorage.getItem(storageKey) ?? fallback;
        } catch (error) {
            reportProblem(storageProblemMessage("read the query from", error));
            return fallback;
        }
    }

    // Register the "run the script" WebMCP tool. It is mounted for the whole
    // session (not tied to the pane's open state), so an agent driving
    // `document.modelContext` can author and run a script at any time; running
    // one also opens the pane so the result is visible. The script is placed in
    // the editor *and* executed, and its return value (or thrown error) is
    // reported back to the caller.
    onMount(() => {
        const modelContext = document.modelContext;
        if (!modelContext) {
            return;
        }
        const controller = new AbortController();
        modelContext.registerTool(
            {
                name: "run_script",
                description:
                    "Replace the contents of the demo's script editor with the given " +
                    "JavaScript source, open the script pane, and run it. The script's " +
                    "scope exposes `schema`, `instance`, `doc`, `attrTypes`, and the " +
                    "simple-schema generator defs `Entity`, `Mapping`, `Attr`, and " +
                    "`AttrType`, so it can read and mutate both the schema and its " +
                    "instance. The script's return value (or thrown error) is returned.",
                inputSchema: {
                    type: "object",
                    properties: {
                        script: {
                            type: "string",
                            description: "The JavaScript source to place in the editor and run.",
                        },
                    },
                    required: ["script"],
                    additionalProperties: false,
                },
                annotations: { title: "Run script" },
                async execute(args) {
                    const value = args.script;
                    if (typeof value !== "string") {
                        throw new TypeError('"script" must be a string.');
                    }
                    setScript(value);
                    props.setQueryOpen(false);
                    props.setScriptOpen(true);
                    const result = await runScript(script().scope, value);
                    if (result.tag === "error") {
                        return {
                            isError: true,
                            content: [
                                { type: "text", text: `Script threw: ${String(result.error)}` },
                            ],
                        };
                    }
                    const text =
                        result.value === undefined
                            ? "Script ran successfully."
                            : `Script ran successfully. Returned: ${formatRunValue(result.value)}`;
                    return { content: [{ type: "text", text }] };
                },
            },
            { signal: controller.signal },
        );
        onCleanup(() => controller.abort());
    });

    const reset = () => {
        if (confirm("Clear the schema, instance, and scripts? This cannot be undone.")) {
            props.doc.clear();
        }
    };
    const loadExample = async () => {
        if (confirm("Replace the current schema and instance with the planets example?")) {
            await loadExampleData(props.doc);
            setQuery(EXAMPLE_QUERY);
            props.setScriptOpen(false);
        }
    };
    const clearStorageProblem = () => props.doc.clear();

    return (
        <>
            <Show when={storageProblem()}>
                {(problem) => (
                    <wired-dialog open={storageDialogOpen()} elevation="3">
                        <div class={styles.storageProblemDialog}>
                            <h2>Storage problem</h2>
                            <p>
                                The demo could not load or save browser storage. You can keep
                                working in the current session, but changes may not survive a
                                reload.
                            </p>
                            <p class={styles.storageProblemDetail}>{problem()}</p>
                            <div class={styles.storageProblemActions}>
                                <wired-button
                                    class={styles.dangerButton}
                                    onClick={clearStorageProblem}
                                >
                                    Clear all data
                                </wired-button>
                                <wired-button onClick={() => setStorageDialogOpen(false)}>
                                    Keep working
                                </wired-button>
                            </div>
                        </div>
                    </wired-dialog>
                )}
            </Show>
            <div
                ref={splitEl}
                class={styles.split}
                style={{
                    "grid-template-columns": `minmax(0, ${splitFraction()}fr) 0 minmax(0, ${
                        1 - splitFraction()
                    }fr)`,
                }}
            >
                <SchemaEditor
                    doc={props.doc}
                    active={() => props.activePanel() === "schema"}
                    onActivate={() => props.setActivePanel("schema")}
                />
                <div
                    class={styles.splitDivider}
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Resize schema and instance panels"
                    onPointerDown={startSplitDrag}
                />
                <InstanceEditor
                    doc={props.doc}
                    active={() => props.activePanel() === "instance"}
                    onActivate={() => props.setActivePanel("instance")}
                />
            </div>
            <Show when={props.scriptOpen()}>
                <ScriptSidebar
                    scope={script().scope}
                    source={source()}
                    onSourceChange={setScript}
                />
            </Show>
            <Show when={props.queryOpen()}>
                <QuerySidebar doc={props.doc} source={querySource()} onSourceChange={setQuery} />
            </Show>
            <wired-card class={styles.floatingControls} elevation="3">
                <wired-button onClick={loadExample} elevation="2">
                    Load example data
                </wired-button>
                <wired-button class={styles.clearButton} onClick={reset} elevation="2">
                    Clear all data
                </wired-button>
                <ScriptToggle
                    open={props.scriptOpen()}
                    onToggle={() => {
                        props.setQueryOpen(false);
                        props.setScriptOpen(!props.scriptOpen());
                    }}
                />
                <wired-button
                    aria-pressed={props.queryOpen()}
                    elevation="2"
                    onClick={() => {
                        props.setScriptOpen(false);
                        props.setQueryOpen(!props.queryOpen());
                    }}
                >
                    Query
                </wired-button>
            </wired-card>
        </>
    );
}

function storageProblemMessage(action: string, error?: unknown) {
    const detail = error instanceof Error ? ` ${error.message}` : "";
    return `Could not ${action} local storage.${detail}`;
}

const SPLIT_FRACTION_STORAGE_KEY = "catcolab-instances-demo:split-fraction";
const DEFAULT_SPLIT_FRACTION = 0.4;

/** Keep the schema panel between 20% and 80% of the split so neither collapses. */
function clampSplitFraction(value: number): number {
    return Math.min(0.8, Math.max(0.2, value));
}

function loadSplitFraction(): number {
    try {
        const stored = localStorage.getItem(SPLIT_FRACTION_STORAGE_KEY);
        const value = stored === null ? Number.NaN : Number(stored);
        return Number.isFinite(value) ? clampSplitFraction(value) : DEFAULT_SPLIT_FRACTION;
    } catch {
        return DEFAULT_SPLIT_FRACTION;
    }
}
