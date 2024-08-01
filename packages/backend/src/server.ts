import { Persistence, RefId } from "./persistence.js";
import * as A from "@automerge/automerge-repo";
import { NodeWSServerAdapter } from "@automerge/automerge-repo-network-websocket";
import express from "express";
import * as http from "http";
import * as ws from "ws";
import { z } from "zod";

import * as trpc from "@trpc/server";
import * as trpcStandalone from "@trpc/server/adapters/standalone";

const t = trpc.initTRPC.create();

export const router = t.router;
export const publicProcedure = t.procedure;


export class Server {
    db: Persistence
    docMap: Map<RefId, A.DocHandle<any>>
    app: express.Express
    server: http.Server
    wss: ws.WebSocketServer
    repo: A.Repo
    appRouter

    constructor() {
        const url = process.env.DATABASE_URL

        if (!url) {
            throw("Must set environment DATABASE_URL to a postgresql connection string");
        }

        this.db = new Persistence(url);

        this.docMap = new Map();

        this.app = express()

        const PORT = 8000

        this.appRouter = router({
            newRef: publicProcedure
                .input(z.object({ title: z.string(), docId: z.string() }))
                .mutation(async (opts) => {
                    console.log("client asked for new ref")
                    const { input: { title, docId } } = opts;
                    const refId = await this.db.newRef(title);
                    const handle = this.repo.find(docId as A.DocumentId);
                    this.setHandleCallback(refId, handle);
                    this.docMap.set(refId, handle);
                    return refId;
                }),
            docIdFor: publicProcedure
                .input(z.string())
                .query(async (opts) => {
                    const { input: refId } = opts;
                    const handle = await this.getDocHandle(refId as RefId);
                    return handle?.documentId;
                })
        });

        this.server = trpcStandalone.createHTTPServer({
            router: this.appRouter
        });

        this.wss = new ws.WebSocketServer({
            noServer: true
        });

        const config = {
            network: [new NodeWSServerAdapter(this.wss)],
            sharePolicy: async () => false
        };

        this.repo = new A.Repo(config);

        this.server.on("upgrade", (request, socket, head) => {
            this.wss.handleUpgrade(request, socket, head, (socket) => {
                this.wss.emit("connection", socket, request)
            })
        });

        this.server.listen(PORT);
    }

    setHandleCallback(refId: RefId, handle: A.DocHandle<any>) {
        handle.on("change", async (payload) => {
            console.log("autosave")
            const doc = payload.doc;
            this.db.autosave(refId, JSON.stringify(doc));
        });
    }

    async getDocHandle(refId: RefId): Promise<A.DocHandle<any> | undefined> {
        if (this.docMap.has(refId)) {
            return this.docMap.get(refId)
        } else {
            const content = JSON.parse(await this.db.getAutosave(refId));
            const handle = this.repo.create(content);
            this.setHandleCallback(refId, handle);
            this.docMap.set(refId, handle);
            return handle;
        }
    }

    async close() {
        this.wss.close()
        this.server.close()
        await this.db.close()
    }
}
