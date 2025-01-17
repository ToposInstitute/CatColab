// JsonExport.tsx
import { createSignal } from "solid-js";

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
    const [copyStatus, setCopyStatus] = createSignal<"idle" | "copied" | "error">("idle");
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
