import { DocHandle, Repo } from "@automerge/automerge-repo";
import { NodeWSServerAdapter } from "@automerge/automerge-repo-network-websocket";
import express from "express";
import type * as http from "http";
import * as ws from "ws";

export class AutomergeServer {
    private docMap: Map<string, DocHandle<unknown>>;
    private app: express.Express;
    private server: http.Server;
    private wss: ws.WebSocketServer;
    private repo: Repo;

    public handleChange?: (refId: string, data: unknown) => void;

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

    getDocHandle(refId: string): DocHandle<unknown> {
        let handle = this.docMap.get(refId);
        if (handle === undefined) {
            const content = null; // TODO: Need content.
            handle = this.repo.create(content);
            this.setHandleCallback(refId, handle);
            this.docMap.set(refId, handle);
        }
        return handle;
    }

    getDocId(refId: string) {
        return this.getDocHandle(refId).documentId;
    }

    setHandleCallback(refId: string, handle: DocHandle<unknown>) {
        handle.on("change", async (payload) => {
            this.handleChange?.(refId, payload.doc);
        });
    }

    async close() {
        this.wss.close();
        this.server.close();
    }
}
