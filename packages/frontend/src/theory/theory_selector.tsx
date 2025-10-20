import Dialog from "@corvu/dialog";
import { useLocation } from "@solidjs/router";
import { For, createMemo, createSignal, useContext } from "solid-js";
import invariant from "tiny-invariant";

import { TheoryHelpButton } from "../page/toolbar";
import { TheoryLibraryContext, type TheoryMeta } from "../theory";

import "./theory_selector.css";

type TheorySelectorProps = {
    theoryMeta: TheoryMeta;
    setTheory: (theoryId: string) => void;
    theories?: string[];
};

export function TheorySelectorDialog(props: TheorySelectorProps) {
    const [theorySelectorOpen, setTheorySelectorOpen] = createSignal(false);

    // Only show help button when router is available.
    let HelpButton = () => <TheoryHelpButton meta={props.theoryMeta} />;
    try {
        useLocation();
    } catch {
        HelpButton = () => <></>;
    }

    return (
        <Dialog open={theorySelectorOpen()} onOpenChange={setTheorySelectorOpen}>
            <div class="theory-selector-trigger-wrapper">
                <Dialog.Trigger
                    as="a"
                    class="theory-selector-trigger"
                    data-disabled={props.theories?.length === 0 ? true : undefined}
                >
                    {props.theoryMeta.name}
                </Dialog.Trigger>
                <HelpButton />
            </div>
            <Dialog.Portal>
                <Dialog.Overlay class="overlay" />
                <Dialog.Content class="popup">
                    <TheorySelector
                        theoryMeta={props.theoryMeta}
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
