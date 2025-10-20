import { NotebookUtils } from "../notebook";
import { stdTheories } from "../stdlib";
import { TheorySelectorDialog } from "../theory/theory_selector";
import { type LiveModelDocument, migrateModelDocument } from "./document";

/** Widget in the top right corner of a model document pane.
 */
export function ModelWidget(props: { liveModel: LiveModelDocument }) {
    const liveDoc = () => props.liveModel.liveDoc;

    const selectableTheories = () => {
        if (NotebookUtils.hasFormalCells(liveDoc().doc.notebook)) {
            return props.liveModel.theory()?.migrationTargets ?? [];
        } else {
            // If the model has no formal cells, allow any theory to be selected.
            return undefined;
        }
    };

    return (
        <TheorySelectorDialog
            theoryMeta={stdTheories.getMetadata(liveDoc().doc.theory)}
            setTheory={(id) => migrateModelDocument(props.liveModel, id, stdTheories)}
            theories={selectableTheories()}
        />
    );
}
