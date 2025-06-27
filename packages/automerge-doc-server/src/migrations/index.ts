import { automergeStorage } from "./m20250516154702_automerge_storage.js";

export async function runMigration(name: string) {
    switch (name) {
        case "automerge_storage": {
            await automergeStorage();
            break;
        }
        default:
            console.error(`Unknown migration: ${name}`);
            process.exit(1);
    }
}
