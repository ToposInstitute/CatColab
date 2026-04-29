import { For, Show, createEffect, createMemo, createSignal, useContext } from "solid-js";
import invariant from "tiny-invariant";
import { match, P } from "ts-pattern";

import { type Completion, InlineInput, NameInput } from "catcolab-ui-components";
import type { DblModel, Mor, NameLookup, Ob, QualifiedLabel, QualifiedName } from "catlog-wasm";
import { IdInput } from "../components";
import { LiveModelContext } from "./context";
import type { EquationEditorProps } from "./editors";

import styles from "./equation_cell_editor.module.css";

type EquationCellInput = "name" | "ob" | "lhs";

/** Extract the starting object from an equation's lhs.

The cell stores its starting object as `lhs = Mor::Composite(Path::Id(ob))`
when only the starting object has been chosen, and as the chosen path
otherwise (in which case the starting object is its domain, looked up via
the model).
 */
function getStartingOb(mor: Mor | null, model: DblModel | undefined): Ob | null {
    if (!mor) {
        return null;
    }
    // Identity path: the object is encoded directly.
    const idOb = match(mor)
        .with({ tag: "Composite", content: { tag: "Id", content: P.select() } }, (ob) => ob)
        .otherwise(() => null);
    if (idOb !== null) {
        return idOb;
    }
    // Non-identity path: look up the domain in the model.
    if (!model) {
        return null;
    }
    try {
        return model.dom(mor);
    } catch {
        return null;
    }
}

/** Is this morphism an identity path, `Mor::Composite(Path::Id(_))`? */
function isIdentityPath(mor: Mor): boolean {
    return match(mor)
        .with({ tag: "Composite", content: { tag: "Id" } }, () => true)
        .otherwise(() => false);
}

/** Extract the basic-object id from an Ob, if it is a basic object. */
function basicObId(ob: Ob | null): string | null {
    return match(ob)
        .with({ tag: "Basic", content: P.select() }, (id) => id)
        .otherwise(() => null);
}

/** Editor for an equation cell in a model.

Layout: `[name] [starting object] [lhs path picker]`.

The lhs path picker shows a typeable list of every simple path from the
starting object as completions, each rendered diagrammatically.
 */
export default function EquationCellEditor(props: EquationEditorProps) {
    const liveModel = useContext(LiveModelContext);
    invariant(liveModel, "Live model should be provided as context");

    const [activeInput, setActiveInput] = createSignal<EquationCellInput>("name");

    const elaborated = (): DblModel | undefined => liveModel().elaboratedModel();

    const startingOb = createMemo<Ob | null>(() => getStartingOb(props.equation.lhs, elaborated()));

    /** Set the starting object.

    Replaces `lhs` with the identity path at the new object. If a non-identity
    path was previously selected, this discards it (since the starting object
    has changed).
     */
    const setStartingOb = (ob: Ob | null) => {
        props.modifyEquation((eqn) => {
            eqn.lhs = ob
                ? {
                      tag: "Composite",
                      content: { tag: "Id", content: ob },
                  }
                : null;
        });
    };

    const setLhs = (mor: Mor | null) =>
        props.modifyEquation((eqn) => {
            eqn.lhs = mor;
        });

    const setName = (name: string) =>
        props.modifyEquation((eqn) => {
            eqn.name = name;
        });

    /** All object generators in the model, used as completions. */
    const obCompletions = (): QualifiedName[] | undefined => elaborated()?.obGenerators();

    const obIdToLabel = (id: QualifiedName): QualifiedLabel | undefined =>
        elaborated()?.obGeneratorLabel(id);
    const obLabelToId = (label: QualifiedLabel): NameLookup | undefined =>
        elaborated()?.obGeneratorWithLabel(label);

    return (
        <div class={`formal-judgment ${styles["decl"]}`}>
            <div class={styles["header"]}>
                <div class={styles["name"]}>
                    <NameInput
                        placeholder="Unnamed"
                        name={props.equation.name}
                        setName={setName}
                        isActive={props.isActive && activeInput() === "name"}
                        deleteBackward={props.actions.deleteBackward}
                        deleteForward={props.actions.deleteForward}
                        exitBackward={props.actions.activateAbove}
                        exitForward={() => setActiveInput("ob")}
                        exitUp={props.actions.activateAbove}
                        exitDown={() => setActiveInput("ob")}
                        exitRight={() => setActiveInput("ob")}
                        hasFocused={() => {
                            setActiveInput("name");
                            props.actions.hasFocused?.();
                        }}
                    />
                </div>
                <ObPicker
                    ob={startingOb()}
                    setOb={setStartingOb}
                    completions={obCompletions()}
                    idToLabel={obIdToLabel}
                    labelToId={obLabelToId}
                    isActive={props.isActive && activeInput() === "ob"}
                    placeholder="…"
                    exitBackward={() => setActiveInput("name")}
                    exitForward={() => setActiveInput("lhs")}
                    exitUp={props.actions.activateAbove}
                    exitDown={() => setActiveInput("lhs")}
                    exitLeft={() => setActiveInput("name")}
                    exitRight={() => setActiveInput("lhs")}
                    hasFocused={() => {
                        setActiveInput("ob");
                        props.actions.hasFocused?.();
                    }}
                />
                <PathPicker
                    model={elaborated()}
                    from={startingOb()}
                    mor={props.equation.lhs}
                    setMor={setLhs}
                    isActive={props.isActive && activeInput() === "lhs"}
                    isCellActive={props.isActive}
                    exitBackward={() => setActiveInput("ob")}
                    exitForward={props.actions.activateBelow}
                    exitUp={props.actions.activateAbove}
                    exitDown={props.actions.activateBelow}
                    exitLeft={() => setActiveInput("ob")}
                    exitRight={props.actions.activateBelow}
                    hasFocused={() => {
                        setActiveInput("lhs");
                        props.actions.hasFocused?.();
                    }}
                />
            </div>
        </div>
    );
}

/** Picker for any basic object generator in the model.

Unlike `ObInput`, this is not restricted to a particular object type so that
the equation cell can list paths starting from any object regardless of
its type.
 */
function ObPicker(allProps: {
    ob: Ob | null;
    setOb: (ob: Ob | null) => void;
    completions?: QualifiedName[];
    idToLabel?: (id: QualifiedName) => QualifiedLabel | undefined;
    labelToId?: (label: QualifiedLabel) => NameLookup | undefined;
    isActive: boolean;
    placeholder?: string;
    exitBackward?: () => void;
    exitForward?: () => void;
    exitUp?: () => void;
    exitDown?: () => void;
    exitLeft?: () => void;
    exitRight?: () => void;
    hasFocused?: () => void;
}) {
    const id = (): QualifiedName | null => basicObId(allProps.ob);
    const setId = (newId: QualifiedName | null) => {
        allProps.setOb(
            newId === null
                ? null
                : {
                      tag: "Basic",
                      content: newId,
                  },
        );
    };

    return (
        <IdInput
            id={id()}
            setId={setId}
            completions={allProps.completions}
            idToLabel={allProps.idToLabel}
            labelToId={allProps.labelToId}
            isActive={allProps.isActive}
            placeholder={allProps.placeholder}
            exitBackward={allProps.exitBackward}
            exitForward={allProps.exitForward}
            exitUp={allProps.exitUp}
            exitDown={allProps.exitDown}
            exitLeft={allProps.exitLeft}
            exitRight={allProps.exitRight}
            hasFocused={allProps.hasFocused}
        />
    );
}

/** Picker for a path starting at a given object.

When inactive and a non-identity path is set, renders the path
diagrammatically (`—f→ B —g→ C`). When active, an `InlineInput` is shown with
all simple paths from the starting object as completions.
 */
function PathPicker(props: {
    model: DblModel | undefined;
    from: Ob | null;
    mor: Mor | null;
    setMor: (mor: Mor | null) => void;
    isActive: boolean;
    isCellActive: boolean;
    exitBackward?: () => void;
    exitForward?: () => void;
    exitUp?: () => void;
    exitDown?: () => void;
    exitLeft?: () => void;
    exitRight?: () => void;
    hasFocused?: () => void;
}) {
    /** All non-identity simple paths from the starting object. */
    const paths = createMemo<Mor[]>(() => {
        const m = props.model;
        const from = props.from;
        if (!m || !from) {
            return [];
        }
        try {
            return m.boundedSimplePathsFrom(from, undefined).filter((mor) => !isIdentityPath(mor));
        } catch {
            return [];
        }
    });

    /** The chosen path, if any. The identity path counts as "no choice". */
    const chosenPath = createMemo<Mor | null>(() => {
        const mor = props.mor;
        if (!mor || isIdentityPath(mor)) {
            return null;
        }
        return mor;
    });

    /** Compute the typeable text for a path: morphism labels joined by `;`.
        Unlabelled morphisms show as "Unnamed". */
    const pathText = (mor: Mor | null): string => {
        const m = props.model;
        if (!m || !mor) {
            return "";
        }
        const segs = describePath(m, mor);
        return segs ? segs.morphisms.map((s) => s || "Unnamed").join(";") : "";
    };

    /** Free-form text in the input.

    Synced from the chosen path whenever the picker is not the active input,
    so re-entering edit mode pre-fills with the chosen path's name and the
    completions list is filtered to it.
     */
    const [text, setText] = createSignal("");

    createEffect(() => {
        if (!props.isActive) {
            setText(pathText(chosenPath()));
        }
    });

    const completions = (): Completion[] => {
        const m = props.model;
        if (!m) {
            return [];
        }
        return paths()
            .map((mor) => buildCompletion(m, mor, props.setMor))
            .filter((c): c is Completion => c !== null);
    };

    /** Show the input when the picker is the active input or no path is chosen. */
    const showInput = () => props.isActive || chosenPath() === null;

    return (
        <div class={styles["pathPicker"]}>
            <Show when={!showInput() ? chosenPath() : null}>
                {(mor) => (
                    <button
                        type="button"
                        class={styles["pathDisplay"]}
                        onMouseDown={(evt) => {
                            props.hasFocused?.();
                            evt.preventDefault();
                        }}
                    >
                        <PathView model={props.model} mor={mor()} />
                    </button>
                )}
            </Show>
            <Show when={showInput()}>
                <InlineInput
                    text={text()}
                    setText={setText}
                    placeholder="path…"
                    completions={completions()}
                    showCompletionsOnFocus={true}
                    completionsEmptyText={
                        props.from === undefined || props.from === null
                            ? "Choose a starting object."
                            : "No paths available."
                    }
                    isActive={props.isActive}
                    hasFocused={props.hasFocused}
                    exitBackward={props.exitBackward}
                    exitForward={props.exitForward}
                    exitUp={props.exitUp}
                    exitDown={props.exitDown}
                    exitLeft={props.exitLeft}
                    exitRight={props.exitRight}
                />
            </Show>
        </div>
    );
}

/** Build a completion entry for a path. */
function buildCompletion(
    model: DblModel,
    mor: Mor,
    setMor: (mor: Mor | null) => void,
): Completion | null {
    const segs = describePath(model, mor);
    if (!segs) {
        return null;
    }
    return {
        // The typeable name: morphism labels joined by the diagrammatic
        // composition operator `;`. Unlabelled morphisms show as "Unnamed".
        name: segs.morphisms.map((s) => s || "Unnamed").join(";"),
        nameClass: styles["completionName"],
        description: <PathSegmentsView segments={segs} />,
        onComplete: () => setMor(mor),
    };
}

/** Render a non-identity simple path diagrammatically.

Displays the codomain after each morphism but omits the leading domain
(which is the starting object, already shown in the cell header).
 */
function PathView(props: { model: DblModel | undefined; mor: Mor }) {
    const segments = createMemo(() => describePath(props.model, props.mor));

    return (
        <Show when={segments()} fallback={<span class={styles["error"]}>(invalid path)</span>}>
            {(segs) => <PathSegmentsView segments={segs()} />}
        </Show>
    );
}

function PathSegmentsView(props: { segments: PathSegments }) {
    return (
        <span class={styles["path"]}>
            <For each={props.segments.morphisms}>
                {(mor, i) => (
                    <>
                        <span class={styles["arrow"]}>{"—"}</span>
                        <UnnamedAware label={mor} class={styles["morName"]} />
                        <span class={styles["arrow"]}>{"→"}</span>
                        <UnnamedAware
                            label={props.segments.codomains[i()] ?? ""}
                            class={styles["object"]}
                        />
                    </>
                )}
            </For>
        </span>
    );
}

/** Render a label, falling back to a styled "Unnamed" when empty. */
function UnnamedAware(props: { label: string; class?: string }) {
    return (
        <Show
            when={props.label}
            fallback={<span class={`${props.class ?? ""} ${styles["unnamed"]}`}>Unnamed</span>}
        >
            <span class={props.class}>{props.label}</span>
        </Show>
    );
}

type PathSegments = {
    /** N codomain labels for a path of N morphisms. */
    codomains: string[];
    /** N morphism labels. */
    morphisms: string[];
};

/** Compute display labels for the codomains and morphisms making up a path.

Returns null if the morphism cannot be presented (e.g., contains
non-basic morphisms or is an identity, which we don't render here).
 */
function describePath(model: DblModel | undefined, mor: Mor): PathSegments | null {
    if (!model) {
        return null;
    }

    // Single-morphism path written as Mor::Basic(uuid).
    const basicId = match(mor)
        .with({ tag: "Basic", content: P.select() }, (id) => id)
        .otherwise(() => null);
    if (basicId !== null) {
        return basicMorSegments(model, basicId);
    }

    // Composite sequence: Mor::Composite(Path::Seq([Mor::Basic, ...])).
    const seq = match(mor)
        .with(
            {
                tag: "Composite",
                content: { tag: "Seq", content: P.select() },
            },
            (xs) => xs,
        )
        .otherwise(() => null);
    if (seq !== null) {
        return seqSegments(model, seq);
    }

    return null;
}

function basicMorSegments(model: DblModel, id: string): PathSegments | null {
    const pres = model.morPresentation(id);
    if (!pres) {
        return null;
    }
    return {
        codomains: [obLabel(model, pres.cod)],
        morphisms: [labelToString(model.morGeneratorLabel(id))],
    };
}

function seqSegments(model: DblModel, seq: Mor[]): PathSegments | null {
    if (seq.length === 0) {
        return null;
    }
    const codomains: string[] = [];
    const morphisms: string[] = [];
    for (const m of seq) {
        const id = match(m)
            .with({ tag: "Basic", content: P.select() }, (id) => id)
            .otherwise(() => null);
        if (id === null) {
            return null;
        }
        const pres = model.morPresentation(id);
        if (!pres) {
            return null;
        }
        morphisms.push(labelToString(model.morGeneratorLabel(id)));
        codomains.push(obLabel(model, pres.cod));
    }
    return { codomains, morphisms };
}

function obLabel(model: DblModel, ob: Ob): string {
    return match(ob)
        .with({ tag: "Basic", content: P.select() }, (id) =>
            labelToString(model.obGeneratorLabel(id)),
        )
        .otherwise(() => "");
}

/** Render a qualified label as a dotted string, or "" if no label is set.

The `""` case is handled by the consumer (typically rendered as a styled
"Unnamed" placeholder).
 */
function labelToString(label: QualifiedLabel | undefined): string {
    if (!label || label.length === 0) {
        return "";
    }
    return label.map((seg) => (typeof seg === "string" ? seg : String(seg))).join(".");
}
