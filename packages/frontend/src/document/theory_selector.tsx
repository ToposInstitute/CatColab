import { For, createMemo } from "solid-js";

import type { TheoryLibrary, TheoryMeta } from "../stdlib";
import type { TheoryId } from "../theory";

import "./theory_selector.css";

type TheorySelectorProps = {
    theory: TheoryId | undefined;
    setTheory: (theory: TheoryId | undefined) => void;
    theories: TheoryLibrary;
};

export const TheorySelector = (props: TheorySelectorProps) => {
    const groupedTheories = createMemo(() => {
        const grouped = new Map<string, TheoryMeta[]>();

        for (const theory of props.theories.metadata()) {
            const category = theory.divisionCategory ?? "Other";
            const group = grouped.get(category) || [];
            group.push(theory);
            grouped.set(category, group);
        }

        return Array.from(grouped.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    });

    return (
        <div class="theory-selector">
            <For each={groupedTheories()}>
                {([category, theories]) => (
                    <>
                        <h4 class="division">{category}</h4>
                        <For each={theories}>
                            {(meta) => (
                                <div class="theory">
                                    <input
                                        type="radio"
                                        name="theory"
                                        id={meta.id}
                                        value={meta.id}
                                        onchange={(evt) => {
                                            const id = evt.target.value as TheoryId;
                                            props.setTheory(id ? id : undefined);
                                        }}
                                    />
                                    <label for={meta.id}>
                                        <div class="name">{meta.name}</div>
                                        <div class="description">{meta.description}</div>
                                    </label>
                                </div>
                            )}
                        </For>
                    </>
                )}
            </For>
        </div>
    );
};
