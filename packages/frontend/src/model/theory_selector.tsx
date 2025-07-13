import Dialog from "@corvu/dialog";
import { For, createMemo, createSignal, useContext } from "solid-js";
import invariant from "tiny-invariant";

import { TheoryLibraryContext, type TheoryMeta } from "../stdlib";

import { TheoryHelpButton } from "../page/toolbar";

import "./theory_selector.css";

type TheorySelectorProps = {
    theory: TheoryMeta;
    setTheory: (theoryId: string) => void;
    theories?: string[];
};

export function TheorySelectorDialog(props: TheorySelectorProps) {
    const [theorySelectorOpen, setTheorySelectorOpen] = createSignal(false);

    return (
        <Dialog open={theorySelectorOpen()} onOpenChange={setTheorySelectorOpen}>
            <Dialog.Trigger
                as="a"
                class="theory-selector-trigger"
                data-disabled={props.theories?.length === 0 ? true : undefined}
            >
                {props.theory.name}
            </Dialog.Trigger>
            <TheoryHelpButton theory={props.theories?.get(props.theory.id)} />
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
    const theories = useContext(TheoryLibraryContext);
    invariant(theories, "Library of theories should be provided as context");

    const groupedTheories = createMemo(() =>
        Array.from(theories.groupedMetadata(props.theories).entries()),
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
