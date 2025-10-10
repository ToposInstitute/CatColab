import { getAuth } from "firebase/auth";
import { useAuth, useFirebaseApp } from "solid-firebase";
import { Match, Switch, createSignal, useContext } from "solid-js";
import invariant from "tiny-invariant";

import type { ModelJudgment } from "catlog-wasm";
import {
    type CellConstructor,
    type FormalCellEditorProps,
    NotebookEditor,
    cellShortcutModifier,
    newFormalCell,
} from "../notebook";
import { WelcomeOverlay } from "../page/welcome_overlay";
import type { ModelTypeMeta } from "../theory";
import { LiveModelContext } from "./context";
import type { LiveModelDocument } from "./document";
import { MorphismCellEditor } from "./morphism_cell_editor";
import { ObjectCellEditor } from "./object_cell_editor";
import {
    type MorphismDecl,
    type ObjectDecl,
    duplicateModelJudgment,
    newMorphismDecl,
    newObjectDecl,
} from "./types";

/** Notebook editor for a model of a double theory.
 */
export function ModelNotebookEditor(props: {
    liveModel: LiveModelDocument;
}) {
    const liveDoc = () => props.liveModel.liveDoc;

    const cellConstructors = () =>
        (props.liveModel.theory()?.modelTypes ?? []).map(modelCellConstructor);

    const firebaseApp = (() => {
        try {
            return useFirebaseApp();
        } catch {}
    })();
    const auth = firebaseApp && useAuth(getAuth(firebaseApp));

    const [isOverlayOpen, setOverlayOpen] = createSignal(
        liveDoc().doc.notebook.cellOrder.length === 0 && auth != null && auth.data == null,
    );
    const toggleOverlay = () => setOverlayOpen(!isOverlayOpen());

    return (
        <LiveModelContext.Provider value={() => props.liveModel}>
            <WelcomeOverlay isOpen={isOverlayOpen()} onClose={toggleOverlay} />
            <NotebookEditor
                handle={liveDoc().docHandle}
                path={["notebook"]}
                notebook={liveDoc().doc.notebook}
                changeNotebook={(f) => {
                    liveDoc().changeDoc((doc) => f(doc.notebook));
                }}
                formalCellEditor={ModelCellEditor}
                cellConstructors={cellConstructors()}
                cellLabel={judgmentLabel}
                duplicateCell={duplicateModelJudgment}
            />
        </LiveModelContext.Provider>
    );
}

/** Editor for a notebook cell in a model notebook. */
export function ModelCellEditor(props: FormalCellEditorProps<ModelJudgment>) {
    const liveModel = useContext(LiveModelContext);
    invariant(liveModel, "Live model should be provided as context");

    return (
        <Switch>
            <Match when={props.content.tag === "object" && liveModel().theory()}>
                {(theory) => (
                    <ObjectCellEditor
                        object={props.content as ObjectDecl}
                        modifyObject={(f) =>
                            props.changeContent((content) => f(content as ObjectDecl))
                        }
                        isActive={props.isActive}
                        actions={props.actions}
                        theory={theory()}
                    />
                )}
            </Match>
            <Match when={props.content.tag === "morphism" && liveModel().theory()}>
                {(theory) => (
                    <MorphismCellEditor
                        morphism={props.content as MorphismDecl}
                        modifyMorphism={(f) =>
                            props.changeContent((content) => f(content as MorphismDecl))
                        }
                        isActive={props.isActive}
                        actions={props.actions}
                        theory={theory()}
                    />
                )}
            </Match>
        </Switch>
    );
}

function modelCellConstructor(meta: ModelTypeMeta): CellConstructor<ModelJudgment> {
    const { name, description, shortcut } = meta;
    return {
        name,
        description,
        shortcut: shortcut && [cellShortcutModifier, ...shortcut],
        construct() {
            return meta.tag === "ObType"
                ? newFormalCell(newObjectDecl(meta.obType))
                : newFormalCell(newMorphismDecl(meta.morType));
        },
    };
}

function judgmentLabel(judgment: ModelJudgment): string | undefined {
    const liveModel = useContext(LiveModelContext);
    invariant(liveModel);
    const theory = liveModel().theory();

    if (judgment.tag === "object") {
        return theory?.modelObTypeMeta(judgment.obType)?.name;
    }
    if (judgment.tag === "morphism") {
        return theory?.modelMorTypeMeta(judgment.morType)?.name;
    }
}
