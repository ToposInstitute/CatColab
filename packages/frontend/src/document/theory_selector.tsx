import { For, createMemo } from "solid-js";
import type { TheoryLibrary } from "../stdlib/types";
import type { ModelDocument } from "./types";
import "./model_document_editor.css";
import type { DocHandle } from "@automerge/automerge-repo";
import type { TheoryMeta } from "../stdlib/types";

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
            grouped.set(category, [...(grouped.get(category) || []), theory]);
        }

        return Array.from(grouped.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    });

    return (
        <div id="input-selections">
            <For each={groupedTheories()}>
                {([category, theories]) => (
                    <div class="selection-items">
                        <h4 id="division-category">{category}</h4>
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
                                    <div>
                                        <ul>
                                            <li id="selection-items">
                                                {meta.name}{" "}
                                                <div>
                                                    <span class="description">
                                                        {meta.description}
                                                    </span>
                                                </div>
                                            </li>
                                        </ul>
                                    </div>
                                </label>
                            )}
                        </For>
                    </div>
                )}
            </For>
        </div>
    );
};
export default TheorySelector;
