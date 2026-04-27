import { Index, createEffect, createMemo, createSignal, untrack, useContext } from "solid-js";
import invariant from "tiny-invariant";

import { NameInput } from "catcolab-ui-components";
import type { Ob, QualifiedName } from "catlog-wasm";
import { ObIdInput } from "../components";
import { LiveModelContext } from "./context";
import { MultiaryMorphismEditHandle } from "./edit_handle";
import type { MorphismEditorProps } from "./editors";

import styles from "./string_diagram_morphism_cell_editor.module.css";

type ActiveInput =
    | { zone: "name" }
    | { zone: "dom"; index: number }
    | { zone: "cod"; index: number };

/** Drop null entries with no in-progress text from a wire list. */
function pruneEmptyWires(
    list: readonly (Ob | null)[],
    texts: Map<number, string>,
    remove: (i: number) => void,
) {
    for (let i = list.length - 1; i >= 0; i--) {
        if (list[i] === null && (texts.get(i) ?? "") === "") {
            remove(i);
        }
    }
}

/** A column of wire inputs, used for both domain (left) and codomain (right). */
function WireColumn(props: {
    obs: readonly (Ob | null)[];
    side: "left" | "right";
    isInvalid: boolean;
    completions: QualifiedName[] | undefined;
    isActive: (index: number) => boolean;
    insertWire: (index: number) => void;
    updateOb: (index: number, ob: Ob | null) => void;
    deleteWire: (index: number) => void;
    activateWire: (index: number) => void;
    activateName: () => void;
    /** Called when the displayed text of a wire input changes. */
    onTextChange?: (index: number, text: string) => void;
    /** Called when tabbing backward from the first wire. */
    exitFirstBackward: (() => void) | undefined;
    /** Called when tabbing forward from the last wire. */
    exitLastForward: (() => void) | undefined;
    hasFocused: (() => void) | undefined;
}) {
    const liveModel = useContext(LiveModelContext);
    invariant(liveModel, "Live model should be provided as context");

    const wireInput = (ob: () => Ob | null, i: number) => (
        <ObIdInput
            ob={ob()}
            setOb={(newOb) => props.updateOb(i, newOb)}
            onTextChange={(text) => props.onTextChange?.(i, text)}
            placeholder="..."
            completions={props.completions}
            idToLabel={(id) => liveModel().elaboratedModel()?.obGeneratorLabel(id)}
            labelToId={(label) => liveModel().elaboratedModel()?.obGeneratorWithLabel(label)}
            isInvalid={props.isInvalid}
            isActive={props.isActive(i)}
            createBelow={() => props.insertWire(i + 1)}
            deleteBackward={() => {
                props.deleteWire(i);
                if (props.obs.length === 0) {
                    props.activateName();
                } else if (i > 0) {
                    props.activateWire(i - 1);
                }
            }}
            deleteForward={() => {
                props.deleteWire(i);
                if (props.obs.length === 0) {
                    props.activateName();
                }
            }}
            exitBackward={() => {
                if (i > 0) {
                    props.activateWire(i - 1);
                } else {
                    props.exitFirstBackward?.();
                }
            }}
            exitForward={() => {
                if (i < props.obs.length - 1) {
                    props.activateWire(i + 1);
                } else {
                    props.exitLastForward?.();
                }
            }}
            exitLeft={props.side === "right" ? props.activateName : undefined}
            exitRight={props.side === "left" ? props.activateName : undefined}
            interceptKeyDown={(evt) => {
                if (evt.key === ",") {
                    props.insertWire(i + 1);
                    return true;
                }
                return false;
            }}
            hasFocused={() => {
                props.activateWire(i);
                props.hasFocused?.();
            }}
        />
    );

    return (
        <div class={`${styles.wires} ${props.side === "left" ? styles.left : styles.right}`}>
            <Index each={props.obs}>
                {(ob, i) => (
                    <div class={styles.wire}>
                        {props.side === "left" && wireInput(ob, i)}
                        <div class={styles.wireLine} />
                        {props.side === "right" && wireInput(ob, i)}
                    </div>
                )}
            </Index>
            <div
                class={`${styles.wire} ${styles.addWire}`}
                onMouseDown={(evt) => {
                    props.insertWire(props.obs.length);
                    props.hasFocused?.();
                    evt.preventDefault();
                }}
            >
                {props.side === "left" && <span class={styles.addWireButton}>+</span>}
                <div class={styles.wireLine} />
                {props.side === "right" && <span class={styles.addWireButton}>+</span>}
            </div>
        </div>
    );
}

/** Editor for a morphism declaration cell in string diagram style.

Renders the transition as a box with input wires on the left and output wires
on the right, where each wire is a separate input field for a domain/codomain
element.
 */
export default function StringDiagramMorphismCellEditor(props: MorphismEditorProps) {
    const liveModel = useContext(LiveModelContext);
    invariant(liveModel, "Live model should be provided as context");

    /* oxlint-disable solid/reactivity -- handle methods read props lazily */
    const mor = new MultiaryMorphismEditHandle({
        theory: () => props.theory,
        morphism: () => props.morphism,
        modify: (f) => props.modifyMorphism(f),
        validated: () => liveModel().validatedModel(),
    });
    /* oxlint-enable solid/reactivity */

    const [active, setActive] = createSignal<ActiveInput | null>({ zone: "name" });

    // Track currently-typed text for each wire so we can distinguish "empty
    // placeholder" from "in-progress input" when pruning on deactivation.
    const domTexts = new Map<number, string>();
    const codTexts = new Map<number, string>();

    const morTypeMeta = () => props.theory.modelMorTypeMeta(props.morphism.morType);

    /** The inner element type (unwrapped from ModeApp) for completions. */
    const elementObType = createMemo(() => {
        const dt = mor.domType;
        return dt?.tag === "ModeApp" ? dt.content.obType : dt;
    });

    const completions = () => liveModel().elaboratedModel()?.obGeneratorsWithType(elementObType());

    const insertDom = (i: number) => {
        mor.insertDom(i, null);
        setActive({ zone: "dom", index: i });
    };

    const insertCod = (i: number) => {
        mor.insertCod(i, null);
        setActive({ zone: "cod", index: i });
    };

    // Clean up null placeholders when the cell becomes inactive.
    createEffect(() => {
        if (!props.isActive) {
            untrack(() => {
                setActive(null);
                pruneEmptyWires(mor.domList, domTexts, (i) => mor.removeDom(i));
                pruneEmptyWires(mor.codList, codTexts, (i) => mor.removeCod(i));
            });
        }
    });

    return (
        <div class={`formal-judgment ${styles.morphism}`}>
            <WireColumn
                obs={mor.domList}
                side="left"
                isInvalid={mor.hasDomError}
                completions={completions()}
                isActive={(i) => {
                    const a = active();
                    return props.isActive && a?.zone === "dom" && a.index === i;
                }}
                onTextChange={(i, text) => domTexts.set(i, text)}
                insertWire={insertDom}
                updateOb={(i, ob) => mor.setDomAt(i, ob)}
                deleteWire={(i) => mor.removeDom(i)}
                activateWire={(i) => setActive({ zone: "dom", index: i })}
                activateName={() => setActive({ zone: "name" })}
                exitFirstBackward={() => setActive({ zone: "name" })}
                exitLastForward={() => {
                    if (mor.codList.length > 0) {
                        setActive({ zone: "cod", index: 0 });
                    } else {
                        insertCod(0);
                    }
                }}
                hasFocused={props.actions.hasFocused}
            />
            <div class={styles.box}>
                <NameInput
                    placeholder={morTypeMeta()?.preferUnnamed ? undefined : "Unnamed"}
                    name={mor.name}
                    setName={mor.setName}
                    isActive={props.isActive && active()?.zone === "name"}
                    deleteBackward={props.actions.deleteBackward}
                    deleteForward={props.actions.deleteForward}
                    exitBackward={props.actions.activateAbove}
                    exitForward={() => {
                        if (mor.domList.length > 0) {
                            setActive({ zone: "dom", index: 0 });
                        } else {
                            insertDom(0);
                        }
                    }}
                    exitUp={props.actions.activateAbove}
                    exitDown={props.actions.activateBelow}
                    exitLeft={() => {
                        const xs = mor.domList;
                        if (xs.length > 0) {
                            setActive({ zone: "dom", index: xs.length - 1 });
                        } else {
                            insertDom(0);
                        }
                    }}
                    exitRight={() => {
                        if (mor.codList.length > 0) {
                            setActive({ zone: "cod", index: 0 });
                        } else {
                            insertCod(0);
                        }
                    }}
                    hasFocused={() => {
                        setActive({ zone: "name" });
                        props.actions.hasFocused?.();
                    }}
                />
            </div>
            <WireColumn
                obs={mor.codList}
                side="right"
                isInvalid={mor.hasCodError}
                completions={completions()}
                isActive={(i) => {
                    const a = active();
                    return props.isActive && a?.zone === "cod" && a.index === i;
                }}
                onTextChange={(i, text) => codTexts.set(i, text)}
                insertWire={insertCod}
                updateOb={(i, ob) => mor.setCodAt(i, ob)}
                deleteWire={(i) => mor.removeCod(i)}
                activateWire={(i) => setActive({ zone: "cod", index: i })}
                activateName={() => setActive({ zone: "name" })}
                exitFirstBackward={() => {
                    const xs = mor.domList;
                    if (xs.length > 0) {
                        setActive({ zone: "dom", index: xs.length - 1 });
                    } else {
                        setActive({ zone: "name" });
                    }
                }}
                exitLastForward={props.actions.activateBelow}
                hasFocused={props.actions.hasFocused}
            />
        </div>
    );
}
