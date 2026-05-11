import { getReorderDestinationIndex } from "@atlaskit/pragmatic-drag-and-drop-hitbox/util/get-reorder-destination-index";
import { monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import type { DocHandle, Prop } from "@automerge/automerge-repo";
import Popover from "@corvu/popover";
import { makeEventListener } from "@solid-primitives/event-listener";
import ListPlus from "lucide-solid/icons/list-plus";
import {
    type Component,
    createEffect,
    createSignal,
    createUniqueId,
    For,
    type JSX,
    Match,
    onCleanup,
    Show,
    Switch,
    useContext,
} from "solid-js";
import invariant from "tiny-invariant";

import { Nb } from "catcolab-document-methods";
import type { Cell, Notebook } from "catcolab-document-types";
import {
    type Completion,
    Completions,
    type CompletionsRef,
    IconButton,
    type KbdKey,
    type ModifierKey,
} from "catcolab-ui-components";
import { focusMatch, focusTarget, type NotebookFocus, useFocus } from "../focus";
import { DocRefIdContext } from "../page/context";
import { type ShortcutHandle, useShortcutContext } from "../shortcuts";
import { materializeFromAutomerge } from "../util/materialize_from_automerge";
import {
    type CellActions,
    type CellDragData,
    type FormalCellEditorProps,
    isCellDragData,
    NotebookCell,
    RichTextCellEditor,
} from "./notebook_cell";

import "./notebook_editor.css";

/** Identifies which create-cell popover, if any, the editor wants open.

Either an index of an existing cell (open the "create below" popover anchored
to that cell) or `"append"` (open the popover for the end-of-notebook button).
 */
type CreatePopoverTarget = number | "append" | null;

/** Constructor for a cell in a notebook.

A notebook knows how to edit cells, but without cell constructors, it wouldn't
know how to create them!
 */
export type CellConstructor<T> = {
    /** Name of cell constructor, usually naming the cell type. */
    name: string;

    /** Tooltip-length description of cell constructor. */
    description?: string;

    /** Keyboard shortcut to invoke the constructor. */
    shortcut?: KbdKey[];

    /** Called to construct a new cell. */
    construct: () => Cell<T>;
};

/** Notebook editor based on Automerge.

A notebook has two types of cells:

1. Rich text cells, with state managed by Automerge and ProseMirror
   independently of Solid's own state management
2. Formal content cells, with state inside a Solid Store connected to Automerge

Rich text cells are the same in all notebooks, whereas formal cells are handled
by custom components supplied to the notebook.
 */
export function NotebookEditor<T>(props: {
    handle: DocHandle<unknown>;
    path: Prop[];
    notebook: Notebook<T>;
    changeNotebook: (f: (nb: Notebook<T>) => void) => void;

    formalCellEditor: Component<FormalCellEditorProps<T>>;
    cellConstructors?: CellConstructor<T>[];
    cellLabel?: (content: T) => string | undefined;

    /** Called to duplicate an existing cell.

    If omitted, a deep copy is performed.
     */
    duplicateCell?: (content: T) => T;
}) {
    const focus = useFocus();
    const shortcuts = useShortcutContext();
    const [activeCell, setActiveCell] = createSignal<number | null>(null);
    const [currentDropTarget, setCurrentDropTarget] = createSignal<string | null>(null);

    // Which create-cell popover (if any) the editor has requested to open.
    // The popover itself is rendered by the cell (or end-of-notebook button) it
    // is anchored to, so positioning is automatic.
    const [createPopoverTarget, setCreatePopoverTarget] = createSignal<CreatePopoverTarget>(null);

    // Identifier for this notebook's focus target. Prefer the surrounding
    // document pane's ref ID so focus survives remounts; otherwise fall back
    // to a per-instance unique id.
    const docRefId = useContext(DocRefIdContext);
    const fallbackId = createUniqueId();
    const notebookId = () => docRefId?.() ?? fallbackId;

    /** Focus target representing this notebook. Shortcut bindings use
     * `focusMatch.notebook(notebookTarget())` so they fire whenever this
     * notebook is focused. */
    const notebookTarget = (): NotebookFocus => focusTarget.notebook(notebookId());

    // Set up commands and their keyboard shortcuts.
    const insertCommands = (): Completion[] =>
        cellConstructors().map((cc) => {
            const { name, description, shortcut } = cc;
            return {
                name,
                description,
                shortcut: shortcut && [cellShortcutModifier, ...shortcut],
                onComplete: () => {
                    const [i, n] = [activeCell(), props.notebook.cellOrder.length];
                    const cellIndex = i != null ? Math.min(i + 1, n) : n;
                    props.changeNotebook((nb) => {
                        Nb.insertCellAtIndex(nb, cc.construct(), cellIndex);
                    });
                    // Defer so the popover fully closes before we focus the new cell.
                    requestAnimationFrame(() => setActiveCell(cellIndex));
                },
            };
        });

    const cellConstructors = (): CellConstructor<T>[] => [
        {
            name: "Text",
            description: "Start writing text",
            shortcut: ["T"],
            construct: () => Nb.newRichTextCell(),
        },
        ...(props.cellConstructors ?? []),
    ];

    /** Completions for creating a new cell below position `i`. */
    const createBelowCommands = (i: number): Completion[] =>
        cellConstructors().map((cc) => {
            const { name, description, shortcut } = cc;
            return {
                name,
                description,
                shortcut: shortcut && [cellShortcutModifier, ...shortcut],
                onComplete: () => {
                    const index = i + 1;
                    props.changeNotebook((nb) => {
                        Nb.insertCellAtIndex(nb, cc.construct(), index);
                    });
                    // Defer so the popover fully closes before we focus the new cell.
                    requestAnimationFrame(() => setActiveCell(index));
                },
            };
        });

    /** Completions for appending a new cell at the end. */
    const appendCommands = (): Completion[] =>
        cellConstructors().map((cc) => {
            const { name, description, shortcut } = cc;
            return {
                name,
                description,
                shortcut: shortcut && [cellShortcutModifier, ...shortcut],
                onComplete: () => {
                    props.changeNotebook((nb) => {
                        Nb.appendCell(nb, cc.construct());
                    });
                    // Defer so the popover fully closes before we focus the new cell.
                    requestAnimationFrame(() => {
                        setActiveCell(Nb.numCells(props.notebook) - 1);
                    });
                },
            };
        });

    /** Open the create-cell popover anchored to the current active cell, or
     * the end-of-notebook button if no cell is active. */
    const openCreatePopover = () => {
        const cellIndex = activeCell();
        setCreatePopoverTarget(cellIndex != null ? cellIndex : "append");
    };

    // Register Shift+Enter and Modifier+Enter shortcuts to open the
    // create-cell popover. Scoped via `focusMatch.notebook(...)`, so they
    // match whenever this notebook (or a cell within it) is focused.
    createEffect(() => {
        const handles: ShortcutHandle[] = [
            shortcuts.register({
                keys: ["Shift", "Enter"],
                when: focusMatch.notebook(notebookTarget()),
                handler: openCreatePopover,
                label: "Open create-cell popover",
            }),
            shortcuts.register({
                keys: [cellShortcutModifier, "Enter"],
                when: focusMatch.notebook(notebookTarget()),
                handler: openCreatePopover,
                label: "Open create-cell popover",
            }),
        ];
        onCleanup(() => {
            for (const h of handles) {
                h.dispose();
            }
        });
    });

    // Register one shortcut per cell constructor (modifier + key). Re-runs
    // when the constructor list changes.
    createEffect(() => {
        const handles: ShortcutHandle[] = [];
        for (const command of insertCommands()) {
            const key = command.shortcut?.at(-1);
            if (!key) {
                continue;
            }
            handles.push(
                shortcuts.register({
                    keys: [cellShortcutModifier, key],
                    when: focusMatch.notebook(notebookTarget()),
                    handler: () => command.onComplete?.(),
                    label: command.name,
                }),
            );
        }
        onCleanup(() => {
            for (const h of handles) {
                h.dispose();
            }
        });
    });

    // Register this notebook as a default focus candidate. The first
    // candidate in registration order (the leftmost notebook in two-pane
    // layouts) is auto-focused whenever no other element is focused.
    createEffect(() => {
        const handle = focus.registerDefault(() => notebookTarget());
        onCleanup(handle.dispose);
    });

    // Set up drag and drop for notebook cells. Each cell reports to the
    // notebook whether it is the current drop target. Only the drop action is
    // handled here.
    createEffect(() => {
        const cleanup = monitorForElements({
            canMonitor({ source }) {
                return (
                    isCellDragData(source.data) &&
                    props.notebook.cellOrder.some((cellId) => cellId === source.data.cellId)
                );
            },
            onDrop({ location, source }) {
                const target =
                    location.current.dropTargets[0] ??
                    (currentDropTarget() ? { data: { cellId: currentDropTarget() } } : null);
                if (!(target && isCellDragData(source.data))) {
                    setCurrentDropTarget(null);
                    return;
                }
                const targetData = target.data as CellDragData;
                if (!targetData.cellId) {
                    setCurrentDropTarget(null);
                    return;
                }
                const [sourceId, targetId] = [source.data.cellId, targetData.cellId];
                const nb = props.notebook;
                const sourceIndex = nb.cellOrder.indexOf(sourceId);
                const targetIndex = nb.cellOrder.indexOf(targetId);
                if (sourceIndex < 0 || targetIndex < 0) {
                    setCurrentDropTarget(null);
                    return;
                }
                const finalIndex = getReorderDestinationIndex({
                    startIndex: sourceIndex,
                    indexOfTarget: targetIndex,
                    closestEdgeOfTarget: sourceIndex < targetIndex ? "bottom" : "top",
                    axis: "vertical",
                });
                props.changeNotebook((nb) => {
                    Nb.moveCellByIndex(nb, sourceIndex, finalIndex);
                });
                setCurrentDropTarget(null);
            },
        });
        onCleanup(cleanup);
    });

    return (
        <div
            class="notebook"
            onClick={() => {
                // Any click anywhere in the notebook focuses this notebook.
                // The active-cell highlight is independent state managed
                // locally below.
                focus.setFocused(notebookTarget());
            }}
            onFocusOut={(evt) => {
                // When DOM focus leaves the notebook container, clear the
                // active-cell highlight. Notebook-level focus in the focus
                // context is unaffected; it persists until something else
                // takes it.
                const container = evt.currentTarget;
                setTimeout(() => {
                    if (!container.contains(document.activeElement)) {
                        setActiveCell(null);
                    }
                }, 0);
            }}
        >
            <Show when={props.notebook.cellOrder.length === 0}>
                <div class="notebook-cell-placeholder">
                    <CellTypePopover
                        completions={appendCommands()}
                        open={createPopoverTarget() === "append"}
                        onOpenChange={(open) => setCreatePopoverTarget(open ? "append" : null)}
                    >
                        <ListPlus />
                    </CellTypePopover>
                    <span>Click button or press Shift-Enter to create a cell</span>
                </div>
            </Show>
            <ul class="notebook-cells">
                <For each={props.notebook.cellOrder}>
                    {(cellId, i) => {
                        const isActive = () => activeCell() === i();

                        const cellActions: CellActions = {
                            activateAbove() {
                                if (i() > 0) {
                                    setActiveCell(i() - 1);
                                }
                            },
                            activateBelow() {
                                if (i() < Nb.numCells(props.notebook) - 1) {
                                    setActiveCell(i() + 1);
                                }
                            },
                            deleteBackward() {
                                const index = i();
                                props.changeNotebook((nb) => {
                                    Nb.deleteCellAtIndex(nb, index);
                                });
                                setActiveCell(index - 1);
                            },
                            deleteForward() {
                                const index = i();
                                props.changeNotebook((nb) => {
                                    Nb.deleteCellAtIndex(nb, index);
                                });
                                setActiveCell(index);
                            },
                            moveUp() {
                                // oxlint-disable-next-line solid/reactivity -- event handler
                                props.changeNotebook((nb) => {
                                    Nb.moveCellUp(nb, i());
                                });
                            },
                            moveDown() {
                                // oxlint-disable-next-line solid/reactivity -- event handler
                                props.changeNotebook((nb) => {
                                    Nb.moveCellDown(nb, i());
                                });
                            },
                            hasFocused() {
                                setActiveCell(i());
                            },
                        };

                        const cell = props.notebook.cellContents[cellId];
                        invariant(cell, `Failed to find contents for cell '${cellId}'`);

                        if (cell.tag !== "rich-text") {
                            // oxlint-disable-next-line solid/reactivity -- event handler
                            cellActions.duplicate = () => {
                                const index = i();
                                // Materialize the source cell out of Automerge
                                // before entering the change callback, so that
                                // `duplicateCell` (which uses `structuredClone`
                                // by default) operates on plain JS values.
                                const plainCell = materializeFromAutomerge(
                                    props.handle.doc(),
                                    cell,
                                );
                                const newCell = Nb.duplicateCell(plainCell, props.duplicateCell);
                                // oxlint-disable-next-line solid/reactivity -- event handler
                                props.changeNotebook((nb) => {
                                    Nb.insertCellAtIndex(nb, newCell, index + 1);
                                });
                                setActiveCell(index + 1);
                            };
                        }

                        return (
                            <li>
                                <NotebookCell
                                    cellId={cell.id}
                                    index={i()}
                                    actions={cellActions}
                                    tag={
                                        cell.tag === "formal"
                                            ? props.cellLabel?.(cell.content)
                                            : undefined
                                    }
                                    createCompletions={createBelowCommands(i())}
                                    popoverOpen={createPopoverTarget() === i()}
                                    setPopoverOpen={(open) =>
                                        setCreatePopoverTarget(open ? i() : null)
                                    }
                                    currentDropTarget={currentDropTarget()}
                                    setCurrentDropTarget={setCurrentDropTarget}
                                >
                                    <Switch>
                                        <Match when={cell.tag === "rich-text"}>
                                            <RichTextCellEditor
                                                cellId={cell.id}
                                                handle={props.handle}
                                                path={[...props.path, "cellContents", cell.id]}
                                                isActive={isActive()}
                                                actions={cellActions}
                                            />
                                        </Match>
                                        <Match when={cell.tag === "formal" ? cell : undefined}>
                                            {(formalCell) => (
                                                <props.formalCellEditor
                                                    content={formalCell().content}
                                                    changeContent={(f) =>
                                                        props.changeNotebook((nb) =>
                                                            Nb.mutateCellContentById(
                                                                nb,
                                                                cell.id,
                                                                f,
                                                            ),
                                                        )
                                                    }
                                                    isActive={isActive()}
                                                    actions={cellActions}
                                                />
                                            )}
                                        </Match>
                                    </Switch>
                                </NotebookCell>
                            </li>
                        );
                    }}
                </For>
            </ul>
            <Show when={props.notebook.cellOrder.length > 0}>
                <div class="notebook-cell-placeholder">
                    <CellTypePopover
                        completions={appendCommands()}
                        tooltip="Create a new cell"
                        open={createPopoverTarget() === "append"}
                        onOpenChange={(open) => setCreatePopoverTarget(open ? "append" : null)}
                    >
                        <ListPlus />
                    </CellTypePopover>
                </div>
            </Show>
        </div>
    );
}

/** A button that opens a popover with cell type completions.

The open state can either be managed internally (default) or controlled by the
parent via the `open` and `onOpenChange` props. When the popover is open, this
component handles keyboard navigation of the completions list (Arrow
Up/Down to move, Enter to select, Escape to close).
 */
export function CellTypePopover(props: {
    completions: Completion[];
    tooltip?: string;
    /** Whether the button is visible. Defaults to `true`. The button always
        remains visible while the popover is open. */
    showButton?: boolean;
    /** Controlled open state. If omitted, the popover manages its own state. */
    open?: boolean;
    /** Called when the open state should change. */
    onOpenChange?: (open: boolean) => void;
    children: JSX.Element;
}) {
    const [internalOpen, setInternalOpen] = createSignal(false);
    const isOpen = () => props.open ?? internalOpen();
    const setIsOpen = (open: boolean) => {
        setInternalOpen(open);
        props.onOpenChange?.(open);
    };

    const [completionsRef, setCompletionsRef] = createSignal<CompletionsRef>();

    // While open, take over the relevant keys for keyboard navigation. We
    // listen on the window because focus may be elsewhere (e.g. the cell
    // editor that triggered Shift-Enter).
    makeEventListener(window, "keydown", (evt) => {
        if (!isOpen()) {
            return;
        }
        const ref = completionsRef();
        if (evt.key === "ArrowDown") {
            ref?.nextPresumptive();
            return evt.preventDefault();
        }
        if (evt.key === "ArrowUp") {
            ref?.previousPresumptive();
            return evt.preventDefault();
        }
        if (evt.key === "Enter") {
            ref?.selectPresumptive();
            return evt.preventDefault();
        }
        if (evt.key === "Escape") {
            setIsOpen(false);
            return evt.preventDefault();
        }
    });

    return (
        <Popover
            open={isOpen()}
            onOpenChange={setIsOpen}
            placement="bottom-start"
            floatingOptions={{ flip: true }}
            restoreFocus={false}
        >
            <Popover.Anchor as="span">
                <IconButton
                    onClick={() => setIsOpen(true)}
                    tooltip={props.tooltip}
                    style={{
                        visibility: (props.showButton ?? true) || isOpen() ? "visible" : "hidden",
                    }}
                >
                    {props.children}
                </IconButton>
            </Popover.Anchor>
            <Popover.Portal>
                <Popover.Content class="popup">
                    <Completions
                        completions={props.completions}
                        ref={setCompletionsRef}
                        onComplete={() => setIsOpen(false)}
                    />
                </Popover.Content>
            </Popover.Portal>
        </Popover>
    );
}

/** Modifier key to use in keyboard shortcuts for cell constructors.

The choice is platform-specific: On Mac, the Alt/Option key remaps keys, so we
use Control, whereas on other platforms Control tends to be already bound in
other shortcuts, so we Alt.
 */
const cellShortcutModifier: ModifierKey = navigator.userAgent.includes("Mac") ? "Control" : "Alt";
