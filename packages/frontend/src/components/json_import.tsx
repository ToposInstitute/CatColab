import { ErrorBoundary, createSignal } from "solid-js";
import type { JSX } from "solid-js";
import type { Document } from "../api";
import "./json_import.css";
import { ErrorBoundaryDialog } from "../util/errors";

interface JsonImportProps<T extends string> {
    onImport: (data: Document<T>) => void;
    validate?: (data: Document<T>) => boolean | string;
}

/**
 * Component for importing JSON data.
 * Handles file upload and direct clipboard paste.
 * File size is currently limited to 5MB.
 *
 */
export const JsonImport = <T extends string>({ onImport, validate }: JsonImportProps<T>) => {
    const [error, setError] = createSignal<string | null>(null);
    const [importValue, setImportValue] = createSignal("");

    const handleError = (e: unknown) => {
        setError(e instanceof Error ? e.message : "Unknown error occurred");
    };

    const validateAndImport = (jsonString: string) => {
        try {
            const data = JSON.parse(jsonString);

            // Run custom validation if provided
            if (validate) {
                const validationResult = validate(data);
                if (typeof validationResult === "string") {
                    setError(validationResult);
                    return;
                }
            }

            // Clear any previous errors and import
            setError(null);
            onImport(data);
            setImportValue(""); // Clear paste area after successful import
        } catch (e) {
            handleError(e);
        }
    };

    // Handle file upload
    const handleFileUpload: JSX.EventHandler<HTMLInputElement, Event> = async (event) => {
        const input = event.currentTarget;

        const file = input.files?.[0];
        if (!file) return;

        // Validate file type
        if (file.type !== "application/json" && !file.name.endsWith(".json")) {
            setError("Please upload a JSON file");
            return;
        }

        const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
        if (file.size > MAX_FILE_SIZE) {
            setError("File size exceeds 5MB limit");
            return;
        }

        const text = await file.text();
        validateAndImport(text);

        // Reset file input
        input.value = "";
    };

    // Handle paste
    const handleTextareaSubmit = () => {
        if (!importValue().trim()) {
            setError("Please enter some JSON");
            return;
        }
        validateAndImport(importValue());
    };

    const handleInput: JSX.EventHandler<HTMLTextAreaElement, Event> = (event) => {
        const textarea = event.currentTarget;
        setImportValue(textarea.value);
    };

    return (
        <div class="json_import">
            <ErrorBoundary fallback={(err) => <ErrorBoundaryDialog error={err} />}>
                {/* File upload */}
                <div class="flex">
                    <label>Import from file:</label>
                    <input
                        type="file"
                        accept=".json,application/json"
                        onChange={handleFileUpload}
                    />
                </div>

                {/* JSON paste */}
                <div class="flex">
                    <label>Or paste JSON:</label>
                    <textarea
                        value={importValue()}
                        onInput={handleInput}
                        onPaste={handleInput}
                        placeholder="Paste your JSON here..."
                    />
                    <button onClick={handleTextareaSubmit} aria-label="Import JSON">
                        Import Pasted JSON
                    </button>
                </div>

                {/* Error display */}
                {error() && <div class="error">{error()}</div>}
            </ErrorBoundary>
        </div>
    );
};
