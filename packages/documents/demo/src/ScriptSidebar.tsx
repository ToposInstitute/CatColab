import { createEffect, createSignal, on, onMount, Show } from "solid-js";

import { CodeView } from "catcolab-ui-components";
import { SketchSeparator } from "./Rough";
import { formatRunValue, runScript } from "./script-scopes";

import styles from "./ScriptSidebar.module.css";

/** The last-run outcome shown under the editor. */
type RunStatus = { tag: "ok" | "error"; message: string } | undefined;

/**
 * A docked sidebar holding a JavaScript editor that mutates a demo document.
 *
 * The sidebar is neutral about *what* it edits: the caller supplies the named
 * values exposed to the script body via {@link ScriptSidebar.scope}, a starter
 * script, and the localStorage key under which the source is persisted. The demo
 * hands it a single merged scope — the schema notebook, the instance, and the
 * simple-schema generator defs — so one script can edit both sides. Because the
 * script calls the same document API the rest of the editor uses, every mutation
 * flows through the document's change notification and the notebook UI, the
 * instance, history, and persistence all update exactly as they do for
 * point-and-click edits.
 *
 * The script body is `eval`ed in an async function so it may `await`, and its
 * return value (or thrown error) is surfaced in the status line. This is a demo
 * affordance, not a sandbox: the script has full access to the page.
 */
export function ScriptSidebar(props: {
    /** The named values exposed to the script body. */
    scope: Record<string, unknown>;
    /**
     * The current editor source. It is owned by the caller (so the WebMCP
     * `set_script` tool and this editor write to the same state), making this a
     * controlled editor.
     */
    source: string;
    /** Called with the new source on every edit; the caller persists it. */
    onSourceChange: (value: string) => void;
}) {
    const source = () => props.source;
    const [status, setStatus] = createSignal<RunStatus>();

    // The `.editorArea` is the single scroll container; the textarea and the
    // highlight layer both live inside it and scroll together. A textarea does
    // not size to its content on its own, so grow it to fit: match its height to
    // its scroll height so it never scrolls internally (which Firefox handles
    // inconsistently for a transparent overlay) and instead the surrounding
    // container scrolls both layers as one.
    let textareaEl: HTMLTextAreaElement | undefined;
    const autoGrow = () => {
        if (!textareaEl) {
            return;
        }
        // Reset first so shrinking the text also shrinks the box.
        textareaEl.style.height = "0px";
        textareaEl.style.height = `${textareaEl.scrollHeight}px`;
    };

    const update = (value: string) => {
        props.onSourceChange(value);
        autoGrow();
    };

    onMount(autoGrow);

    // Re-fit the textarea whenever the source changes from *outside* the editor
    // (e.g. the WebMCP `set_script` tool), so a set script is fully visible
    // without the user having to type into the box.
    createEffect(on(source, autoGrow));

    const run = async () => {
        setStatus(undefined);
        const result = await runScript(props.scope, source());
        if (result.tag === "ok") {
            setStatus({
                tag: "ok",
                message:
                    result.value === undefined
                        ? "Ran successfully."
                        : `→ ${formatRunValue(result.value)}`,
            });
        } else {
            setStatus({ tag: "error", message: String(result.error) });
        }
    };

    // Ctrl/Cmd+Enter runs the script from within the editor.
    const onKeyDown = (evt: KeyboardEvent) => {
        if ((evt.metaKey || evt.ctrlKey) && evt.key === "Enter") {
            evt.preventDefault();
            void run();
        }
    };

    return (
        <div class={styles.scriptSidebar}>
            <div class={styles.header}>
                <SketchSeparator edge="bottom" seed={131} />
                <span>Script</span>
            </div>
            <div class={styles.editorArea}>
                {/* A syntax-highlighted layer (shiki, via ui-components'
                    `CodeView`) sits underneath a transparent textarea, so the
                    user types into the textarea while seeing highlighted code.
                    A trailing newline keeps the highlight layer's height in
                    sync with the textarea's when the source ends in a newline.

                    Both layers grow to their content height and are scrolled
                    together by the enclosing `.editorArea`, so scrolling works
                    the same in every browser. */}
                <div class={styles.highlight} aria-hidden="true">
                    <CodeView text={`${source()}\n`} lang="javascript" />
                </div>
                <textarea
                    ref={textareaEl}
                    class={styles.editor}
                    spellcheck={false}
                    autocomplete="off"
                    autocapitalize="off"
                    value={source()}
                    onInput={(e) => update(e.currentTarget.value)}
                    onKeyDown={onKeyDown}
                    placeholder="// JavaScript…"
                />
            </div>
            <div class={styles.footer}>
                <SketchSeparator edge="top" seed={137} />
                <wired-button class={styles.runButton} elevation="2" onClick={() => void run()}>
                    Run
                </wired-button>
                <Show when={status()}>
                    {(s) => (
                        <div class={styles.status} data-tag={s().tag}>
                            {s().message}
                        </div>
                    )}
                </Show>
            </div>
        </div>
    );
}
