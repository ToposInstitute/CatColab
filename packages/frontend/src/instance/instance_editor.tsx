import { MultiProvider } from "@solid-primitives/context";
import { useContext } from "solid-js";
import invariant from "tiny-invariant";

import type { InstanceJudgment } from "catcolab-document-types";
import { type FocusHandle } from "catcolab-ui-components";
import { LiveModelContext } from "../model";
import { type FormalCellEditorProps, NotebookEditor } from "../notebook";
import { LiveInstanceContext } from "./context";
import type { LiveInstanceDoc } from "./document";

/** Notebook editor for a instance in a model.
 */
export function InstanceNotebookEditor(props: {
    liveInstance: LiveInstanceDoc;
    focus: FocusHandle;
}) {
    const liveDoc = () => props.liveInstance.liveDoc;
    const liveModel = () => props.liveInstance.liveModel;

    return (
        <MultiProvider
            values={[
                [LiveModelContext, liveModel],
                [LiveInstanceContext, () => props.liveInstance],
            ]}
        >
            <NotebookEditor
                handle={liveDoc().docHandle}
                path={["notebook"]}
                notebook={liveDoc().doc.notebook}
                changeNotebook={(f) => {
                    liveDoc().changeDoc((doc) => f(doc.notebook));
                }}
                formalCellEditor={InstanceCellEditor}
                cellConstructors={undefined}
                cellLabel={undefined}
                focus={props.focus}
            />
        </MultiProvider>
    );
}

/** Editor for a notebook cell in a instance notebook.
 */
function InstanceCellEditor(_props: FormalCellEditorProps<InstanceJudgment>) {
    const liveInstance = useContext(LiveInstanceContext);
    invariant(liveInstance, "Live instance should be provided as context");

    return <></>;
}
