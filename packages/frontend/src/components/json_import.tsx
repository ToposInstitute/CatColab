import { createSignal } from "solid-js";
import type { Document } from "../api";
import "./json_import.css";

interface Props<T extends string> {
    onImport: (data: Document<T>) => void;
    validate?: (data: Document<T>) => boolean | string;
}

export const JsonImport = <T extends string>(props: Props<T>) => {
    const [error, setError] = createSignal<string | null>(null);
    const [pasteValue, setPasteValue] = createSignal("");

    const validateAndImport = (jsonString: string) => {
        try {
            // Parse JSON
            const data = JSON.parse(jsonString);

            // Run custom validation if provided
            if (props.validate) {
                const validationResult = props.validate(data);
                if (typeof validationResult === "string") {
                    setError(validationResult);
                    return;
                }
            }

            // Clear any previous errors and import
            setError(null);
            props.onImport(data);
            setPasteValue(""); // Clear paste area after successful import
        } catch (e) {
            setError(e instanceof Error ? e.message : "Invalid JSON format");
        }
    };

    // Handle file upload
    const handleFileUpload = async (event: Event) => {
        const input = event.target as HTMLInputElement;
        if (!input.files?.length) return;

        try {
            const file = input.files[0];

            // Validate file type
            if (!file?.type || !file?.name.endsWith(".json")) {
                throw new Error("Please upload a JSON file");
            }

            const text = await file?.text();
            validateAndImport(text);

            // Reset file input
            input.value = "";
        } catch (e) {
            setError(e instanceof Error ? e.message : "Error reading file");
        }
    };

    // Handle paste
    const handlePaste = () => {
        if (!pasteValue().trim()) {
            setError("Please enter some JSON");
            return;
        }
        validateAndImport(pasteValue());
    };

    const handleInput = (event: Event) => {
        const textarea = event.target as HTMLTextAreaElement;
        setPasteValue(textarea.value);
    };

    return (
        <div class="json_import">
            {/* File upload */}
            <div class="flex">
                <label>Import from file:</label>
                <input type="file" accept=".json,application/json" onChange={handleFileUpload} />
            </div>

            {/* JSON paste */}
            <div class="flex">
                <label>Or paste JSON:</label>
                <textarea
                    value={pasteValue()}
                    onInput={handleInput}
                    onPaste={handleInput}
                    placeholder="Paste your JSON here..."
                />
                <button onClick={handlePaste}>Import Pasted JSON</button>
            </div>

            {/* Error display */}
            {error() && <div class="error">{error()}</div>}
        </div>
    );
};
