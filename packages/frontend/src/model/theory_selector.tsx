import Dialog from "@corvu/dialog";
import { For, Show, createMemo, createSignal } from "solid-js";

import type { TheoryLibrary, TheoryMeta } from "../stdlib";

import "./theory_selector.css";

type TheorySelectorProps = {
    theory: TheoryMeta | undefined;
    setTheory: (theoryId: string | undefined) => void;
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
            <Dialog.Trigger class="theory-selector-button link-button" disabled={props.disabled}>
                <Show
                    when={props.theory}
                    fallback={<span class="placeholder">Choose a logic</span>}
                >
                    {props.theory?.name}
                </Show>
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
                        theories={props.theories}
                    />
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog>
    );
}

export const [selectedTheory, setSelectedTheory] = createSignal<string | undefined>(undefined);

export function TheorySelector(props: TheorySelectorProps) {
    const groupedTheories = createMemo(() => {
        const grouped = new Map<string, TheoryMeta[]>();
        for (const theory of props.theories.metadata()) {
            const groupName = theory.group ?? "Other";
            const group = grouped.get(groupName) || [];
            group.push(theory);
            grouped.set(groupName, group);
        }
        return Array.from(grouped.entries());
    });

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
                                        onchange={(evt) => {
                                            const id = evt.target.value;
                                            props.setTheory(id ? id : undefined);
                                            setSelectedTheory(id);
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
