import { For } from "solid-js";

import { Nb } from "document-types-ts";
import { DocumentHead } from "../page/document_head";
import { stdTheories } from "../stdlib";
import { TheorySelectorDialog } from "../theory/theory_selector";
import { type LiveModelDoc, migrateModelDocument, switchEditorVariant } from "./document";

/** Document head for a model, including title, theory selector, and editor
variant settings.
 */
export function ModelDocumentHead(props: { liveModel: LiveModelDoc }) {
    const liveDoc = () => props.liveModel.liveDoc;

    const selectableTheories = () => {
        if (Nb.hasFormalCells(liveDoc().doc.notebook)) {
            return props.liveModel.theory()?.migrationTargets ?? [];
        } else {
            // If the model has no formal cells, allow any theory to be selected.
            return undefined;
        }
    };

    const editorVariants = () => props.liveModel.theory()?.editorVariants;

    const settingsPane = () => {
        const ev = editorVariants();
        if (!ev || ev.variants.length === 0) {
            return undefined;
        }
        const currentVariant = liveDoc().doc.editorVariant;
        return (
            <div class="settings-group">
                <div class="settings-title">Editor variants</div>
                <label class="settings-option">
                    <input
                        type="radio"
                        name="editor-variant"
                        value=""
                        checked={!ev.variants.some((v) => v.id === currentVariant)}
                        onChange={() => switchEditorVariant(props.liveModel, undefined)}
                    />
                    {ev.defaultLabel}
                </label>
                <For each={ev.variants}>
                    {(variant) => (
                        <label class="settings-option">
                            <input
                                type="radio"
                                name="editor-variant"
                                value={variant.id}
                                checked={currentVariant === variant.id}
                                onChange={() => switchEditorVariant(props.liveModel, variant.id)}
                            />
                            {variant.label}
                        </label>
                    )}
                </For>
            </div>
        );
    };

    return (
        <DocumentHead liveDoc={liveDoc()} settingsPane={settingsPane()} iconSize={24}>
            <TheorySelectorDialog
                theoryMeta={stdTheories.getMetadata(liveDoc().doc.theory)}
                setTheory={(id) => void migrateModelDocument(props.liveModel, id, stdTheories)}
                theories={selectableTheories()}
            />
        </DocumentHead>
    );
}
