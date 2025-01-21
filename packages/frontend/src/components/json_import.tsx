import { type Component, createSignal, onCleanup } from "solid-js";
import type { AnalysisDocument } from "../analysis";
import type { DiagramDocument } from "../diagram";
import type { ModelDocument } from "../model";
import './json_import.css';

interface Props {
    onImport: (data: ModelDocument | DiagramDocument | AnalysisDocument) => void;
    validate?: (data: ModelDocument | DiagramDocument | AnalysisDocument) => boolean | string; // Return true if valid, error message if invalid
}

export const JsonImport: Component<Props> = (props) => {
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
            if (!file?.type && !file?.name.endsWith(".json")) {
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

    const autoResizeTextarea = (textarea: HTMLTextAreaElement) => {
        textarea.style.height = 'auto';
        textarea.style.height = `${textarea.scrollHeight}px`;
    };

    const handleInput = (event: Event) => {
        const textarea = event.target as HTMLTextAreaElement;
        setPasteValue(textarea.value);
        autoResizeTextarea(textarea);
    };
    
    return (
        <div class="json_import">
            {/* File upload */}
            <div class="flex flex-col gap-2">
                <label class="font-medium">Import from file:</label>
                <input
                    type="file"
                    accept=".json,application/json"
                    onChange={handleFileUpload}
                    class="border p-2 rounded"
                />
            </div>

            {/* JSON paste */}
            <div class="flex flex-col gap-2">
                <label class="font-medium">Or paste JSON:</label>
                <textarea
                    value={pasteValue()}
                    onInput={handleInput}
                    onPaste={handleInput}
                    class="border p-2 rounded h-32 font-mono"
                    placeholder="Paste your JSON here..."
                    ref={(el) => {
                        autoResizeTextarea(el);
                        onCleanup(() => el.removeEventListener('input', handleInput));
                    }}
                />
                <button
                    onClick={handlePaste}
                    class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                    disabled={!pasteValue().trim()}
                >
                    Import Pasted JSON
                </button>
            </div>

            {/* Error display */}
            {error() && <div class="text-red-500 mt-2">{error()}</div>}
        </div>
    );
};
