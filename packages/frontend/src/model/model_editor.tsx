import type { DocHandle } from "@automerge/automerge-repo";
import Resizable from "@corvu/resizable";
import { For, createSignal } from "solid-js";

import type { TheoryId, TheoryMeta } from "../theory";
import { ModelNotebookEditor, type ModelNotebookRef } from "./model_notebook_editor";
import type { ModelNotebook } from "./types";

/** Editor for a model of a discrete double theory.

For now it just wraps a notebook-style editor but eventually it should not be
tied to the notebook format.
 */
export function ModelEditor(props: {
    handle: DocHandle<ModelNotebook>;
    init: ModelNotebook;
    theories: Map<TheoryId, TheoryMeta>;
}) {
    const [editorRef, setEditorRef] = createSignal<ModelNotebookRef>();

    return (
        <Resizable class="growable-container">
            <Resizable.Panel class="content-panel" collapsible initialSize={1} minSize={0.25}>
                <ModelNotebookEditor
                    ref={setEditorRef}
                    handle={props.handle}
                    init={props.init}
                    theories={props.theories}
                />
            </Resizable.Panel>
            <Resizable.Handle />
            <Resizable.Panel class="content-panel" collapsible initialSize={0} minSize={0.25}>
                <For each={editorRef()?.theory()?.modelViews}>
                    {(view) => {
                        const theory = editorRef()?.theory();
                        return (
                            theory && (
                                <view.component
                                    model={editorRef()?.model() ?? []}
                                    theory={theory}
                                />
                            )
                        );
                    }}
                </For>
            </Resizable.Panel>
        </Resizable>
    );
}
