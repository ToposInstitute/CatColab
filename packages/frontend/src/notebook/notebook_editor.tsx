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
    For,
    type JSX,
    Match,
    onCleanup,
    Show,
    Switch,
} from "solid-js";
import invariant from "tiny-invariant";

import {
    type Completion,
    Completions,
    IconButton,
    type KbdKey,
    keyEventHasModifier,
    type ModifierKey,
} from "catcolab-ui-components";
import type { Cell, Notebook } from "catlog-wasm";
import {
    type CellActions,
    type CellDragData,
    type FormalCellEditorProps,
    isCellDragData,
    NotebookCell,
    RichTextCellEditor,
    StemCellEditor,
} from "./notebook_cell";
import { type FormalCell, NotebookUtils, newRichTextCell } from "./types";

import "./notebook_editor.css";

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

    // FIXME: Remove this option once we fix focus management.
    noShortcuts?: boolean;
}) {
    const [activeCell, setActiveCell] = createSignal<number | null>(null);
    const [currentDropTarget, setCurrentDropTarget] = createSignal<string | null>(null);

    // Popover state for Shift-Enter cell type selection.
    const [shiftEnterPopoverOpen, setShiftEnterPopoverOpen] = createSignal(false);
    let shiftEnterAnchorRef!: HTMLDivElement;

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
                        NotebookUtils.insertCellAtIndex(nb, cc.construct(), cellIndex);
                    });
                    // Defer so the popover fully closes before we focus the new cell.
                    requestAnimationFrame(() => setActiveCell(cellIndex));
                },
            };
        });

    const replaceCellWith = (i: number, cell: Cell<T>) => {
        props.changeNotebook((nb) => {
            const oldId = nb.cellOrder[i];

            nb.cellOrder[i] = cell.id;
            nb.cellContents[cell.id] = cell;

            if (oldId) {
                delete nb.cellContents[oldId];
            }
        });
    };

    const cellConstructors = (): CellConstructor<T>[] => [
        {
            name: "Text",
            description: "Start writing text",
            shortcut: ["T"],
            construct: () => newRichTextCell(),
        },
        ...(props.cellConstructors ?? []),
    ];

    const replaceCommands = (i: number): Completion[] =>
        cellConstructors().map((cc) => {
            const { name, description, shortcut } = cc;
            return {
                name,
                description,
                shortcut: shortcut && [cellShortcutModifier, ...shortcut],
                onComplete: () => replaceCellWith(i, cc.construct()),
            };
        });

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
                        NotebookUtils.insertCellAtIndex(nb, cc.construct(), index);
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
                        NotebookUtils.appendCell(nb, cc.construct());
                    });
                    // Defer so the popover fully closes before we focus the new cell.
                    requestAnimationFrame(() => {
                        setActiveCell(NotebookUtils.numCells(props.notebook) - 1);
                    });
                },
            };
        });

    makeEventListener(window, "keydown", (evt) => {
        if (props.noShortcuts) {
            return;
        }
        if (keyEventHasModifier(evt, cellShortcutModifier)) {
            for (const command of insertCommands()) {
                if (command.shortcut && evt.key.toUpperCase() === command.shortcut[0]) {
                    command.onComplete?.();
                    return evt.preventDefault();
                }
            }
        }
        if (
            (evt.shiftKey && evt.key === "Enter") ||
            (keyEventHasModifier(evt, cellShortcutModifier) && evt.key === "Enter")
        ) {
            // Position the anchor near the focused element (the active cell).
            const focused = document.activeElement as HTMLElement | null;
            const cellEl = focused?.closest(".cell");
            if (cellEl) {
                const rect = cellEl.getBoundingClientRect();
                shiftEnterAnchorRef.style.position = "fixed";
                shiftEnterAnchorRef.style.left = `${rect.left}px`;
                shiftEnterAnchorRef.style.top = `${rect.bottom}px`;
            }
            setShiftEnterPopoverOpen(true);
            return evt.preventDefault();
        }
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
                    NotebookUtils.moveCellByIndex(nb, sourceIndex, finalIndex);
                });
                setCurrentDropTarget(null);
            },
        });
        onCleanup(cleanup);
    });

    return (
        <div
            class="notebook"
            onFocusOut={(evt) => {
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
                    <CellTypePopover completions={appendCommands()}>
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
                                if (i() < NotebookUtils.numCells(props.notebook) - 1) {
                                    setActiveCell(i() + 1);
                                }
                            },
                            createAbove() {
                                const index = i();
                                props.changeNotebook((nb) => {
                                    NotebookUtils.newStemCellAtIndex(nb, index);
                                });
                                setActiveCell(index);
                            },
                            createBelow() {
                                const index = i() + 1;
                                props.changeNotebook((nb) => {
                                    NotebookUtils.newStemCellAtIndex(nb, index);
                                });
                                setActiveCell(index);
                            },
                            deleteBackward() {
                                const index = i();
                                props.changeNotebook((nb) => {
                                    NotebookUtils.deleteCellAtIndex(nb, index);
                                });
                                setActiveCell(index - 1);
                            },
                            deleteForward() {
                                const index = i();
                                props.changeNotebook((nb) => {
                                    NotebookUtils.deleteCellAtIndex(nb, index);
                                });
                                setActiveCell(index);
                            },
                            moveUp() {
                                // oxlint-disable-next-line solid/reactivity -- event handler
                                props.changeNotebook((nb) => {
                                    NotebookUtils.moveCellUp(nb, i());
                                });
                            },
                            moveDown() {
                                // oxlint-disable-next-line solid/reactivity -- event handler
                                props.changeNotebook((nb) => {
                                    NotebookUtils.moveCellDown(nb, i());
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
                                // oxlint-disable-next-line solid/reactivity -- event handler
                                props.changeNotebook((nb) => {
                                    NotebookUtils.duplicateCellAtIndex(
                                        nb,
                                        index,
                                        props.duplicateCell,
                                    );
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
                                        <Match when={cell.tag === "formal"}>
                                            <props.formalCellEditor
                                                content={(cell as FormalCell<T>).content}
                                                changeContent={(f) =>
                                                    props.changeNotebook((nb) =>
                                                        NotebookUtils.mutateCellContentById(
                                                            nb,
                                                            cell.id,
                                                            f,
                                                        ),
                                                    )
                                                }
                                                isActive={isActive()}
                                                actions={cellActions}
                                            />
                                        </Match>
                                        <Match when={cell.tag === "stem"}>
                                            <StemCellEditor
                                                completions={replaceCommands(i())}
                                                isActive={isActive()}
                                                actions={cellActions}
                                            />
                                        </Match>
                                    </Switch>
                                </NotebookCell>
                            </li>
                        );
                    }}
                </For>
            </ul>
            <Popover
                open={shiftEnterPopoverOpen()}
                onOpenChange={setShiftEnterPopoverOpen}
                placement="bottom-start"
                floatingOptions={{ flip: true }}
                restoreFocus={false}
            >
                <Popover.Anchor>
                    <div
                        ref={shiftEnterAnchorRef}
                        style={{
                            position: "fixed",
                            width: "1px",
                            height: "1px",
                            "pointer-events": "none",
                        }}
                    />
                </Popover.Anchor>
                <Popover.Portal>
                    <Popover.Content class="popup">
                        <Completions
                            completions={insertCommands()}
                            onComplete={() => setShiftEnterPopoverOpen(false)}
                        />
                    </Popover.Content>
                </Popover.Portal>
            </Popover>
            <Show when={props.notebook.cellOrder.length > 0}>
                <div class="notebook-cell-placeholder">
                    <CellTypePopover completions={appendCommands()} tooltip="Create a new cell">
                        <ListPlus />
                    </CellTypePopover>
                </div>
            </Show>
        </div>
    );
}

/** A button that opens a popover with cell type completions.
 */
export function CellTypePopover(props: {
    completions: Completion[];
    tooltip?: string;
    /** Whether the button is visible. Defaults to `true`. The button always
        remains visible while the popover is open. */
    showButton?: boolean;
    children: JSX.Element;
}) {
    const [isOpen, setIsOpen] = createSignal(false);

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
