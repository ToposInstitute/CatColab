import type * as http from "node:http";
import {
    type DocHandle,
    type DocumentId,
    Repo,
    type RepoConfig,
} from "@automerge/automerge-repo";
import { NodeWSServerAdapter } from "@automerge/automerge-repo-network-websocket";
import express from "express";
import * as ws from "ws";
import dotenv from "dotenv";

// pg is a CommonJS package, and this is likely the least painful way of dealing with that
import pgPkg from "pg";
const { Pool } = pgPkg;
import type { Pool as PoolType, QueryResult } from "pg";

import type { JsonValue } from "../../backend/pkg/src/index.ts";
import { PostgresStorageAdapter } from "./postgres_storage_adapter.js";
import type { CreateDocSocketResponse, GetDocSocketResponse, } from "./types.js";

// Load environment variables from .env
dotenv.config();

export class AutomergeServer {
    private docMap: Map<string, DocHandle<unknown>>;
    private app: express.Express;
    private server: http.Server;
    private wss: ws.WebSocketServer;
    private repo: Repo;
    private pool: PoolType;

    public handleChange?: (refId: string, content: JsonValue) => void;

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

    async createDocHandle(
        refId: string,
        content: unknown
    ): Promise<CreateDocSocketResponse> {
        const cachedHandle = this.docMap.get(refId);
        if (cachedHandle) {
            return { Ok: cachedHandle.documentId };
        }

        const newHandle = await this.getOrCreateHandle(refId, content);
        if ("Err" in newHandle) {
            return newHandle;
        }
        this.setDocHandleCallback(refId, newHandle);
        this.docMap.set(refId, newHandle);

        return { Ok: newHandle.documentId };
    }

    async getOrCreateHandle(
        refId: string,
        content: unknown
    ): Promise<DocHandle<unknown> | { Err: string }> {
        const existingDocId = await this.getDocIdForRef(refId);
        if (existingDocId && typeof existingDocId !== "string") {
            return existingDocId;
        }

        if (existingDocId) {
            const handle = this.repo.find(existingDocId as DocumentId);
            if (handle) {
                // should we be doing something if content is provided but we have found an existing doc?
                // this is where we could possibly have a race condition with head_snapshot
                return handle;
            }

            return {
                Err: `Failed to find document handle in automerge repo for refId '${refId}'`,
            };
        }

        const handle = this.repo.create(content);
        if (!handle) {
            return {
                Err: `Failed to create a new document for refId '${refId}`,
            };
        }

        const result = await this.setDocIdForRef(refId, handle.documentId);
        if (result) {
            return result;
        }

        return handle;
    }

    async setDocIdForRef(
        refId: string,
        docId: DocumentId
    ): Promise<{ Err: string } | undefined> {
        try {
            await this.pool.query("UPDATE refs SET doc_id = $2 WHERE id = $1", [
                refId,
                docId,
            ]);
        } catch (e) {
            console.error(e);
            const message = e instanceof Error ? `: ${e.message}` : "";
            return {
                Err: `Failed to set docId '${docId} for refId '${refId} in the refs table${message}`,
            };
        }
    }

    async getDocIdForRef(
        refId: string
    ): Promise<string | undefined | { Err: string }> {
        // biome-ignore lint/suspicious/noExplicitAny: we don't have typescript types for the db
        let result: QueryResult<any>;
        try {
            result = await this.pool.query(
                "SELECT doc_id FROM refs WHERE id = $1",
                [refId]
            );
        } catch (e) {
            console.error(e);
            const message = e instanceof Error ? `: ${e.message}` : "";
            return {
                Err: `Failed to get docId for refId '${refId} in the refs table${message}`,
            };
        }

        if (result.rows.length === 0) {
            return;
        }

        return result.rows[0].doc_id;
    }

    async getDocHandle(refId: string): Promise<GetDocSocketResponse> {
        const cachedHandle = this.docMap.get(refId);
        if (cachedHandle) {
            return { Ok: cachedHandle.documentId };
        }

        const docId = await this.getDocIdForRef(refId);
        if (!docId) {
            return { Ok: null };
        }

        if (typeof docId === "string") {
            return { Ok: docId };
        }

        return docId;
    }

    setDocHandleCallback(refId: string, handle: DocHandle<unknown>) {
        handle.on("change", async (payload) => {
            this.handleChange?.(refId, payload.doc);
        });
    }

    async close() {
        this.wss.close();
        this.server.close();
    }
}
