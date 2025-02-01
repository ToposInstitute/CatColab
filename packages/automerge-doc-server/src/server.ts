import type * as http from "node:http";
import { type DocHandle, Repo } from "@automerge/automerge-repo";
import { NodeWSServerAdapter } from "@automerge/automerge-repo-network-websocket";
import express from "express";
import * as ws from "ws";

import type { JsonValue } from "../../backend/pkg/src/index.ts";

export class AutomergeServer {
    private docMap: Map<string, DocHandle<unknown>>;
    private app: express.Express;
    private server: http.Server;
    private wss: ws.WebSocketServer;
    private repo: Repo;

    public handleChange?: (refId: string, content: JsonValue) => void;

    constructor(port: number | string) {
        this.docMap = new Map();

        this.app = express();
        this.server = this.app.listen(port);

        this.wss = new ws.WebSocketServer({
            noServer: true,
        });

        const config = {
            network: [new NodeWSServerAdapter(this.wss)],
            sharePolicy: async () => false,
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

    createDocHandle(refId: string, content: unknown): DocHandle<unknown> {
        let handle = this.docMap.get(refId);
        if (handle === undefined) {
            handle = this.repo.create(content);
            this.setDocHandleCallback(refId, handle);
            this.docMap.set(refId, handle);
        }
        return handle;
    }

    getDocHandle(refId: string): DocHandle<unknown> | undefined {
        return this.docMap.get(refId);
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
