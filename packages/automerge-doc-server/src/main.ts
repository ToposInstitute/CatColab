import { runMigration } from "./migrations/index.js";
import { AutomergeServer } from "./server.js";
import { SocketServer } from "./socket.js";

async function main() {
    const args = process.argv.slice(2);

    if (args[0] === "--migrate") {
        const migrationName = args[1];
        if (!migrationName) {
            console.error("Missing migration name after --migrate");
            process.exit(1);
        }

        await runMigration(migrationName);
        process.exit(0);
    }

    const internal_port = process.env.AUTOMERGE_INTERNAL_PORT || 3000;
    // const port = process.env.AUTOMERGE_PORT || 8010;
    const port = 8010;
    const plain_ws_port = process.env.PLAIN_WS_PORT ? Number(process.env.PLAIN_WS_PORT) : undefined;

    const server = new AutomergeServer(port, plain_ws_port);
    const socket_server = new SocketServer(internal_port, server);

    server.handleChange = (refId, content) => socket_server.autosave(refId, content);

    process.once("SIGINT", () => {
        socket_server.close();
        server.close();
    });

    process.once("SIGTERM", () => {
        socket_server.close();
        server.close();
    });
}

main();
