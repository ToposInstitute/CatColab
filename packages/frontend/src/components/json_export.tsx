// JsonExport.tsx
import {createSignal } from 'solid-js';

interface ExportProps {
  data: string;
  filename?: string;
}

// Download as file
export const downloadJson = (props: ExportProps) => {
    try {
        const jsonString = props.data;
        const blob = new Blob([jsonString], { type: "application/json" });
        const url = URL.createObjectURL(blob);

        const link = document.createElement("a");
        link.href = url;
        link.download = props.filename || "export.json";
        document.body.appendChild(link);
        link.click();

        // Cleanup
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error("Error downloading JSON:", error);
    }
};

export const copyToClipboard = async (props: ExportProps) => {
    const [copyStatus, setCopyStatus] = createSignal<
    "idle" | "copied" | "error"
    >("idle");
    try {
        const jsonString = props.data;
        await navigator.clipboard.writeText(jsonString);
        setCopyStatus("copied");
        setTimeout(() => setCopyStatus("idle"), 2000);
    } catch (error) {
        console.error("Error copying to clipboard:", error);
        setCopyStatus("error");
        setTimeout(() => setCopyStatus("idle"), 2000);
    }
    return copyStatus;
};

interface ImportProps {
    onImport: (data: any) => void;
    validate?: (data: any) => boolean | string; // Return true if valid, error message if invalid
    jsonString: string
  }

export const validateAndImport = (props: ImportProps) => {
    const [error, setError] = createSignal<string | null>(null);

    try {
        // Parse JSON
        const data = JSON.parse(props.jsonString);

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
    } catch (e) {
        setError(e instanceof Error ? e.message : "Invalid JSON format");
    }
    return error();
};

  // Handle file upload
export const handleFileUpload = async (event: Event) => {
      const [error, setError] = createSignal<string | null>(null);
      const input = event.target as HTMLInputElement;
      if (!input.files?.length) return;
      try {
          const file = input.files[0]!;

          // Validate file type
          if (!file.type && !file.name.endsWith(".json")) {
              throw new Error("Please upload a JSON file");
          }

          const text = await file.text();
          validateAndImport({
              onImport: () => console.log("hi"),
              validate: (_) => "hi",
              jsonString: text,
          });

          // Reset file input
          input.value = "";
      } catch (e) {
          setError(e instanceof Error ? e.message : "Error reading file");
      }
      return error;
  };

  // Handle paste
export const handlePaste = () => {
    const setError = createSignal<string | null>(null)[1];
    const pasteValue = createSignal('')[0];
    if (!pasteValue().trim()) {
      setError('Please enter some JSON');
      return;
    }
    // XX: Need to get the error out still
    validateAndImport({
        onImport: () => console.log("hi"),
        validate: (_) => "hi",
        jsonString: pasteValue(),
    });
};