import { For } from "solid-js";
import type { TheoryLibrary } from "../stdlib/types";
import type { ModelDocument } from "./types";

interface TheorySelectorProps {
    docHandle: any; // Replace with the appropriate type
    theories: TheoryLibrary;
    doc: ModelDocument;
}

const TheorySelector = (props: TheorySelectorProps) => {
    return (
        <div id="input-selections" class="popup">
            <h4 id="divisionCategoryHeader">Data and Knowledge</h4>
            <div>
                <For
                    each={Array.from(props.theories.metadata()).filter(
                        (meta) => meta.divisionCategory === "Data and knowledge",
                    )}
                >
                    {(meta) => (
                        <label>
                            <input
                                type="radio"
                                name="theory"
                                value={meta.id}
                                onchange={(evt) => {
                                    const id = evt.target.value;
                                    props.docHandle().change((model: { theory: string | undefined; }) => {
                                        model.theory = id ? id : undefined;
                                    });
                                }}
                            />
                            <span id="selection-items">
                                {meta.name}{" "}
                                <div>
                                    <span class="description">
                                        {meta.description}
                                    </span>
                                </div>
                            </span>
                        </label>
                    )}
                </For>
            </div>
            <h4 id="divisionCategoryHeader"> System Dynamics</h4>
            <div>
                <For
                    each={Array.from(props.theories.metadata()).filter(
                        (meta) => meta.divisionCategory === "System Dynamics",
                    )}
                >
                    {(meta) => (
                        <label>
                            <input
                                type="radio"
                                name="theory"
                                value={meta.id}
                                onchange={(evt) => {
                                    const id = evt.target.value;
                                    props.docHandle().change((model: { theory: string | undefined; }) => {
                                        model.theory = id ? id : undefined;
                                    });
                                }}
                            />
                            <span id="selection-items">
                                {meta.name}{" "}
                                <div>
                                    <span class="description">
                                        {meta.description}
                                    </span>
                                </div>
                            </span>
                        </label>
                    )}
                </For>
            </div>
        </div>
    );
};

export default TheorySelector;

