import { NotebookUtils } from "../notebook";
import { stdTheories } from "../stdlib";
import { TheorySelectorDialog } from "../theory/theory_selector";
import { type LiveModelDoc, migrateModelDocument, switchEditorVariant } from "./document";

/** Widget in the top right corner of a model document pane.
 */
export function ModelInfo(props: { liveModel: LiveModelDoc }) {
    const liveDoc = () => props.liveModel.liveDoc;

    const selectableTheories = () => {
        if (NotebookUtils.hasFormalCells(liveDoc().doc.notebook)) {
            const theory = props.liveModel.theory();
            if (!theory) {
                return [];
            }
            const baseId = liveDoc().doc.theory;
            const editorVariantIds = stdTheories.getEditorVariantIds(baseId);
            return [baseId, ...editorVariantIds, ...theory.migrationTargets];
        } else {
            // If the model has no formal cells, allow any theory to be selected.
            return undefined;
        }
    };

    const setTheoryOrEditor = (id: string) => {
        if (stdTheories.isEditorVariant(id)) {
            switchEditorVariant(props.liveModel, id);
        } else if (id === liveDoc().doc.theory) {
            // Selecting the base theory clears any active editor variant.
            switchEditorVariant(props.liveModel, undefined);
        } else {
            void migrateModelDocument(props.liveModel, id, stdTheories);
        }
    };

    return (
        <TheorySelectorDialog
            theoryMeta={stdTheories.getMetadata(
                liveDoc().doc.editorVariant ?? liveDoc().doc.theory,
            )}
            setTheory={setTheoryOrEditor}
            theories={selectableTheories()}
        />
    );
}
