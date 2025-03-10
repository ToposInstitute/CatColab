import { extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import { getReorderDestinationIndex } from "@atlaskit/pragmatic-drag-and-drop-hitbox/util/get-reorder-destination-index";
import { monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import type { DocHandle, Prop } from "@automerge/automerge-repo";
import { type KbdKey, createShortcut } from "@solid-primitives/keyboard";
import ListPlus from "lucide-solid/icons/list-plus";

import {
    type Component,
    For,
    Match,
    Show,
    Switch,
    createEffect,
    createSignal,
    onCleanup,
} from "solid-js";

import { type Completion, IconButton } from "../components";
import { deepCopyJSON } from "../util/deepcopy";
import {
    type CellActions,
    type FormalCellEditorProps,
    NotebookCell,
    RichTextCellEditor,
    StemCellEditor,
    isCellDragData,
} from "./notebook_cell";
import {
    type Cell,
    type FormalCell,
    type Notebook,
    newFormalCell,
    newRichTextCell,
    newStemCell,
} from "./types";

import "./notebook_editor.css";

export function WalkthroughOverlay(props: { isOpen: boolean; onClose: () => void }) {
    const [currentStep, setCurrentStep] = createSignal(0);
    const totalSteps = 3;

    // For the intro carousel
    const [currentContentIndex, setCurrentContentIndex] = createSignal(0);
    const introContent = [
        {
            id: "sir-model",
            type: "image",
            src: "https://topos.institute/work/catcolab/examples/sir.png",
            alt: "A simple SIR (Susceptible, Infectious, or Recovered) model, along with a mass-actions dynamics visualisation",
            caption:
                "A simple SIR (Susceptible, Infectious, or Recovered) model, along with a mass-actions dynamics visualisation",
        },
        {
            id: "vortices",
            type: "video",
            src: "https://topos.institute/work/catcolab/examples/vortices.mov",
            alt: "Video showing inviscid vorticity visualization",
            caption:
                "Inviscid vorticity, visualised by automatic interfacing with Decapodes.jl in AlgebraicJulia",
        },
        {
            id: "emissions",
            type: "video",
            src: "https://topos.institute/work/catcolab/examples/emissions.mov",
            alt: "Video showing a cap-and-trade system model",
            caption:
                "Searching for feedback loops in a model of the impacts of a cap-and-trade system",
        },
    ];

    // Auto-scroll timer for intro content
    createEffect(() => {
        let timer: number;

        if (props.isOpen && currentStep() === 0) {
            timer = window.setInterval(() => {
                setCurrentContentIndex((currentContentIndex() + 1) % introContent.length);
            }, 5000); // Change content every 5 seconds
        }

        return () => {
            if (timer) {
                clearInterval(timer);
            }
        };
    });

    const nextStep = () => {
        if (currentStep() < totalSteps - 1) {
            setCurrentStep(currentStep() + 1);
        } else {
            props.onClose();
        }
    };

    const prevStep = () => {
        if (currentStep() > 0) {
            setCurrentStep(currentStep() - 1);
        }
    };

    const skipWalkthrough = () => {
        props.onClose();
    };

    // Keyboard navigation
    const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === "ArrowRight") {
            nextStep();
        } else if (event.key === "ArrowLeft") {
            prevStep();
        } else if (event.key === "Escape") {
            skipWalkthrough();
        }
    };

    // Attach event listener for keyboard navigation
    createEffect(() => {
        if (props.isOpen) {
            window.addEventListener("keydown", handleKeyDown);
        }
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    });

    return (
        <div
            class={`overlay ${props.isOpen ? "open" : ""}`}
            onClick={skipWalkthrough}
            role="dialog"
            aria-labelledby="walkthrough-title"
            aria-modal="true"
        >
            <div class="walkthrough-content" onClick={(e) => e.stopPropagation()}>
                <div class="header-container">
                    <img
                        src="https://topos.institute/assets/logo-name.png"
                        alt="Topos Institute"
                        class="topos-logo"
                    />
                </div>

                <Show when={currentStep() === 0}>
                    <div class="step-content fade-in">
                        <header>
                            <h1>Welcome to CatColab</h1>
                            <p>
                                A collaborative environment for formal, interoperable, conceptual
                                modeling
                            </p>
                        </header>
                        <div class="intro-content carousel">
                            {introContent.map((content) => (
                                <div
                                    key={content.id}
                                    class={`carousel-item ${currentContentIndex() === introContent.indexOf(content) ? "active" : ""}`}
                                >
                                    <div class="media-container">
                                        {content.type === "image" ? (
                                            <img src={content.src} alt={content.alt} />
                                        ) : (
                                            <video src={content.src} autoplay loop muted />
                                        )}
                                    </div>
                                    <p class="carousel-caption">{content.caption}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </Show>

                <Show when={currentStep() === 1}>
                    <div class="step-content fade-in">
                        <h2>Key Features</h2>
                        <div class="features-grid">
                            <div class="feature">
                                <span class="feature-icon">📐</span>
                                <h3>Formal Modeling</h3>
                                <p>
                                    Build precise, formal models using category theory and related
                                    formalisms
                                </p>
                            </div>
                            <div class="feature">
                                <span class="feature-icon">🔄</span>
                                <h3>Interoperability</h3>
                                <p>Connect and transform between different modeling languages</p>
                            </div>
                            <div class="feature">
                                <span class="feature-icon">👥</span>
                                <h3>Collaboration</h3>
                                <p>Work together with colleagues in real-time on shared models</p>
                            </div>
                            <div class="feature">
                                <span class="feature-icon">🔍</span>
                                <h3>Verification</h3>
                                <p>Check the consistency and correctness of your models</p>
                            </div>
                        </div>
                    </div>
                </Show>

                <Show when={currentStep() === 2}>
                    <div class="step-content fade-in">
                        <h2>Resources & Community</h2>
                        <div class="resources-container">
                            <div class="resources-list">
                                <a
                                    href="https://topos.institute/work/catcolab/"
                                    class="resource-link"
                                    target="_blank"
                                >
                                    <span class="resource-icon">📚</span>
                                    <span>CatColab Overview</span>
                                </a>
                                <a
                                    href="https://catcolab.org/help/quick-intro"
                                    class="resource-link"
                                    target="_blank"
                                >
                                    <span class="resource-icon">🚀</span>
                                    <span>Quick Introduction</span>
                                </a>
                                <a
                                    href="https://topos.institute/blog/#category=CatColab"
                                    class="resource-link"
                                    target="_blank"
                                >
                                    <span class="resource-icon">📝</span>
                                    <span>Blog & Use Cases</span>
                                </a>
                                <a
                                    href="https://catcolab.org/dev/index.xml"
                                    class="resource-link"
                                    target="_blank"
                                >
                                    <span class="resource-icon">👨‍💻</span>
                                    <span>Developer Documentation</span>
                                </a>
                                <a
                                    href="https://github.com/ToposInstitute/CatColab"
                                    class="resource-link"
                                    target="_blank"
                                >
                                    <span class="resource-icon">💻</span>
                                    <span>Source Code (GitHub)</span>
                                </a>
                                <a
                                    href="mailto:kevin@topos.institute"
                                    class="resource-link"
                                    target="_blank"
                                >
                                    <span class="resource-icon">📧</span>
                                    <span>Give Us Feedback</span>
                                </a>
                            </div>
                        </div>
                    </div>
                </Show>

                <div class="footer-container">
                    <div class="progress-bar">
                        {Array.from({ length: totalSteps }).map((_, step) => {
                            const isActive = step === currentStep();
                            const isCompleted = step < currentStep();
                            return (
                                <div
                                    key={`step-dot-${step + 1}`}
                                    class={`progress-dot ${isActive ? "active" : ""} ${isCompleted ? "completed" : ""}`}
                                    onClick={() => setCurrentStep(step)}
                                />
                            );
                        })}
                    </div>

                    <div class="navigation-buttons">
                        <Show when={currentStep() < totalSteps - 1}>
                            <button class="nav-button next" onClick={nextStep}>
                                Next
                            </button>
                        </Show>
                        <button class="nav-button get-started" onClick={props.onClose}>
                            {currentStep() < totalSteps - 1 ? "Get Started" : "Get Started"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
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
    const [activeCell, setActiveCell] = createSignal(props.notebook.cells.length > 0 ? 0 : -1);
    const [isOverlayOpen, setOverlayOpen] = createSignal(true); // Open overlay by default

    // Set up commands and their keyboard shortcuts.

    const addAfterActiveCell = (cell: Cell<T>) => {
        props.changeNotebook((nb) => {
            const i = Math.min(activeCell() + 1, nb.cells.length);
            nb.cells.splice(i, 0, cell);
            setActiveCell(i);
        });
    };

    const addOrReplaceActiveCell = (cell: Cell<T>) => {
        const c = props.notebook.cells[activeCell()];
        if (c) {
            if (c.tag === "formal" || c.tag === "rich-text") {
                addAfterActiveCell(cell);
            } else if (c.tag === "stem") {
                replaceCellWith(activeCell(), cell);
            }
        } else {
            addAfterActiveCell(cell);
        }
    };

    const appendCell = (cell: Cell<T>) => {
        props.changeNotebook((nb) => {
            nb.cells.push(cell);
            setActiveCell(nb.cells.length - 1);
        });
    };

    const insertCommands = (): Completion[] =>
        cellConstructors().map((cc) => {
            const { name, description, shortcut } = cc;
            return {
                name,
                description,
                shortcut,
                onComplete: () => addOrReplaceActiveCell(cc.construct()),
            };
        });

    const replaceCellWith = (i: number, cell: Cell<T>) => {
        props.changeNotebook((nb) => {
            nb.cells[i] = cell;
        });
    };

    const duplicateCell = (cell: Cell<T>): Cell<T> => {
        if (cell.tag === "formal") {
            const content = (props.duplicateCell ?? deepCopyJSON)(cell.content);
            return newFormalCell(content);
        } else if (cell.tag === "rich-text") {
            return newRichTextCell(cell.content);
        } else if (cell.tag === "stem") {
            return newStemCell();
        }
        throw new Error(`Cell with unknown tag: ${cell}`);
    };

    const cellConstructors = (): CellConstructor<T>[] => [
        {
            name: "Text",
            description: "Start writing text",
            shortcut: [cellShortcutModifier, "T"],
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
                shortcut,
                onComplete: () => replaceCellWith(i, cc.construct()),
            };
        });

    createEffect(() => {
        if (props.noShortcuts) {
            return;
        }
        for (const command of insertCommands()) {
            if (command.shortcut) {
                createShortcut(command.shortcut, () => command.onComplete?.());
            }
        }
        createShortcut(["Shift", "Enter"], () => addAfterActiveCell(newStemCell()));
    });

    // Set up drag and drop of notebook cells.
    createEffect(() => {
        const cleanup = monitorForElements({
            canMonitor({ source }) {
                return (
                    isCellDragData(source.data) &&
                    props.notebook.cells.some((cell) => cell.id === source.data.cellId)
                );
            },
            onDrop({ location, source }) {
                const target = location.current.dropTargets[0];
                if (!(target && isCellDragData(source.data) && isCellDragData(target.data))) {
                    return;
                }
                const [sourceId, targetId] = [source.data.cellId, target.data.cellId];
                const nb = props.notebook;
                const sourceIndex = nb.cells.findIndex((cell) => cell.id === sourceId);
                const targetIndex = nb.cells.findIndex((cell) => cell.id === targetId);
                if (sourceIndex < 0 || targetIndex < 0) {
                    return;
                }
                const finalIndex = getReorderDestinationIndex({
                    startIndex: sourceIndex,
                    indexOfTarget: targetIndex,
                    closestEdgeOfTarget: extractClosestEdge(target.data),
                    axis: "vertical",
                });
                props.changeNotebook((nb) => {
                    const [cell] = nb.cells.splice(sourceIndex, 1);
                    nb.cells.splice(finalIndex, 0, deepCopyJSON(cell));
                });
            },
        });
        onCleanup(cleanup);
    });

    const toggleOverlay = () => {
        setOverlayOpen(!isOverlayOpen());
    };

    return (
        <div class="notebook">
            <WalkthroughOverlay isOpen={isOverlayOpen()} onClose={toggleOverlay} />
            <Show when={props.notebook.cells.length === 0}>
                <div class="notebook-empty placeholder">
                    <IconButton onClick={() => appendCell(newStemCell())}>
                        <ListPlus />
                    </IconButton>
                    <span>Click button or press Shift-Enter to create a cell</span>
                </div>
            </Show>
            <ul class="notebook-cells">
                <For each={props.notebook.cells}>
                    {(cell, i) => {
                        const isActive = () => activeCell() === i();
                        const cellActions: CellActions = {
                            activateAbove() {
                                i() > 0 && setActiveCell(i() - 1);
                            },
                            activateBelow() {
                                const n = props.notebook.cells.length;
                                i() < n - 1 && setActiveCell(i() + 1);
                            },
                            createAbove() {
                                props.changeNotebook((nb) => {
                                    nb.cells.splice(i(), 0, newStemCell());
                                    setActiveCell(i());
                                });
                            },
                            createBelow() {
                                props.changeNotebook((nb) => {
                                    nb.cells.splice(i() + 1, 0, newStemCell());
                                    setActiveCell(i() + 1);
                                });
                            },
                            deleteBackward() {
                                props.changeNotebook((nb) => {
                                    nb.cells.splice(i(), 1);
                                    setActiveCell(i() - 1);
                                });
                            },
                            deleteForward() {
                                props.changeNotebook((nb) => {
                                    nb.cells.splice(i(), 1);
                                    setActiveCell(i());
                                });
                            },
                            duplicate() {
                                const cell = props.notebook.cells[i()];
                                props.changeNotebook((nb) => {
                                    cell && nb.cells.splice(i() + 1, 0, duplicateCell(cell));
                                });
                            },
                            moveUp() {
                                props.changeNotebook((nb) => {
                                    if (i() > 0) {
                                        const [cellToMoveUp] = nb.cells.splice(i(), 1);
                                        nb.cells.splice(i() - 1, 0, deepCopyJSON(cellToMoveUp));
                                    }
                                });
                            },
                            moveDown() {
                                props.changeNotebook((nb) => {
                                    if (i() < nb.cells.length - 1) {
                                        const [cellToMoveDown] = nb.cells.splice(i(), 1);
                                        nb.cells.splice(i() + 1, 0, deepCopyJSON(cellToMoveDown));
                                    }
                                });
                            },
                            hasFocused() {
                                setActiveCell(i());
                            },
                        };

                        return (
                            <li>
                                <NotebookCell
                                    cellId={cell.id}
                                    actions={cellActions}
                                    tag={
                                        cell.tag === "formal"
                                            ? props.cellLabel?.(cell.content)
                                            : undefined
                                    }
                                >
                                    <Switch>
                                        <Match when={cell.tag === "rich-text"}>
                                            <RichTextCellEditor
                                                cellId={cell.id}
                                                handle={props.handle}
                                                path={[...props.path, "cells", i()]}
                                                isActive={isActive()}
                                                actions={cellActions}
                                            />
                                        </Match>
                                        <Match when={cell.tag === "formal"}>
                                            <props.formalCellEditor
                                                content={(cell as FormalCell<T>).content}
                                                changeContent={(f) => {
                                                    props.changeNotebook((nb) => {
                                                        f((nb.cells[i()] as FormalCell<T>).content);
                                                    });
                                                }}
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
            <Show when={props.notebook.cells.some((cell) => cell.tag !== "stem")}>
                <div class="placeholder">
                    <IconButton
                        onClick={() => appendCell(newStemCell())}
                        tooltip="Create a new cell"
                    >
                        <ListPlus />
                    </IconButton>
                </div>
            </Show>
        </div>
    );
}

/** Modifier key to use in keyboard shortcuts for cell constructors.

The choice is platform-specific: On Mac, the Alt/Option key remaps keys, so we
use Control, whereas on other platforms Control tends to be already bound in
other shortcuts, so we Alt.
 */
export const cellShortcutModifier: KbdKey = navigator.userAgent.includes("Mac") ? "Control" : "Alt";
