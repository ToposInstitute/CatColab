import Dialog from "@corvu/dialog";
import { For, createMemo, createSignal } from "solid-js";

import type { TheoryLibrary, TheoryMeta } from "../stdlib";

import { TheoryHelpButton } from "../page/toolbar"

import "./theory_selector.css";

type TheorySelectorProps = {
    theory: TheoryMeta;
    setTheory: (theoryId: string) => void;
    theories: TheoryLibrary;
};

export function TheorySelectorDialog(
    props: {
        disabled?: boolean;
    } & TheorySelectorProps,
) {
    const [theorySelectorOpen, setTheorySelectorOpen] = createSignal(false);

    return (
        <Dialog open={theorySelectorOpen()} onOpenChange={setTheorySelectorOpen}>
            <Dialog.Trigger
                as="a"
                class="theory-selector-trigger"
                data-disabled={props.disabled ? true : undefined}
            >
                {props.theory.name}
            </Dialog.Trigger>
            <TheoryHelpButton theory={props.theories.get(props.theory.id)}/>
            <Dialog.Portal>
                <Dialog.Overlay class="overlay" />
                <Dialog.Content class="popup">
                    <TheorySelector
                        theory={props.theory}
                        setTheory={(id) => {
                            props.setTheory(id);
                            setTheorySelectorOpen(false);
                        }}
                        theories={props.theories}
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
                        <For each={theories}>
                            {(meta) => (
                                <div class="theory">
                                    <input
                                        type="radio"
                                        name="theory"
                                        id={meta.id}
                                        value={meta.id}
                                        onchange={(evt) => props.setTheory(evt.target.value)}
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
