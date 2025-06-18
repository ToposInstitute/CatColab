import React from "react";
import { useDocument, useRepo } from "@automerge/automerge-repo-react-hooks";
import { type Doc } from "./datatype";
import { renderSolidComponent } from "./solid-wrapper.solid";
import { AutomergeUrl } from "@automerge/automerge-repo";
import { stdTheories } from "../../src/stdlib";

interface ToolProps {
    docUrl: AutomergeUrl;
}

export default function Tool({ docUrl }: ToolProps) {
    const [data] = useDocument<Doc>(docUrl, { suspense: true });
    console.log("Tool component rendering with data:", data);
    console.log("Tool component type:", typeof Tool);

    const containerRef = React.useRef<HTMLDivElement>(null);
    const disposeRef = React.useRef<(() => void) | null>(null);

    const repo = useRepo();

    // Create contexts at React level (static)
    const api = React.useMemo(() => ({ repo }), [repo]);
    const theories = React.useMemo(() => stdTheories, []);

    console.log("=== React Level Context Creation ===");
    console.log("API created:", api);
    console.log("Theories created:", theories);
    console.log(
        "Theories metadata count:",
        theories ? Array.from(theories.metadata()).length : 0
    );

    // Check if we have a valid docUrl and data before rendering SolidJS component
    const isValidForRendering = React.useMemo(() => {
        const hasValidUrl =
            docUrl &&
            docUrl !== "placeholder-doc-url" &&
            !docUrl.includes("placeholder");
        const hasValidData = data && data.name && data.theory;
        console.log("Validation check:", {
            hasValidUrl,
            hasValidData,
            docUrl,
            data,
        });
        return hasValidUrl && hasValidData;
    }, [docUrl, data]);

    React.useEffect(() => {
        console.log(
            "Tool useEffect running, containerRef.current:",
            containerRef.current
        );
        console.log("isValidForRendering:", isValidForRendering);

        if (containerRef.current && isValidForRendering) {
            // Clean up previous render
            if (disposeRef.current) {
                console.log("Cleaning up previous SolidJS render");
                disposeRef.current();
            }

            // Pass contexts as props to SolidJS instead of providing them internally
            const props = {
                docUrl: docUrl,
                name: data.name,
                theory: data.theory,
                notebook: data.notebook,
                repo: repo,
                api: api, // Pass context values as props
                theories: theories, // Pass context values as props
            };

            console.log(
                "Rendering SolidJS component with context props:",
                props
            );

            try {
                disposeRef.current = renderSolidComponent(
                    props,
                    containerRef.current
                );
                console.log("Successfully rendered SolidJS component");
            } catch (error) {
                console.error("Failed to render SolidJS component:", error);
                throw error;
            }
        } else if (containerRef.current && !isValidForRendering) {
            console.log("Skipping SolidJS render due to invalid data/URL");
            // Clean up any existing render
            if (disposeRef.current) {
                console.log("Cleaning up existing SolidJS render");
                disposeRef.current();
                disposeRef.current = null;
            }
        }

        return () => {
            if (disposeRef.current) {
                console.log("Cleaning up SolidJS component on unmount");
                disposeRef.current();
                disposeRef.current = null;
            }
        };
    }, [data, repo, docUrl, isValidForRendering, api, theories]);

    console.log("Tool component returning JSX");

    return (
        <div>
            {/* React component header */}
            <div
                style={{
                    background: "#f3f4f6",
                    padding: "12px 16px",
                    borderRadius: "8px 8px 0 0",
                    borderBottom: "1px solid #e5e7eb",
                    fontSize: "14px",
                    fontWeight: "bold",
                    color: "#374151",
                }}
            >
                ⚛️ React Host Component (Static Context Props)
            </div>

            {/* Validation status */}
            <div
                style={{
                    padding: "12px 16px",
                    backgroundColor: "#f9fafb",
                    fontSize: "12px",
                }}
            >
                <div>
                    <strong>DocURL:</strong> {docUrl}
                </div>
                <div>
                    <strong>Data Name:</strong> {data?.name || "undefined"}
                </div>
                <div>
                    <strong>Data Theory:</strong> {data?.theory || "undefined"}
                </div>
                <div>
                    <strong>Valid for Rendering:</strong>{" "}
                    {isValidForRendering ? "✅ Yes" : "❌ No"}
                </div>
                <div>
                    <strong>Context API:</strong>{" "}
                    {api ? "✅ Available" : "❌ Missing"}
                </div>
                <div>
                    <strong>Context Theories:</strong>{" "}
                    {theories ? "✅ Available" : "❌ Missing"}
                </div>
            </div>

            {/* SolidJS component integration */}
            <div ref={containerRef}>
                {!isValidForRendering && (
                    <div
                        style={{
                            padding: "20px",
                            textAlign: "center",
                            color: "#6b7280",
                            fontStyle: "italic",
                        }}
                    >
                        {docUrl === "placeholder-doc-url" ||
                        docUrl?.includes("placeholder")
                            ? "Waiting for valid document URL..."
                            : "Waiting for document data to load..."}
                    </div>
                )}
            </div>
        </div>
    );
}
