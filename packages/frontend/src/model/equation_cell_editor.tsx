import { createEffect, createMemo, createSignal, useContext } from "solid-js";
import invariant from "tiny-invariant";
import { P, match } from "ts-pattern";

import {
    type FocusHandle,
    InlineListEditor,
    NameInput,
    useChildFocus,
} from "catcolab-ui-components";
import type { Mor, QualifiedName } from "catlog-wasm";
import { MorIdInput } from "../components";
import { removeProxyAndCopy } from "../util/remove_proxy_and_copy";
import { LiveModelContext } from "./context";
import type { EquationEditorProps } from "./editors";

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
                {(mor, setMor, options) => (
                    <MorIdInput
                        mor={mor()}
                        setMor={setMor}
                        placeholder="..."
                        completions={props.completions}
                        idToLabel={(id) => liveModel().elaboratedModel()?.morGeneratorLabel(id)}
                        labelToId={(label) =>
                            liveModel().elaboratedModel()?.morGeneratorWithLabel(label)
                        }
                        obCompletions={liveModel().elaboratedModel()?.obGenerators()}
                        obIdToLabel={(id) => liveModel().elaboratedModel()?.obGeneratorLabel(id)}
                        obLabelToId={(label) =>
                            liveModel().elaboratedModel()?.obGeneratorWithLabel(label)
                        }
                        {...options}
                    />
                )}
            </InlineListEditor>
        </div>
    );
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
