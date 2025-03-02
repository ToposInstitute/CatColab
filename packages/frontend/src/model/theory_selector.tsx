import Dialog from "@corvu/dialog";
import { For, createMemo, createSignal } from "solid-js";

import type { TheoryLibrary, TheoryMeta } from "../stdlib";
import type { MapData } from "../theory";

import "./theory_selector.css";

type TheorySelectorProps = {
    theory: TheoryMeta;
    sigma: (theoryId: string, mapdata: MapData) => void;
    setTheory: (theoryId: string) => void;
    theories: TheoryLibrary;
    formalCells: string[];
};

export function TheorySelectorDialog(props: { formalCells: string[] } & TheorySelectorProps) {
    const [theorySelectorOpen, setTheorySelectorOpen] = createSignal(false);
    return (
        <Dialog open={theorySelectorOpen()} onOpenChange={setTheorySelectorOpen}>
            <Dialog.Trigger as="a" class="theory-selector-trigger" data-disabled={undefined}>
                {props.theory.name}
            </Dialog.Trigger>
            <Dialog.Portal>
                <Dialog.Overlay class="overlay" />
                <Dialog.Content class="popup">
                    <TheorySelector
                        theory={props.theory}
                        setTheory={(id) => {
                            props.setTheory(id);
                            setTheorySelectorOpen(false);
                        }}
                        sigma={(id, d) => {
                            props.sigma(id, d);
                            setTheorySelectorOpen(false);
                        }}
                        theories={props.theories}
                        formalCells={props.formalCells}
                    />
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog>
    );
}

export function TheorySelector(props: TheorySelectorProps) {
    const groupedTheories = createMemo(() =>
        Array.from(props.theories.groupedMetadata().entries()),
    );
    return (
        <div class="theory-selector">
            <For each={groupedTheories()}>
                {([group, theories]) => (
                    <div class="group">
                        <div class="group-name">{group}</div>
                        <For
                            each={theories.filter((t) => {
                                if (props.formalCells.length === 0) {
                                    return true;
                                }
                                const fwd = props.theories
                                    .get(props.theory.id)
                                    .inclusions.get(t.id);
                                if (!(fwd === undefined)) {
                                    return true;
                                }

                                const bkwd = props.theories
                                    .get(t.id)
                                    .inclusions.get(props.theory.id);

                                if (!(bkwd === undefined)) {
                                    return props.formalCells.every((fc) => {
                                        return (
                                            Array.from(bkwd.obnames.values()).includes(fc) ||
                                            Array.from(bkwd.mornames.values()).includes(fc)
                                        );
                                    });
                                }
                                return false;
                            })}
                        >
                            {(meta) => (
                                <div class="theory">
                                    <input
                                        type="radio"
                                        name="theory"
                                        id={meta.id}
                                        value={meta.id}
                                        onchange={(evt) => {
                                            if (props.formalCells.length > 0) {
                                                const data = props.theories
                                                    .get(props.theory.id)
                                                    .inclusions.get(meta.id);
                                                if (data) {
                                                    return props.sigma(evt.target.value, data);
                                                } else {
                                                    const data = props.theories
                                                        .get(meta.id)
                                                        .inclusions.get(props.theory.id);
                                                    if (data === undefined) {
                                                        throw Error("Bad ");
                                                    } else {
                                                        return props.sigma(
                                                            evt.target.value,
                                                            data.swap(),
                                                        );
                                                    }
                                                }
                                            }
                                            return props.setTheory(meta.id); // trivial
                                        }}
                                    />
                                    <label for={meta.id}>
                                        <div class="name">{meta.name}</div>
                                        <div class="description">{meta.description}</div>
                                    </label>
                                </div>
                            )}
                        </For>
                    </div>
                )}
            </For>
        </div>
    );
}
