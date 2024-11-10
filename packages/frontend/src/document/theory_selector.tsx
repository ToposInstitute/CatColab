import type { DocHandle } from "@automerge/automerge-repo";
import { For, createMemo } from "solid-js";

import type { TheoryLibrary, TheoryMeta } from "../stdlib";
import type { ModelDocument } from "./types";

import "./theory_selector.css";

interface TheorySelectorProps {
    docHandle: DocHandle<ModelDocument>;
    theories: TheoryLibrary;
    doc: ModelDocument;
}

const TheorySelector = (props: TheorySelectorProps) => {
    const groupedTheories = createMemo(() => {
        const theories = Array.from(props.theories.metadata()).filter(
            (meta) => meta.divisionCategory,
        );
        const grouped = new Map<string, TheoryMeta[]>();

        for (const theory of theories) {
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
                                <label>
                                    <input
                                        type="radio"
                                        name="theory"
                                        value={meta.id}
                                        onchange={(evt) => {
                                            const id = (evt.target as HTMLInputElement).value;
                                            props.docHandle.change((model) => {
                                                model.theory = id ? id : undefined;
                                            });
                                        }}
                                    />
                                    <div class="theory">
                                        {meta.name}
                                        <div class="description">{meta.description}</div>
                                    </div>
                                </label>
                            )}
                        </For>
                    </>
                )}
            </For>
        </div>
    );
};
export default TheorySelector;
