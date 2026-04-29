import { For, Show, createMemo, createSignal, useContext } from "solid-js";
import invariant from "tiny-invariant";
import { match, P } from "ts-pattern";

import { NameInput } from "catcolab-ui-components";
import type { DblModel, Mor, NameLookup, Ob, QualifiedLabel, QualifiedName } from "catlog-wasm";
import { IdInput } from "../components";
import { LiveModelContext } from "./context";
import type { EquationEditorProps } from "./editors";

import styles from "./equation_cell_editor.module.css";

type EquationCellInput = "name" | "ob";

/** Extract the starting object from an equation's lhs.

The cell stores its starting object as `lhs = Mor::Composite(Path::Id(ob))`.
Returns null if the lhs is missing or doesn't have that shape.
 */
function getStartingOb(mor: Mor | null): Ob | null {
    return match(mor)
        .with(
            {
                tag: "Composite",
                content: {
                    tag: "Id",
                    content: P.select(),
                },
            },
            (ob) => ob,
        )
        .otherwise(() => null);
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
        .with(
            {
                tag: "Basic",
                content: P.select(),
            },
            (id) => id,
        )
        .otherwise(() => null);
}

/** Editor for an equation cell in a model.

Initial behaviour: the user picks a starting object, and we list every simple
path beginning at that object. Each path is rendered diagrammatically
(`A —f→ B —g→ C`).
 */
export default function EquationCellEditor(props: EquationEditorProps) {
    const liveModel = useContext(LiveModelContext);
    invariant(liveModel, "Live model should be provided as context");

    const [activeInput, setActiveInput] = createSignal<EquationCellInput>("name");

    const elaborated = (): DblModel | undefined => liveModel().elaboratedModel();

    const startingOb = createMemo<Ob | null>(() => getStartingOb(props.equation.lhs));

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
                    exitForward={props.actions.activateBelow}
                    exitUp={props.actions.activateAbove}
                    exitDown={props.actions.activateBelow}
                    exitLeft={() => setActiveInput("name")}
                    exitRight={props.actions.activateBelow}
                    hasFocused={() => {
                        setActiveInput("ob");
                        props.actions.hasFocused?.();
                    }}
                />
            </div>
            <PathList model={elaborated()} from={startingOb()} />
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

/** List of all simple paths from a given starting object. */
function PathList(props: { model: DblModel | undefined; from: Ob | null }) {
    /** Result of `boundedSimplePathsFrom`, with the identity path filtered out. */
    const paths = createMemo<Mor[] | null>(() => {
        const m = props.model;
        const from = props.from;
        if (!m || !from) {
            return null;
        }
        try {
            return m.boundedSimplePathsFrom(from, undefined).filter((mor) => !isIdentityPath(mor));
        } catch {
            // Object not in model yet, or other transient error.
            return null;
        }
    });

    return (
        <Show when={props.from && paths() && (paths() as Mor[]).length > 0}>
            <div class={styles["paths"]}>
                <For each={paths() ?? []}>
                    {(mor) => <PathView model={props.model} mor={mor} />}
                </For>
            </div>
        </Show>
    );
}

/** Render a non-identity simple path diagrammatically.

Displays the codomain after each morphism but omits the leading domain
(which is the starting object, already shown in the cell header).
 */
function PathView(props: { model: DblModel | undefined; mor: Mor }) {
    const segments = createMemo(() => describePath(props.model, props.mor));

    return (
        <div class={styles["path"]}>
            <Show when={segments()} fallback={<span class={styles["error"]}>(invalid path)</span>}>
                {(segs) => (
                    <For each={segs().morphisms}>
                        {(mor, i) => (
                            <>
                                <span class={styles["arrow"]}>{"—"}</span>
                                <span class={styles["morName"]}>{mor || "?"}</span>
                                <span class={styles["arrow"]}>{"→"}</span>
                                <span class={styles["object"]}>{segs().codomains[i()] ?? "?"}</span>
                            </>
                        )}
                    </For>
                )}
            </Show>
        </div>
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
                content: {
                    tag: "Seq",
                    content: P.select(),
                },
            },
            (xs) => xs,
        )
        .otherwise(() => null);
    if (seq !== null) {
        return seqSegments(model, seq);
    }

    // Identity paths are filtered out before reaching here, and any other
    // shape (e.g. tabulator squares) is not expected from `boundedSimplePathsFrom`.
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
        .otherwise(() => "?");
}

function labelToString(label: QualifiedLabel | undefined): string {
    if (!label || label.length === 0) {
        return "";
    }
    return label.map((seg) => (typeof seg === "string" ? seg : String(seg))).join(".");
}
