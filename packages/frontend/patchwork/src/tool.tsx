import { useDocHandle } from "@automerge/automerge-repo-react-hooks";
import { EditorProps } from "@patchwork/sdk";
import { Button } from "@patchwork/sdk/ui";
import { Doc } from "./datatype";
import React, { useRef, useEffect } from "react";
import { renderSolidComponent } from "./solid-wrapper.solid";

console.log("This is tool.tsx in the solidjs-demo package");

export const Tool: React.FC<EditorProps<Doc, string>> = ({ docUrl }) => {
    const handle = useDocHandle<Doc>(docUrl, { suspense: true });
    const solidContainerRef = useRef<HTMLDivElement>(null);
    const solidDisposeRef = useRef<(() => void) | null>(null);

    const doc = handle.doc();

    // Mount/update SolidJS component
    useEffect(() => {
        if (solidContainerRef.current && doc) {
            // Clean up previous render
            if (solidDisposeRef.current) {
                solidDisposeRef.current();
            }

            // Render SolidJS component with model data
            const props = {
                docUrl,
                name: doc.name,
                theory: doc.theory,
                notebook: doc.notebook,
            };
            solidDisposeRef.current = renderSolidComponent(
                props,
                solidContainerRef.current
            );
        }

        // Cleanup on unmount
        return () => {
            if (solidDisposeRef.current) {
                solidDisposeRef.current();
                solidDisposeRef.current = null;
            }
        };
    }, [docUrl, doc?.name, doc?.theory, doc?.notebook]);

    if (!doc) {
        return null;
    }

    const updateModel = () => {
        handle.change((d) => {
            d.name = `Updated Model - ${new Date().toLocaleTimeString()}`;
        });
    };

    const addCell = () => {
        handle.change((d) => {
            if (!d.notebook.cells) {
                d.notebook.cells = [];
            }
            d.notebook.cells.push({
                id: `cell-${Date.now()}`,
                type: "text",
                content: "New cell",
            });
        });
    };

    return (
        <div className="solidjs-demo p-6">
            <div className="flex flex-col h-full">
                <div className="mb-6">
                    <h2 className="text-3xl font-bold mb-2 text-gray-800">
                        {doc.name}
                    </h2>
                    <p className="text-gray-600">
                        This shows a CatColab model document rendered through
                        SolidJS inside a React/Patchwork environment!
                    </p>
                </div>

                <div className="mb-6 flex gap-4">
                    <Button
                        variant="default"
                        onClick={updateModel}
                        className="bg-blue-600 hover:bg-blue-700"
                    >
                        Update Model Name
                    </Button>
                    <Button
                        variant="default"
                        onClick={addCell}
                        className="bg-green-600 hover:bg-green-700"
                    >
                        Add Cell
                    </Button>
                </div>

                <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
                    <p className="text-sm text-gray-600">
                        <strong>Debug info:</strong>
                        <br />
                        Doc URL: <code className="text-xs">{docUrl}</code>
                        <br />
                        Theory: <code className="text-xs">{doc.theory}</code>
                        <br />
                        Cells:{" "}
                        <code className="text-xs">
                            {doc.notebook?.cells?.length || 0}
                        </code>
                    </p>
                </div>

                <div className="flex-1">
                    <div ref={solidContainerRef} />
                </div>

                <div className="mt-6 p-4 bg-gray-100 rounded-lg">
                    <h4 className="font-semibold text-gray-700 mb-2">
                        🔧 How this works:
                    </h4>
                    <ul className="text-sm text-gray-600 space-y-1">
                        <li>
                            • React component manages the Automerge document
                        </li>
                        <li>
                            • SolidJS component renders the model information
                        </li>
                        <li>
                            • Changes in React trigger re-renders in SolidJS
                        </li>
                        <li>• Both frameworks can manage their own state</li>
                        <li>• Model data is passed as props to SolidJS</li>
                        <li>• Supports hot reloading!</li>
                    </ul>
                </div>
            </div>
        </div>
    );
};
