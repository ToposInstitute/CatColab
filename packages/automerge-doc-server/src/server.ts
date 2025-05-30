import type * as http from "node:http";
import { type DocHandle, type DocumentId, Repo, type RepoConfig } from "@automerge/automerge-repo";
import { NodeWSServerAdapter } from "@automerge/automerge-repo-network-websocket";
import dotenv from "dotenv";
import express from "express";
import * as ws from "ws";

// pg is a CommonJS package, and this is likely the least painful way of dealing with that
import pgPkg from "pg";
const { Pool } = pgPkg;
import type { Pool as PoolType } from "pg";

import { PostgresStorageAdapter } from "./postgres_storage_adapter.js";
import type { NewDocSocketResponse, StartListeningSocketResponse } from "./types.js";
import type { SocketIOHandlers } from "./socket.js";

// Load environment variables from .env
dotenv.config();

export class AutomergeServer implements SocketIOHandlers {
    private docMap: Map<string, DocHandle<unknown>>;

    private app: express.Express;
    private server: http.Server;
    private wss: ws.WebSocketServer;
    private repo: Repo;
    private pool: PoolType;

    public handleChange?: (refId: string, content: any) => void;

    constructor(port: number | string) {
        this.docMap = new Map();

        this.app = express();
        this.server = this.app.listen(port);

        this.wss = new ws.WebSocketServer({
            noServer: true,
        });

        this.pool = new Pool({
            connectionString: process.env.DATABASE_URL,
        });

        const storageAdapter = new PostgresStorageAdapter(this.pool);

        const config: RepoConfig = {
            network: [new NodeWSServerAdapter(this.wss)],
            sharePolicy: async () => false,
            storage: storageAdapter,
        };
        this.repo = new Repo(config);

        this.server.on("upgrade", (request, socket, head) => {
            this.wss.handleUpgrade(request, socket, head, (socket) => {
                this.wss.emit("connection", socket, request);
            });
        });

        this.server.on("listening", () => {
            console.log(`Automerge document server running on port ${port}`);
        });
    }

    async createDoc(content: unknown): Promise<NewDocSocketResponse> {
        const handle = this.repo.create(content);
        if (!handle) {
            return {
                Err: "Failed to create a new document",
            };
        }

        const docJson = await handle.doc();

        return {
            Ok: {
                docId: handle.documentId,
                docJson,
            },
        };
    }

    async cloneDoc(docId: string): Promise<NewDocSocketResponse> {
        const handle = this.repo.find(docId as DocumentId);
        if (!handle) {
            return { Err: `cloneDoc: Failed to find doc handle in repo for doc_id '${docId}'` };
        }

        const clonedHandle = this.repo.clone(handle);
        const clonedDocJson = await clonedHandle.doc();

        return {
            Ok: {
                docId: clonedHandle.documentId,
                docJson: clonedDocJson,
            },
        };
    }

    async startListening(refId: string, docId: string): Promise<StartListeningSocketResponse> {
        let handle = this.docMap.get(refId);
        if (handle) {
            return { Ok: null };
        }

        if (!(await this.isHeadMatching(refId, docId))) {
            return {
                Err: `The doc '${docId} for ref '${refId}' does not match the current doc head for that refId, so it is in a read only state'`,
            };
        }

        handle = this.repo.find(docId as DocumentId);
        if (!handle) {
            return { Err: `Failed to find doc handle in repo for doc_id '${docId}'` };
        }

        // NOTE: this listener is never removed
        handle.on("change", (payload) => {
            this.handleChange!(refId, payload.doc);
        });

        this.docMap.set(refId, handle);

        return { Ok: null };
    }

    async close() {
        this.wss.close();
        this.server.close();
    }

    private async isHeadMatching(refId: string, docId: string): Promise<boolean> {
        const result = await this.pool.query(
            `
            SELECT 1
            FROM refs
            WHERE id = $1
              AND head = (SELECT id FROM snapshots WHERE doc_id = $2)
            LIMIT 1;
            `,
            [refId, docId],
        );

        return (result.rowCount || 0) > 0;
    }
}
