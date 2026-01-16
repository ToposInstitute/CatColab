import { createSignal } from "solid-js";

// Global debug data store
const [debugData, setDebugData] = createSignal<Record<string, unknown>>({});
const [debugStatus, setDebugStatus] = createSignal("");

export function updateDebugData(data: Record<string, unknown>) {
    setDebugData((prev) => ({ ...prev, ...data, timestamp: new Date().toISOString() }));
}

export function getDebugData() {
    return debugData();
}

export async function copyDebugData() {
    const text = JSON.stringify(debugData(), null, 2);
    try {
        await navigator.clipboard.writeText(text);
        setDebugStatus("Copied!");
        setTimeout(() => setDebugStatus(""), 2000);
    } catch (e) {
        setDebugStatus("Failed to copy");
        console.error("Debug copy failed:", e);
    }
}

export function getDebugStatus() {
    return debugStatus();
}
