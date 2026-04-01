import { deepEqual } from "fast-equals";
import { Index, createMemo, createSignal, useContext } from "solid-js";
import { unwrap } from "solid-js/store";
import invariant from "tiny-invariant";

import { NameInput } from "catcolab-ui-components";
import type { Modality, Ob, ObOp, QualifiedName } from "catlog-wasm";
import { ObIdInput } from "../components";
import { LiveModelContext } from "./context";
import type { MorphismEditorProps } from "./editors";

import styles from "./string_diagram_morphism_cell_editor.module.css";

type ActiveInput =
    | { zone: "name" }
    | { zone: "dom"; index: number }
    | { zone: "cod"; index: number };

/** Unwrap `App(op, ob)` to get the inner `ob`. */
function unwrapApp(ob: Ob | null, applyOp: ObOp | undefined): Ob | null {
    if (!ob || !applyOp) {
        return ob;
    }
    if (ob.tag === "App" && deepEqual(ob.content.op, applyOp)) {
        return ob.content.ob;
    }
    return null;
}

/** Wrap an `ob` with `App(op, ob)`. */
function wrapApp(ob: Ob | null, applyOp: ObOp | undefined): Ob | null {
    if (!ob || !applyOp) {
        return ob;
    }
    return { tag: "App", content: { op: applyOp, ob } };
}

/** Extract the list of objects from a domain/codomain `Ob`. */
function getObList(ob: Ob | null, applyOp: ObOp | undefined): Array<Ob | null> {
    const inner = unwrapApp(ob, applyOp);
    if (inner?.tag === "List") {
        return inner.content.objects;
    }
    return [];
}

/** A column of wire inputs, used for both domain (left) and codomain (right). */
function WireColumn(props: {
    obs: Array<Ob | null>;
    side: "left" | "right";
    isInvalid: boolean;
    completions: QualifiedName[] | undefined;
    isActive: (index: number) => boolean;
    insertWire: (index: number) => void;
    updateOb: (index: number, ob: Ob | null) => void;
    deleteWire: (index: number) => void;
    activateWire: (index: number) => void;
    activateName: () => void;
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
            placeholder="..."
            completions={props.completions}
            idToLabel={(id) => liveModel().elaboratedModel()?.obGeneratorLabel(id)}
            labelToId={(label) => liveModel().elaboratedModel()?.obGeneratorWithLabel(label)}
            isInvalid={props.isInvalid}
            isActive={props.isActive(i)}
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

    const [active, setActive] = createSignal<ActiveInput>({ zone: "name" });

    const morTypeMeta = () => props.theory.modelMorTypeMeta(props.morphism.morType);
    const domApplyOp = () => morTypeMeta()?.domain?.apply;
    const codApplyOp = () => morTypeMeta()?.codomain?.apply;

    /** Rebuild a domain/codomain Ob from a list of objects. */
    const makeObList = (objects: Array<Ob | null>, applyOp: ObOp | undefined): Ob | null => {
        if (!applyOp) {
            return null;
        }
        const domObjType = props.theory.theory.dom(applyOp);
        const modality: Modality =
            domObjType?.tag === "ModeApp" ? domObjType.content.modality : "SymmetricList";
        return wrapApp({ tag: "List", content: { modality, objects } }, applyOp);
    };

    const domType = createMemo(() => {
        const op = domApplyOp();
        return op === undefined
            ? props.theory.theory.src(props.morphism.morType)
            : props.theory.theory.dom(op);
    });

    /** The inner element type (unwrapped from ModeApp) for completions. */
    const elementObType = createMemo(() => {
        const dt = domType();
        return dt?.tag === "ModeApp" ? dt.content.obType : dt;
    });

    const domObs = () => getObList(props.morphism.dom, domApplyOp());
    const codObs = () => getObList(props.morphism.cod, codApplyOp());

    const setDomObs = (objects: Array<Ob | null>) => {
        const ob = makeObList(objects, domApplyOp());
        props.modifyMorphism((mor) => {
            mor.dom = ob;
        });
    };

    const setCodObs = (objects: Array<Ob | null>) => {
        const ob = makeObList(objects, codApplyOp());
        props.modifyMorphism((mor) => {
            mor.cod = ob;
        });
    };

    const updateDomObs = (f: (objects: Array<Ob | null>) => void) => {
        const objects = structuredClone(unwrap(domObs()));
        f(objects);
        setDomObs(objects);
    };

    const updateCodObs = (f: (objects: Array<Ob | null>) => void) => {
        const objects = structuredClone(unwrap(codObs()));
        f(objects);
        setCodObs(objects);
    };

    const insertDom = (i: number) => {
        updateDomObs((objects) => objects.splice(i, 0, null));
        setActive({ zone: "dom", index: i });
    };

    const insertCod = (i: number) => {
        updateCodObs((objects) => objects.splice(i, 0, null));
        setActive({ zone: "cod", index: i });
    };

    const completions = () => liveModel().elaboratedModel()?.obGeneratorsWithType(elementObType());

    const errors = () => {
        const validated = liveModel().validatedModel();
        if (validated?.tag !== "Invalid") {
            return [];
        }
        return validated.errors.filter((err) => err.content === props.morphism.id);
    };

    return (
        <div class={`formal-judgment ${styles.morphism}`}>
            <WireColumn
                obs={domObs()}
                side="left"
                isInvalid={errors().some((err) => err.tag === "Dom" || err.tag === "DomType")}
                completions={completions()}
                isActive={(i) => {
                    const a = active();
                    return props.isActive && a.zone === "dom" && a.index === i;
                }}
                insertWire={insertDom}
                updateOb={(i, ob) =>
                    updateDomObs((objects) => {
                        objects[i] = ob;
                    })
                }
                deleteWire={(i) => updateDomObs((objects) => objects.splice(i, 1))}
                activateWire={(i) => setActive({ zone: "dom", index: i })}
                activateName={() => setActive({ zone: "name" })}
                exitFirstBackward={() => setActive({ zone: "name" })}
                exitLastForward={() => {
                    if (codObs().length > 0) {
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
                    name={props.morphism.name}
                    setName={(name) => {
                        props.modifyMorphism((mor) => {
                            mor.name = name;
                        });
                    }}
                    isActive={props.isActive && active().zone === "name"}
                    deleteBackward={props.actions.deleteBackward}
                    deleteForward={props.actions.deleteForward}
                    exitBackward={props.actions.activateAbove}
                    exitForward={() => {
                        if (domObs().length > 0) {
                            setActive({ zone: "dom", index: 0 });
                        } else {
                            insertDom(0);
                        }
                    }}
                    exitUp={props.actions.activateAbove}
                    exitDown={props.actions.activateBelow}
                    exitLeft={() => {
                        if (domObs().length > 0) {
                            setActive({ zone: "dom", index: domObs().length - 1 });
                        } else {
                            insertDom(0);
                        }
                    }}
                    exitRight={() => {
                        if (codObs().length > 0) {
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
                obs={codObs()}
                side="right"
                isInvalid={errors().some((err) => err.tag === "Cod" || err.tag === "CodType")}
                completions={completions()}
                isActive={(i) => {
                    const a = active();
                    return props.isActive && a.zone === "cod" && a.index === i;
                }}
                insertWire={insertCod}
                updateOb={(i, ob) =>
                    updateCodObs((objects) => {
                        objects[i] = ob;
                    })
                }
                deleteWire={(i) => updateCodObs((objects) => objects.splice(i, 1))}
                activateWire={(i) => setActive({ zone: "cod", index: i })}
                activateName={() => setActive({ zone: "name" })}
                exitFirstBackward={() => {
                    if (domObs().length > 0) {
                        setActive({ zone: "dom", index: domObs().length - 1 });
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
