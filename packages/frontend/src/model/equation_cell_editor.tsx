import { deepEqual } from "fast-equals";
import { For, Show, createEffect, createMemo, createSignal, useContext } from "solid-js";
import invariant from "tiny-invariant";
import { P, match } from "ts-pattern";

import { type Completion, InlineInput, NameInput } from "catcolab-ui-components";
import type { DblModel, Mor, MorType, Ob, ObType, QualifiedLabel } from "catlog-wasm";
import type { Theory } from "../theory";
import { LiveModelContext } from "./context";
import type { EquationEditorProps } from "./editors";
import { obClasses } from "./object_cell_editor";

import arrowStyles from "../stdlib/arrow_styles.module.css";
import styles from "./equation_cell_editor.module.css";

type EquationCellInput = "name" | "lhs" | "rhs";

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

/** Compute the domain object of a morphism using the model. */
function morDom(model: DblModel | undefined, mor: Mor | null): Ob | null {
    if (!model || !mor) {
        return null;
    }
    try {
        return model.dom(mor);
    } catch {
        return null;
    }
}

/** Compute the codomain object of a morphism using the model. */
function morCod(model: DblModel | undefined, mor: Mor | null): Ob | null {
    if (!model || !mor) {
        return null;
    }
    try {
        return model.cod(mor);
    } catch {
        return null;
    }
}

/** Editor for an equation cell in a model.

Layout: `[name] [lhs path picker] = [rhs path picker]`.

Each path picker shows a typeable list of every simple path in the model as
completions, each rendered diagrammatically (with leading domain object).
The RHS picker is filtered to only paths whose domain and codomain match
those of the LHS path, once one is chosen.
 */
export default function EquationCellEditor(props: EquationEditorProps) {
    const liveModel = useContext(LiveModelContext);
    invariant(liveModel, "Live model should be provided as context");

    const [activeInput, setActiveInput] = createSignal<EquationCellInput>("name");

    const elaborated = (): DblModel | undefined => liveModel().elaboratedModel();

    const setLhs = (mor: Mor | null) =>
        props.modifyEquation((eqn) => {
            eqn.lhs = mor;
        });

    const setRhs = (mor: Mor | null) =>
        props.modifyEquation((eqn) => {
            eqn.rhs = mor;
        });

    const setName = (name: string) =>
        props.modifyEquation((eqn) => {
            eqn.name = name;
        });

    /** All non-identity simple paths in the model. */
    const allPaths = createMemo<Mor[]>(() => {
        const m = elaborated();
        if (!m) {
            return [];
        }
        try {
            return m.listSimplePaths(undefined).filter((mor) => !isIdentityPath(mor));
        } catch {
            return [];
        }
    });

    /** Domain and codomain of the LHS, used to filter the RHS picker. */
    const lhsDom = createMemo<Ob | null>(() => morDom(elaborated(), props.equation.lhs));
    const lhsCod = createMemo<Ob | null>(() => morCod(elaborated(), props.equation.lhs));

    /** Paths available for the RHS picker. Filters by dom/cod once LHS is set. */
    const rhsPaths = createMemo<Mor[]>(() => {
        const m = elaborated();
        const dom = lhsDom();
        const cod = lhsCod();
        if (!m || dom === null || cod === null) {
            return allPaths();
        }
        return allPaths().filter((mor) => {
            const d = morDom(m, mor);
            const c = morCod(m, mor);
            return d !== null && c !== null && deepEqual(d, dom) && deepEqual(c, cod);
        });
    });

    return (
        <div class={`formal-judgment ${styles["decl"]}`}>
            <div class={styles["name"]}>
                <NameInput
                    placeholder="Unnamed"
                    name={props.equation.name}
                    setName={setName}
                    isActive={props.isActive && activeInput() === "name"}
                    deleteBackward={props.actions.deleteBackward}
                    deleteForward={props.actions.deleteForward}
                    exitBackward={props.actions.activateAbove}
                    exitForward={() => setActiveInput("lhs")}
                    exitUp={props.actions.activateAbove}
                    exitDown={() => setActiveInput("lhs")}
                    exitRight={() => setActiveInput("lhs")}
                    hasFocused={() => {
                        setActiveInput("name");
                        props.actions.hasFocused?.();
                    }}
                />
            </div>
            <div class={styles["header"]}>
                <PathPicker
                    model={elaborated()}
                    theory={props.theory}
                    paths={allPaths()}
                    mor={props.equation.lhs}
                    setMor={setLhs}
                    isActive={props.isActive && activeInput() === "lhs"}
                    exitBackward={() => setActiveInput("name")}
                    exitForward={() => setActiveInput("rhs")}
                    exitUp={() => setActiveInput("name")}
                    exitDown={() => setActiveInput("rhs")}
                    exitLeft={() => setActiveInput("name")}
                    exitRight={() => setActiveInput("rhs")}
                    hasFocused={() => {
                        setActiveInput("lhs");
                        props.actions.hasFocused?.();
                    }}
                />
            </div>
            <div class={styles["equals"]}>{"="}</div>
            <div class={styles["rhsRow"]}>
                <PathPicker
                    model={elaborated()}
                    theory={props.theory}
                    paths={rhsPaths()}
                    mor={props.equation.rhs}
                    setMor={setRhs}
                    isActive={props.isActive && activeInput() === "rhs"}
                    exitBackward={() => setActiveInput("lhs")}
                    exitForward={props.actions.activateBelow}
                    exitUp={() => setActiveInput("lhs")}
                    exitDown={props.actions.activateBelow}
                    exitLeft={() => setActiveInput("lhs")}
                    exitRight={props.actions.activateBelow}
                    hasFocused={() => {
                        setActiveInput("rhs");
                        props.actions.hasFocused?.();
                    }}
                />
            </div>
        </div>
    );
}

/** Picker for a path in the model.

When inactive and a path is set, renders the path diagrammatically
(`A —f→ B —g→ C`). When active, an `InlineInput` is shown with the supplied
list of paths as completions.
 */
function PathPicker(props: {
    model: DblModel | undefined;
    theory: Theory;
    paths: Mor[];
    mor: Mor | null;
    setMor: (mor: Mor | null) => void;
    isActive: boolean;
    exitBackward?: () => void;
    exitForward?: () => void;
    exitUp?: () => void;
    exitDown?: () => void;
    exitLeft?: () => void;
    exitRight?: () => void;
    hasFocused?: () => void;
}) {
    /** The chosen path, if any. */
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
        return segs ? segs.morphisms.map((s) => s.label || "Unnamed").join(";") : "";
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
        const theory = props.theory;
        return props.paths
            .map((mor) => buildCompletion(m, theory, mor, props.setMor))
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
                        <PathView model={props.model} theory={props.theory} mor={mor()} />
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
                    popupClass={`formal-judgment ${styles["completionsPopup"]}`}
                    completionsEmptyText="No paths available."
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
    theory: Theory,
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
        name: segs.morphisms.map((m) => m.label || "Unnamed").join(";"),
        nameClass: styles["completionName"],
        description: <PathSegmentsView segments={segs} theory={theory} />,
        onComplete: () => setMor(mor),
    };
}

/** Render a non-identity simple path diagrammatically.

Uses the same arrow styling as `MorphismCellEditor`: a leading domain object,
followed by each segment rendered as `[name above arrow]  [cod object]`, with
arrow style and object/morphism classes coming from theory metadata.
 */
function PathView(props: { model: DblModel | undefined; theory: Theory; mor: Mor }) {
    const segments = createMemo(() => describePath(props.model, props.mor));

    return (
        <Show when={segments()} fallback={<span class={styles["error"]}>(invalid path)</span>}>
            {(segs) => <PathSegmentsView segments={segs()} theory={props.theory} />}
        </Show>
    );
}

function PathSegmentsView(props: { segments: PathSegments; theory: Theory }) {
    const domClasses = () => [
        styles["object"],
        ...obClasses(props.theory, props.segments.dom.obType),
    ];
    return (
        <div class={styles["path"]}>
            <div class={domClasses().join(" ")}>
                <UnnamedLabel label={props.segments.dom.label} />
            </div>
            <For each={props.segments.morphisms}>
                {(mor) => <PathSegmentView segment={mor} theory={props.theory} />}
            </For>
        </div>
    );
}

/** Render a single (morphism, codomain) segment of a path.

Mirrors the layout of `MorphismCellEditor`: the morphism name sits above an
arrow drawn in the theory's arrow style; the codomain is rendered with the
object type's CSS classes.
 */
function PathSegmentView(props: { segment: PathMorSegment; theory: Theory }) {
    const morTypeMeta = () =>
        props.segment.morType ? props.theory.modelMorTypeMeta(props.segment.morType) : undefined;

    const arrowClass = () => arrowStyles[morTypeMeta()?.arrowStyle ?? "default"];

    const nameClasses = () => [
        styles["morName"],
        arrowStyles.arrowName,
        ...(morTypeMeta()?.textClasses ?? []),
    ];

    const codClasses = () => [
        styles["object"],
        ...obClasses(props.theory, props.segment.cod.obType),
    ];

    return (
        <div class={styles["segment"]}>
            <div class={arrowStyles.arrowWithName}>
                <div class={nameClasses().join(" ")}>
                    <UnnamedLabel label={props.segment.label} />
                </div>
                <div class={[arrowStyles.arrowContainer, arrowClass()].join(" ")}>
                    <div class={[arrowStyles.arrow, arrowClass()].join(" ")} />
                </div>
            </div>
            <div class={codClasses().join(" ")}>
                <UnnamedLabel label={props.segment.cod.label} />
            </div>
        </div>
    );
}

/** Render a label, falling back to a styled "Unnamed" when empty. */
function UnnamedLabel(props: { label: string }) {
    return (
        <Show when={props.label} fallback={<span class={styles["unnamed"]}>Unnamed</span>}>
            {props.label}
        </Show>
    );
}

/** A single segment of a path: a morphism plus its codomain. */
type PathMorSegment = {
    label: string;
    morType: MorType | undefined;
    cod: PathObSegment;
};

/** An object as displayed in a path. */
type PathObSegment = {
    label: string;
    obType: ObType | undefined;
};

type PathSegments = {
    /** The path's domain (initial object). */
    dom: PathObSegment;
    /** N segments for a path of N morphisms. */
    morphisms: PathMorSegment[];
};

/** Compute display data for the segments making up a path.

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
        const seg = describeMorSegment(model, basicId);
        if (!seg) {
            return null;
        }
        const dom = morDom(model, mor);
        return { dom: describeObSegment(model, dom), morphisms: [seg] };
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
    if (seq === null || seq.length === 0) {
        return null;
    }
    const morphisms: PathMorSegment[] = [];
    for (const m of seq) {
        const id = match(m)
            .with({ tag: "Basic", content: P.select() }, (id) => id)
            .otherwise(() => null);
        if (id === null) {
            return null;
        }
        const seg = describeMorSegment(model, id);
        if (!seg) {
            return null;
        }
        morphisms.push(seg);
    }
    const dom = morDom(model, mor);
    return { dom: describeObSegment(model, dom), morphisms };
}

function describeMorSegment(model: DblModel, id: string): PathMorSegment | null {
    const pres = model.morPresentation(id);
    if (!pres) {
        return null;
    }
    return {
        label: labelToString(model.morGeneratorLabel(id)),
        morType: pres.morType,
        cod: describeObSegment(model, pres.cod),
    };
}

function describeObSegment(model: DblModel, ob: Ob | null): PathObSegment {
    if (ob === null) {
        return { label: "", obType: undefined };
    }
    const id = basicObId(ob);
    let obType: ObType | undefined;
    try {
        obType = model.obType(ob);
    } catch {
        obType = undefined;
    }
    return {
        label: id !== null ? labelToString(model.obGeneratorLabel(id)) : "",
        obType,
    };
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
