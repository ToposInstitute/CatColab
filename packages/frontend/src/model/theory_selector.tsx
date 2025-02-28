import Dialog from "@corvu/dialog";
import { For, createMemo, createSignal } from "solid-js";

import type { TheoryLibrary, TheoryMeta } from "../stdlib";
import type { MapData } from "../theory";

import "./theory_selector.css";

type TheorySelectorProps = {
    theory: TheoryMeta;
    setTheory: (theoryId: string, mapdata: MapData ) => void;
    theories: TheoryLibrary;
    hasformal: boolean;
};

export function TheorySelectorDialog(props: { hasformal: boolean } & TheorySelectorProps) {
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
                        setTheory={(id, d) => {
                            props.setTheory(id, d);
                            setTheorySelectorOpen(false);
                        }}
                        theories={props.theories}
                        hasformal={props.hasformal}
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
                            each={theories.filter(
                                (t) =>
                                    !props.hasformal ||
                                    props.theories.get(t.id).inclusions.has(props.theory.id) ||
                                    props.theories.get(props.theory.id).inclusions.has(t.id),
                            )}
                        >
                            {(meta) => (
                                <div class="theory">
                                    <input
                                        type="radio"
                                        name="theory"
                                        id={meta.id}
                                        value={meta.id}
                                        onchange={(evt) => {
                                            const data = props.theories.get(props.theory.id).inclusions.get(meta.id);
                                            if (data) {
                                                return props.setTheory(evt.target.value, data);
                                            } 
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
