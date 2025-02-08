// JsonExport.tsx

export function downloadJson(data: string, filename = "export.json") {
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    try {
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.click();
    } finally {
        URL.revokeObjectURL(url);
    }
}

export async function copyToClipboard(data: string): Promise<void> {
    await navigator.clipboard.writeText(data);
}
