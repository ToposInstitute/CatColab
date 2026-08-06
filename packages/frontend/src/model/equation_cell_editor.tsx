import { createEffect, createMemo, createSignal, useContext } from "solid-js";
import invariant from "tiny-invariant";
import { P, match } from "ts-pattern";

import {
    type FocusHandle,
    InlineListEditor,
    NameInput,
    useChildFocus,
} from "catcolab-ui-components";
import type { DblModel, Mor, Ob, QualifiedName, Uuid } from "catlog-wasm";
import { removeProxyAndCopy } from "../util/remove_proxy_and_copy";
import { LiveModelContext } from "./context";
import type { EquationEditorProps } from "./editors";
import { PathMorInput } from "./path_mor_input";

import styles from "./equation_cell_editor.module.css";

type EquationCellInput = "name" | "lhs" | "rhs";

/** Editor for an equation cell in a model. */
export default function EquationCellEditor(props: EquationEditorProps) {
    const liveModel = useContext(LiveModelContext);
    invariant(liveModel, "Live model should be provided as context");

    // oxlint-disable-next-line solid/reactivity -- Focus handles are stable for a mounted cell.
    const focus = useChildFocus<EquationCellInput>(props.focus, { default: "name" });

    const completions = (): QualifiedName[] | undefined =>
        liveModel().elaboratedModel()?.morGenerators();

    const lhs = createMemo(() => morToList(props.equation.lhs));
    const rhs = createMemo(() => morToList(props.equation.rhs));

    // The domain of the left-hand side, used to require that the right-hand side
    // begins on the same object so the two sides remain parallel.
    const lhsDom = createMemo((): Ob | null => {
        const model = liveModel().elaboratedModel();
        const first = lhs().find((mor): mor is Mor => mor != null);
        if (!model || !first) {
            return null;
        }
        return morDom(model, first);
    });

    const setLhs = (mors: Array<Mor | null>) =>
        props.modifyEquation((eqn) => {
            eqn.lhs = removeProxyAndCopy(listToMor(mors));
        });

    const setRhs = (mors: Array<Mor | null>) =>
        props.modifyEquation((eqn) => {
            eqn.rhs = removeProxyAndCopy(listToMor(mors));
        });

    const setName = (name: string) =>
        props.modifyEquation((eqn) => {
            eqn.name = name;
        });

    return (
        <div class={`formal-judgment ${styles.decl}`}>
            <div class={styles.name}>
                <NameInput
                    placeholder="Unnamed"
                    name={props.equation.name}
                    setName={setName}
                    focus={focus.childFocus("name")}
                    deleteBackward={props.actions.deleteBackward}
                    deleteForward={props.actions.deleteForward}
                    exitBackward={props.actions.activateAbove}
                    exitForward={() => focus.setActiveChild("lhs")}
                    exitUp={props.actions.activateAbove}
                    exitDown={() => focus.setActiveChild("lhs")}
                    exitRight={() => focus.setActiveChild("lhs")}
                    createBelow={() => focus.setActiveChild("lhs")}
                />
            </div>
            <div class={styles.nameSeparator}>:</div>
            <div class={styles.equation}>
                <MorListEditor
                    mors={lhs()}
                    setMors={setLhs}
                    completions={completions()}
                    focus={focus.childFocus("lhs")}
                    exitBackward={() => focus.setActiveChild("name")}
                    exitForward={() => focus.setActiveChild("rhs")}
                    exitLeft={() => focus.setActiveChild("name")}
                    exitRight={() => focus.setActiveChild("rhs")}
                    deleteBackward={() => focus.setActiveChild("name")}
                    deleteForward={() => focus.setActiveChild("rhs")}
                />
                <div class={styles.equals}>{"="}</div>
                <MorListEditor
                    mors={rhs()}
                    setMors={setRhs}
                    completions={completions()}
                    baseDom={lhsDom()}
                    focus={focus.childFocus("rhs")}
                    exitBackward={() => focus.setActiveChild("lhs")}
                    exitForward={props.actions.activateBelow}
                    exitLeft={() => focus.setActiveChild("lhs")}
                    exitRight={props.actions.activateBelow}
                    deleteBackward={() => focus.setActiveChild("lhs")}
                    deleteForward={props.actions.activateBelow}
                />
            </div>
        </div>
    );
}

function MorListEditor(props: {
    mors: Array<Mor | null>;
    setMors: (mors: Array<Mor | null>) => void;
    completions: QualifiedName[] | undefined;
    /** Required domain for the first morphism in the path, if constrained. */
    baseDom?: Ob | null;
    focus: FocusHandle;
    exitBackward: () => void;
    exitForward: () => void;
    exitLeft: () => void;
    exitRight: () => void;
    deleteBackward: () => void;
    deleteForward: () => void;
}) {
    const liveModel = useContext(LiveModelContext);
    invariant(liveModel, "Live model should be provided as context");

    const [editMors, setEditMors] = createSignal<Array<Mor | null> | null>(null);

    const mors = () => editMors() ?? props.mors;

    const setMors = (mors: Array<Mor | null>) => {
        setEditMors(mors);
        props.setMors(mors);
    };

    createEffect(() => {
        if (!props.focus.hasFocus()) {
            setEditMors(null);
        }
    });

    // The object that a morphism at `index` must have as its domain in order to
    // extend the path: the codomain of the preceding morphism, or `baseDom` for
    // the first morphism. `null` means there is no constraint.
    const requiredDom = (index: number): Ob | null => {
        const model = liveModel().elaboratedModel();
        if (!model) {
            return null;
        }
        const items = mors();
        for (let i = index - 1; i >= 0; i--) {
            const prev = items[i];
            if (prev != null) {
                return morCod(model, prev);
            }
        }
        return props.baseDom ?? null;
    };

    // Morphism generators whose domain matches the required domain at `index`.
    const morCompletions = (index: number): Uuid[] | undefined => {
        const all = props.completions;
        if (!all) {
            return all;
        }
        const dom = requiredDom(index);
        if (dom === null) {
            return all;
        }
        const model = liveModel().elaboratedModel();
        return all.filter((id) => {
            const gen = model?.morPresentation(id);
            return gen != null && obsEqual(gen.dom, dom);
        });
    };

    // Object generators on which the identity morphism composes at `index`, i.e.
    // those equal to the required domain (since `id(X)` has domain and codomain X).
    const obCompletions = (index: number): Uuid[] | undefined => {
        const model = liveModel().elaboratedModel();
        const all = model?.obGenerators();
        if (!all) {
            return all;
        }
        const dom = requiredDom(index);
        if (dom === null) {
            return all;
        }
        return all.filter((id) => obsEqual(basicOb(id), dom));
    };

    return (
        <div class={styles.morList}>
            <InlineListEditor<Mor>
                items={mors()}
                setItems={setMors}
                insertKey=";"
                startDelimiter={""}
                endDelimiter={""}
                separator={() => <div class={styles.separator}>{";"}</div>}
                focus={props.focus}
                exitBackward={props.exitBackward}
                exitForward={props.exitForward}
                exitLeft={props.exitLeft}
                exitRight={props.exitRight}
                deleteBackward={props.deleteBackward}
                deleteForward={props.deleteForward}
            >
                {(mor, setMor, options, index) => (
                    <PathMorInput
                        mor={mor()}
                        setMor={setMor}
                        placeholder="..."
                        morCompletions={morCompletions(index)}
                        obCompletions={obCompletions(index)}
                        {...options}
                    />
                )}
            </InlineListEditor>
        </div>
    );
}

/** Build a basic object from its generator id. */
function basicOb(id: Uuid): Ob {
    return { tag: "Basic", content: id };
}

/** Domain of a morphism in the model, or `null` if it cannot be computed. */
function morDom(model: DblModel, mor: Mor): Ob | null {
    try {
        return model.dom(mor);
    } catch {
        return null;
    }
}

/** Codomain of a morphism in the model, or `null` if it cannot be computed. */
function morCod(model: DblModel, mor: Mor): Ob | null {
    try {
        return model.cod(mor);
    } catch {
        return null;
    }
}

/** Structural equality of objects, sufficient for comparing model objects. */
function obsEqual(a: Ob | null, b: Ob | null): boolean {
    if (a === null || b === null) {
        return a === b;
    }
    return JSON.stringify(a) === JSON.stringify(b);
}

/** Convert the stored morphism into the editable list shape. */
function morToList(mor: Mor | null): Array<Mor | null> {
    if (mor === null) {
        return [];
    }
    const seq = match(mor)
        .with({ tag: "Composite", content: { tag: "Seq", content: P.select() } }, (xs) => xs)
        .otherwise(() => null);
    return seq ?? [mor];
}

/** Convert the editable list into the stored equation side. */
function listToMor(mors: Array<Mor | null>): Mor | null {
    const present = mors.filter((mor): mor is Mor => mor !== null);
    if (present.length === 0) {
        return null;
    }
    if (present.length === 1) {
        return present[0] ?? null;
    }
    return {
        tag: "Composite",
        content: {
            tag: "Seq",
            content: present,
        },
    };
}
