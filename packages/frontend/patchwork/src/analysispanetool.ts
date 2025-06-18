import { useDocHandle, useRepo } from "@automerge/automerge-repo-react-hooks";
import { EditorProps } from "@patchwork/sdk";
import { Doc } from "./datatype";
import React, { useRef, useEffect } from "react";
import { createComponent, render } from "solid-js/web";
import { AnalysisPaneComponent } from "./analysispane.solid";

export const Tool: React.FC<EditorProps<Doc, string>> = ({ docUrl }) => {
    const handle = useDocHandle<Doc>(docUrl, { suspense: true });
    const repo = useRepo();

    const solidContainerRef = useRef<HTMLDivElement>(null);
    const solidDisposeRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        if (!handle || !repo) {
            return;
        }

        if (solidContainerRef.current) {
            // Clean up previous render
            if (solidDisposeRef.current) {
                solidDisposeRef.current();
            }

            solidDisposeRef.current = render(
                () => createComponent(AnalysisPaneComponent, { docUrl, repo }),
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
    }, [docUrl, handle]);

    if (!handle) {
        return null;
    }

    // We use React.createElement here to avoid bringing in React's JSX transform.
    // We had some trouble with combining both solid and react JSX in one build.
    return React.createElement("div", { ref: solidContainerRef });
};
