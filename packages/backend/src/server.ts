import { Persistence, RefId } from "./persistence.js";
import * as A from "@automerge/automerge-repo";
import { NodeWSServerAdapter } from "@automerge/automerge-repo-network-websocket";
import express from "express"
import * as http from "http";
import * as ws from "ws";

export class Server {
    db: Persistence
    docMap: Map<RefId, A.DocHandle<any>>
    app: express.Express
    server: http.Server
    wss: ws.WebSocketServer
    repo: A.Repo

    constructor() {
        const url = process.env.DATABASE_URL

        if (!url) {
            throw("Must set environment DATABASE_URL to a postgresql connection string");
        }

        this.db = new Persistence(url);

        this.docMap = new Map();

        this.app = express()

        const PORT = 8080

        this.server = this.app.listen(PORT, () => {
            console.log(`listening on port ${PORT}`)
        })

        this.wss = new ws.WebSocketServer({
            noServer: true
        })

        const config = {
            network: [new NodeWSServerAdapter(this.wss)],
            sharePolicy: async () => false
        };

        this.repo = new A.Repo(config)

        this.server.on("upgrade", (request, socket, head) => {
            this.wss.handleUpgrade(request, socket, head, (socket) => {
                this.wss.emit("connection", socket, request)
            })
        })
    }

    async getDocHandle(ref: RefId): Promise<A.DocHandle<any> | undefined> {
        if (this.docMap.has(ref)) {
            return this.docMap.get(ref)
        } else {
            const content = JSON.parse(await this.db.getAutosave(ref));
            const handle = this.repo.create(content);
            handle.on("change", async (payload) => {
                const doc = payload.doc;
                this.db.autosave(ref, JSON.stringify(doc));
            });
            this.docMap.set(ref, handle);
            return handle;
        }
    }

    async close() {
        this.wss.close()
        this.server.close()
        await this.db.close()
    }
}
