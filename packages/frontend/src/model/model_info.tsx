import { NotebookUtils } from "../notebook";
import { stdTheories } from "../stdlib";
import { TheorySelectorDialog } from "../theory/theory_selector";
import { type LiveModelDoc, switchTheoryOrEditor } from "./document";

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

    return (
        <TheorySelectorDialog
            theoryMeta={stdTheories.getMetadata(
                liveDoc().doc.editorVariant ?? liveDoc().doc.theory,
            )}
            setTheory={(id) => switchTheoryOrEditor(props.liveModel, id, stdTheories)}
            theories={selectableTheories()}
        />
    );
}
