import { Repo } from "@automerge/automerge-repo";
import { WebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";

const BACKEND_URL = "http://localhost:8080";
const WS_URL = "ws://localhost:8080/repo-ws";

async function main() {
    console.log("🚀 Starting Automerge client...");

    // Fetch the document ID from the backend
    console.log(`📡 Fetching document ID from ${BACKEND_URL}/doc-id...`);
    const response = await fetch(`${BACKEND_URL}/doc-id`);
    const { doc_id } = await response.json();
    console.log(`📄 Document ID: ${doc_id}`);

    // Create automerge repo with WebSocket adapter
    console.log(`🔌 Connecting to WebSocket at ${WS_URL}...`);
    const repo = new Repo({
        network: [new WebSocketClientAdapter(WS_URL)],
    });

    // Find the document (now returns a Promise)
    console.log(`🔍 Finding document ${doc_id}...`);
    const handle = await repo.find(doc_id as any);
    console.log("✅ Document ready!");

    // Log initial document state
    const doc = handle.doc();
    console.log("📖 Initial document state:", JSON.stringify(doc, null, 2));

    // Listen for changes
    handle.on("change", ({ doc, patches }) => {
        console.log("🔄 Document changed!");
        console.log("   New state:", JSON.stringify(doc, null, 2));
        console.log("   Patches:", patches);
    });

    // Make a test change after 2 seconds
    setTimeout(() => {
        console.log("✏️  Making a test change...");
        handle.change((doc: any) => {
            doc.count = (doc.count || 0) + 1;
            doc.clientMessage = "Hello from TypeScript client!";
            doc.timestamp = new Date().toISOString();
        });
        console.log("✅ Change submitted");
    }, 2000);

    // Make another change after 4 seconds
    setTimeout(() => {
        console.log("✏️  Making another test change...");
        handle.change((doc: any) => {
            doc.count = (doc.count || 0) + 1;
            doc.lastUpdate = new Date().toISOString();
        });
        console.log("✅ Second change submitted");
    }, 4000);

    // Keep the process running
    console.log("👀 Watching for changes... (Press Ctrl+C to exit)");
}

main().catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
});
