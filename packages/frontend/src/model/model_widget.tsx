import { NotebookUtils } from "../notebook";
import { stdTheories } from "../stdlib";
import { type LiveModelDocument, migrateModelDocument } from "./document";
import { TheorySelectorDialog } from "./theory_selector";

/** Widget in the top right corner of a model document pane.
 */
export function ModelWidget(props: { liveModel: LiveModelDocument }) {
    const liveModel = () => props.liveModel;
    const liveModelDoc = () => props.liveModel.liveDoc;

    const selectableTheories = () => {
        if (NotebookUtils.hasFormalCells(liveModelDoc().doc.notebook)) {
            return liveModel().theory()?.migrationTargets ?? [];
        } else {
            // If the model has no formal cells, allow any theory to be selected.
            return undefined;
        }
    };

    return (
        <TheorySelectorDialog
            theoryMeta={stdTheories.getMetadata(liveModelDoc().doc.theory)}
            setTheory={(id) => migrateModelDocument(liveModelDoc(), id, stdTheories)}
            theories={selectableTheories()}
        />
    );
}
