import type { Prop } from "@automerge/automerge";
import type { DocHandle } from "@automerge/automerge-repo";

import {
    baseKeymap,
    chainCommands,
    deleteSelection,
    joinBackward,
    selectNodeBackward,
    setBlockType,
    toggleMark,
} from "prosemirror-commands";
import { keymap } from "prosemirror-keymap";
import { type Command, EditorState, type Plugin, type Transaction } from "prosemirror-state";
import { EditorView } from "prosemirror-view";

import { type JSX, Show, createEffect, createSignal, onCleanup } from "solid-js";
import { useDocHandleReady } from "../../api/document";

import "katex/dist/katex.min.css";
import "@benrbray/prosemirror-math/dist/prosemirror-math.css";
import "prosemirror-view/style/prosemirror.css";
import "./rich_text_editor.css";

import {
    REGEX_BLOCK_MATH_DOLLARS,
    makeBlockMathInputRule,
    mathBackspaceCmd,
    mathPlugin,
    mathSerializer,
} from "@benrbray/prosemirror-math";
import { inputRules } from "prosemirror-inputrules";

import Bold from "lucide-solid/icons/bold";
import Indent from "lucide-solid/icons/indent";
import Italic from "lucide-solid/icons/italic";
import Link from "lucide-solid/icons/link";
import List from "lucide-solid/icons/list";
import ListOrdered from "lucide-solid/icons/list-ordered";
import Outdent from "lucide-solid/icons/outdent";
import Sigma from "lucide-solid/icons/sigma";
import TextQuote from "lucide-solid/icons/text-quote";
import { splitListItem } from "prosemirror-schema-list";
import {
    decreaseIndent,
    doIfAtBottom,
    doIfAtTop,
    doIfEmpty,
    increaseListIndet,
    insertMathDisplayCmd,
    toggleOrderedList,
    turnSelectionIntoBlockquote,
} from "./commands";
import { type CustomSchema, proseMirrorAutomergeInit } from "./schema";
import { activeHeading, initPlaceholderPlugin, isMarkActive } from "./utils";

/** Optional props for `RichTextEditor` component.
 */
export type RichTextEditorOptions = {
    id?: unknown;
    // this is actually an init callback that returns the view
    ref?: (ref: EditorView) => void;
    placeholder?: string;

    deleteBackward?: () => void;
    deleteForward?: () => void;
    exitUp?: () => void;
    exitDown?: () => void;

    onFocus?: () => void;
};

type MarkStates = {
    isBoldActive: boolean;
    isEmActive: boolean;
};

/** Rich text editor combining Automerge and ProseMirror.

Adapted from:

- https://github.com/automerge/prosemirror-quickstart/
- https://github.com/automerge/automerge-prosemirror/tree/main/playground/
 */
export const RichTextEditor = (
    props: {
        handle: DocHandle<unknown>;
        path: Prop[];
    } & RichTextEditorOptions,
) => {
    let editorRoot!: HTMLDivElement;
    let menuRoot!: HTMLDivElement;

    // flags for determining if the menu bar is visible
    const [isEditorFocused, setEditorFocused] = createSignal(false);
    const [isMenuActive, setMenuActive] = createSignal(false);

    const [menuControls, setMenuControls] = createSignal<MenuControls>({
        onBoldClicked: null,
        onItalicClicked: null,
        onLinkClicked: null,
        onBlockQuoteClicked: null,
        onToggleOrderedList: null,
        onToggleNumberedList: null,
        onIncreaseIndent: null,
        onDecreaseIndent: null,
        onHeadingClicked: null,
        onMathClicked: null,
    });

    const [markStates, setMarkStates] = createSignal<MarkStates>({
        isBoldActive: false,
        isEmActive: false,
    });

    const [headingLevel, setHeadingLevel] = createSignal<number | null>(null);
    const isReady = useDocHandleReady(() => props.handle);

    createEffect(() => {
        // NOTE: Make the effect depend on the given ID to ensure that this
        // component updates when the Automerge handle and path both stay the
        // same but the path refers to a different object in the document.
        props.id;

        if (!isReady()) {
            return;
        }

        const { schema, pmDoc, automergePlugin } = proseMirrorAutomergeInit(
            props.handle,
            props.path,
        );

        const blockMathInputRule = makeBlockMathInputRule(
            REGEX_BLOCK_MATH_DOLLARS,
            schema.nodes.math_display,
        );

        const plugins: Plugin[] = [
            keymap(richTextEditorKeymap(schema, props)),
            keymap(baseKeymap),
            ...(props.placeholder ? [initPlaceholderPlugin(props.placeholder)] : []),
            automergePlugin,
            mathPlugin,
            inputRules({ rules: [blockMathInputRule] }),
        ];

        const state = EditorState.create({ schema, plugins, doc: pmDoc });
        const view = new EditorView(editorRoot, {
            state,
            dispatchTransaction: (tx: Transaction) => {
                // XXX: It appears that automerge-prosemirror can dispatch
                // transactions even after the view has been destroyed.
                if (view.isDestroyed) {
                    return;
                }

                const newState = view.state.apply(tx);
                setHeadingLevel(activeHeading(view.state, schema));
                setMarkStates(activeMarks(newState, schema));
                view.updateState(newState);
            },
            handleDOMEvents: {
                focus: () => {
                    setEditorFocused(true);
                    props.onFocus?.();
                    return false;
                },
                blur: (view, event) => {
                    const relatedTarget = event.relatedTarget as Node | null;

                    // Interacting with the menu bar can cause the editor to lose focus which leads to
                    // the menu bar closing. We can prevent that by ignoring blur events if they
                    // originate from the menu bar.
                    if (relatedTarget && menuRoot.contains(relatedTarget)) {
                        // prevent the editor from losing focus and clearing the selection.
                        view.focus();
                        return true;
                    }

                    setEditorFocused(false);
                    return false;
                },
            },
            clipboardTextSerializer: (slice) => {
                return mathSerializer.serializeSlice(slice);
            },
        });

        if (props.ref) {
            props.ref(view);
        }

        setHeadingLevel(activeHeading(view.state, schema));
        setMarkStates(activeMarks(view.state, schema));

        setMenuControls({
            onBoldClicked: () => toggleMark(schema.marks.strong)(view.state, view.dispatch),
            onItalicClicked: () => toggleMark(schema.marks.em)(view.state, view.dispatch),
            // TODO: A "good" notion-style link editor should probably use an inline group node, which
            // currently doesn't work: https://github.com/automerge/automerge-prosemirror/issues/30
            onLinkClicked: null,
            onBlockQuoteClicked: () => turnSelectionIntoBlockquote(view.state, view.dispatch),
            onToggleOrderedList: () => toggleOrderedList(view.state, view.dispatch),
            onToggleNumberedList: () => toggleOrderedList(view.state, view.dispatch),
            onIncreaseIndent: () => increaseListIndet(view.state, view.dispatch),
            onDecreaseIndent: () => decreaseIndent(view.state, view.dispatch),
            onHeadingClicked: (level: number) => {
                if (level === 0) {
                    // paragraph
                    setBlockType(schema.nodes.paragraph)(view.state, view.dispatch);
                } else {
                    // heading
                    setBlockType(schema.nodes.heading, { level })(view.state, view.dispatch);
                }
            },
            onMathClicked: () => insertMathDisplayCmd(view.state, view.dispatch),
        });

        onCleanup(() => view.destroy());
    });

    return (
        <div class={`rich-text-editor ${isEditorFocused() || isMenuActive() ? "focussed" : ""}`}>
            <Show when={isEditorFocused() || isMenuActive()}>
                <div
                    ref={menuRoot}
                    onFocusIn={() => setMenuActive(true)}
                    onFocusOut={() => setMenuActive(false)}
                >
                    <MenuBar {...menuControls()} {...markStates()} headingLevel={headingLevel()} />
                </div>
            </Show>
            <div ref={editorRoot} />
        </div>
    );
};

function activeMarks(state: EditorState, schema: CustomSchema): MarkStates {
    const isBoldActive = isMarkActive(state, schema.marks.strong);
    const isEmActive = isMarkActive(state, schema.marks.em);

    return { isBoldActive, isEmActive };
}

function richTextEditorKeymap(schema: CustomSchema, props: RichTextEditorOptions) {
    const bindings: { [key: string]: Command } = {};

    bindings["Tab"] = increaseListIndet;
    bindings["Enter"] = splitListItem(schema.nodes.list_item);
    bindings["Mod-b"] = toggleMark(schema.marks.strong);
    bindings["Mod-i"] = toggleMark(schema.marks.em);
    bindings["Mod-m"] = insertMathDisplayCmd;
    bindings["Backspace"] = chainCommands(
        deleteSelection,
        mathBackspaceCmd,
        joinBackward,
        selectNodeBackward,
        props.deleteBackward ? doIfEmpty(props.deleteBackward) : () => false,
    );

    if (props.deleteForward) {
        bindings["Delete"] = doIfEmpty(props.deleteForward);
    }
    if (props.exitUp) {
        bindings["ArrowUp"] = doIfAtTop(props.exitUp);
    }
    if (props.exitDown) {
        bindings["ArrowDown"] = doIfAtBottom(props.exitDown);
    }

    return bindings;
}

type MenuControls = {
    onBoldClicked: (() => void) | null;
    onItalicClicked: (() => void) | null;
    onLinkClicked: (() => void) | null;
    onBlockQuoteClicked: (() => void) | null;
    onToggleOrderedList: (() => void) | null;
    onToggleNumberedList: (() => void) | null;
    onIncreaseIndent: (() => void) | null;
    onDecreaseIndent: (() => void) | null;
    onHeadingClicked: ((level: number) => void) | null;
    onMathClicked: (() => void) | null;
};

export function MenuBar(props: MenuControls & MarkStates & { headingLevel: number | null }) {
    return (
        <div id="menubar" class="menubar">
            <Show when={props.onBoldClicked}>
                <button
                    onClick={() => props.onBoldClicked?.()}
                    classList={{ active: props.isBoldActive }}
                >
                    <Bold />
                </button>
            </Show>
            <Show when={props.onItalicClicked}>
                <button
                    onClick={() => props.onItalicClicked?.()}
                    classList={{ active: props.isEmActive }}
                >
                    <Italic />
                </button>
            </Show>
            <Show when={props.onLinkClicked}>
                <button id="add-link" onClick={() => props.onLinkClicked?.()}>
                    <Link />
                </button>
            </Show>
            <Show when={props.onMathClicked}>
                <TooltipButton
                    tooltip="KaTex block (shortuct: Mod+m)"
                    onClick={() => props.onMathClicked?.()}
                >
                    <Sigma />
                </TooltipButton>
            </Show>
            <Show when={props.onBlockQuoteClicked}>
                <TooltipButton tooltip="Blockquote" onClick={() => props.onBlockQuoteClicked?.()}>
                    <TextQuote />
                </TooltipButton>
            </Show>
            <Show when={props.onToggleNumberedList}>
                <TooltipButton
                    tooltip="Numbered list"
                    onClick={() => props.onToggleNumberedList?.()}
                >
                    <ListOrdered />
                </TooltipButton>
            </Show>
            <Show when={props.onToggleOrderedList}>
                <TooltipButton tooltip="Bullet list" onClick={() => props.onToggleOrderedList?.()}>
                    <List />
                </TooltipButton>
            </Show>
            <Show when={props.onIncreaseIndent}>
                <TooltipButton tooltip="Indent" onClick={() => props.onIncreaseIndent?.()}>
                    <Indent />
                </TooltipButton>
            </Show>
            <Show when={props.onDecreaseIndent}>
                <TooltipButton tooltip="Outdent" onClick={() => props.onDecreaseIndent?.()}>
                    <Outdent />
                </TooltipButton>
            </Show>
            <Show when={props.onHeadingClicked}>
                <select
                    value={props.headingLevel ?? 0}
                    onInput={(e) => {
                        const lvl = Number((e.currentTarget as HTMLSelectElement).value);
                        props.onHeadingClicked?.(lvl);
                    }}
                >
                    <option value={0}>Paragraph</option>
                    <option value={1}>Heading 1</option>
                    <option value={2}>Heading 2</option>
                    <option value={3}>Heading 3</option>
                    <option value={4}>Heading 4</option>
                    <option value={5}>Heading 5</option>
                    <option value={6}>Heading 6</option>
                </select>
            </Show>
        </div>
    );
}

function TooltipButton({
    tooltip,
    onClick,
    children,
}: { tooltip: string; onClick: () => void; children: JSX.Element }) {
    return (
        <div class="tooltipButton tooltip" data-tooltip={tooltip}>
            <button onClick={onClick}>{children}</button>
        </div>
    );
}
