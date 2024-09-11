import type { DocHandle } from "@automerge/automerge-repo";
import Resizable, { type ContextValue } from "@corvu/resizable";
import { Show, createEffect, createSignal } from "solid-js";

import type { RPCClient } from "../api";
import { IconButton, ResizableHandle } from "../components";
import type { TheoryLibrary } from "../stdlib";
import { ModelAnalyzer } from "./model_analyzer";
import { ModelNotebookEditor, type ModelNotebookRef } from "./model_notebook_editor";
import type { ModelNotebook } from "./types";

import Camera from "lucide-solid/icons/camera";
import PanelRight from "lucide-solid/icons/panel-right";
import PanelRightClose from "lucide-solid/icons/panel-right-close";

/** Editor for a model of a double theory.

The editor includes a notebook for the model itself plus another pane for
performing analysis of the model.
 */
export function ModelEditor(props: {
    handle: DocHandle<ModelNotebook>;
    init: ModelNotebook;
    client: RPCClient;
    refId: string;
    theories: TheoryLibrary;
}) {
    const snapshotModel = () =>
        props.client.saveRef.mutate({
            refId: props.refId,
            note: "",
        });

    const [editorRef, setEditorRef] = createSignal<ModelNotebookRef>();

    const [resizableContext, setResizableContext] = createSignal<ContextValue>();
    const [isSidePanelOpen, setSidePanelOpen] = createSignal(false);

    createEffect(() => {
        const context = resizableContext();
        if (isSidePanelOpen()) {
            context?.expand(1);
        } else {
            context?.collapse(1);
        }
    });

    const toggleSidePanel = () => {
        const open = setSidePanelOpen(!isSidePanelOpen());
        if (open) {
            resizableContext()?.resize(1, 0.33);
        }
    };

    return (
        <Resizable class="growable-container">
            {() => {
                const context = Resizable.useContext();
                setResizableContext(context);

                return (
                    <>
                        <Resizable.Panel
                            class="content-panel"
                            collapsible
                            initialSize={1}
                            minSize={0.25}
                        >
                            <div class="toolbar">
                                <IconButton onClick={snapshotModel}>
                                    <Camera />
                                </IconButton>
                                <span class="filler" />
                                <IconButton
                                    onClick={toggleSidePanel}
                                    tooltip={
                                        isSidePanelOpen()
                                            ? "Hide the analysis panel"
                                            : "Show the analysis panel"
                                    }
                                >
                                    <Show when={isSidePanelOpen()} fallback={<PanelRight />}>
                                        <PanelRightClose />
                                    </Show>
                                </IconButton>
                            </div>
                            <ModelNotebookEditor
                                ref={setEditorRef}
                                handle={props.handle}
                                init={props.init}
                                theories={props.theories}
                            />
                        </Resizable.Panel>
                        <ResizableHandle hidden={!isSidePanelOpen()} />
                        <Resizable.Panel
                            class="content-panel side-panel"
                            collapsible
                            initialSize={0}
                            minSize={0.25}
                            hidden={!isSidePanelOpen()}
                            onCollapse={() => setSidePanelOpen(false)}
                            onExpand={() => setSidePanelOpen(true)}
                        >
                            <div class="notebook-container">
                                <h2>Analysis</h2>
                                <Show when={editorRef()}>
                                    {(ref) => (
                                        <ModelAnalyzer
                                            handle={props.handle}
                                            path={["analysis"]}
                                            modelNotebookRef={ref()}
                                        />
                                    )}
                                </Show>
                            </div>
                        </Resizable.Panel>
                    </>
                );
            }}
        </Resizable>
    );
}
