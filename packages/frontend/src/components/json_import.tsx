import { createSignal, type JSX } from "solid-js";

import { Button, FormGroup, InputField, TextAreaField } from "catcolab-ui-components";
import type { Document } from "catlog-wasm";

import "./json_import.css";

interface JsonImportProps {
    onImport: (doc: Document) => void;
    parse: (jsonString: string) => Document | Error;
}

/**
 * Component for importing JSON data.
 * Handles file upload and direct clipboard paste.
 * File size is currently limited to 5MB.
 *
 */
export const JsonImport = (props: JsonImportProps) => {
    const [error, setError] = createSignal<string | null>(null);
    const [importValue, setImportValue] = createSignal("");

    const parseAndImport = async (jsonString: string) => {
        const result = props.parse(jsonString);
        if (result instanceof Error) {
            setError(result.message);
            return;
        }
        // Clear any previous errors and import
        setError(null);
        props.onImport(result);
        setImportValue(""); // Clear paste area after successful import
    };

    // Handle file upload
    const handleFileUpload: JSX.EventHandler<HTMLInputElement, Event> = async (event) => {
        const input = event.currentTarget;

        const file = input.files?.[0];
        if (!file) {
            return;
        }

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
        void parseAndImport(text);

        // Reset file input
        input.value = "";
    };

    // Handle paste
    const handleTextareaSubmit = () => {
        if (!importValue().trim()) {
            setError("Please enter some JSON");
            return;
        }
        void parseAndImport(importValue());
    };

    const handleInput: JSX.EventHandler<HTMLTextAreaElement, Event> = (event) => {
        const textarea = event.currentTarget;
        setImportValue(textarea.value);
    };

    return (
        <form class="json_import">
            <FormGroup>
                {/* File upload */}
                <InputField
                    type="file"
                    label="Import from file"
                    accept=".json,application/json"
                    onChange={handleFileUpload}
                />

                {/* JSON paste */}
                <TextAreaField
                    label="Or paste JSON"
                    value={importValue()}
                    onInput={handleInput}
                    onPaste={handleInput}
                    placeholder="Paste your JSON here..."
                />
                <Button type="button" variant="positive" onClick={handleTextareaSubmit}>
                    Import pasted JSON
                </Button>
            </FormGroup>

            {/* Error display */}
            {error() && <div class="error">{error()}</div>}
        </form>
    );
};
