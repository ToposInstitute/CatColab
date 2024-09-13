import type * as http from "node:http";
import * as A from "@automerge/automerge-repo";
import { NodeWSServerAdapter } from "@automerge/automerge-repo-network-websocket";
import * as Sentry from "@sentry/node";
import express from "express";
import morgan from "morgan";
import * as ws from "ws";
import { z } from "zod";
import { Persistence } from "./persistence.js";

import * as trpc from "@trpc/server";
import * as trpcExpress from "@trpc/server/adapters/express";
import { getDatabaseUrl } from "./database_url.js";

const t = trpc.initTRPC.create();

export const router = t.router;
export const publicProcedure = t.procedure;

export class Server {
    db: Persistence;

    docMap: Map<string, A.DocHandle<any>>;
    app: express.Express;
    server: http.Server;
    wss: ws.WebSocketServer;
    repo: A.Repo;
    appRouter;

    constructor(port = process.env.PORT || 8000) {
        const url = getDatabaseUrl();

        this.db = new Persistence(url);

        this.docMap = new Map();

        this.app = express();

        this.app.get("/debug-sentry", function mainHandler(_req, _res) {
            throw new Error("My first Sentry error!");
        });

        Sentry.setupExpressErrorHandler(this.app);

        this.appRouter = router({
            newRef: publicProcedure
                .input(z.object({ title: z.string(), docId: z.string() }))
                .mutation(async (opts) => {
                    const {
                        input: { title, docId },
                    } = opts;
                    const refId = await this.db.newRef(title);
                    const handle = this.repo.find(docId as A.DocumentId);
                    this.setHandleCallback(refId, handle);
                    this.docMap.set(refId, handle);
                    return refId;
                }),

            docIdFor: publicProcedure.input(z.string()).query(async (opts) => {
                const { input: refId } = opts;
                const handle = await this.getDocHandle(refId);
                return handle?.documentId;
            }),

            saveRef: publicProcedure
                .input(z.object({ refId: z.string(), note: z.string() }))
                .mutation(async (opts) => {
                    const {
                        input: { refId, note },
                    } = opts;
                    await this.db.saveRef(refId, note);
                }),

            getRefs: publicProcedure.query(async () => {
                return await this.db.allRefs();
            }),
        });

        this.app.use(morgan("tiny"));

        this.app.use(
            "/",
            trpcExpress.createExpressMiddleware({
                router: this.appRouter,
            }),
        );

        this.server = this.app.listen(port);

        this.wss = new ws.WebSocketServer({
            noServer: true,
        });

        const config = {
            network: [new NodeWSServerAdapter(this.wss)],
            sharePolicy: async () => false,
        };

        this.repo = new A.Repo(config);

        this.server.on("upgrade", (request, socket, head) => {
            this.wss.handleUpgrade(request, socket, head, (socket) => {
                this.wss.emit("connection", socket, request);
            });
        });

        this.server.on("listening", () => {
            console.log(`server running on port ${port}`);
        });
    }

    setHandleCallback(refId: string, handle: A.DocHandle<any>) {
        handle.on("change", async (payload) => {
            const doc = payload.doc;
            this.db.autosave(refId, JSON.stringify(doc));
        });
    }

    async getDocHandle(refId: string): Promise<A.DocHandle<any> | undefined> {
        if (this.docMap.has(refId)) {
            return this.docMap.get(refId);
        } else {
            const content = JSON.parse(await this.db.getAutosave(refId));
            const handle = this.repo.create(content);
            this.setHandleCallback(refId, handle);
            this.docMap.set(refId, handle);
            return handle;
        }
    }

    async close() {
        this.wss.close();
        this.server.close();
        await this.db.close();
    }
}
