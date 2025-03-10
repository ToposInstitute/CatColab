import { type Socket, io } from "socket.io-client";

import type { JsonValue, RefContent } from "../../backend/pkg/src/index.ts";
import type { CreateDocSocketResponse, GetDocSocketResponse } from "./types.js";

/** Messages handled by the `SocketServer`. */
export type Handlers = {
    create_doc: (data: RefContent, callback: (response: CreateDocSocketResponse) => void) => void;
    get_doc: (refId: string, callback: (response: GetDocSocketResponse) => void) => void;
};

/** Messages emitted by the `SocketServer`. */
export type Requests = {
    autosave: (data: RefContent) => void;
};

/** Encapsulates socket.io for internal communication with the backend.

Intermediates between the backend server written in Rust and the Automerge
server running in this Node process.
 */
export class SocketServer {
    private socket: Socket<Handlers, Requests>;

    constructor(
        port: number | string,
        handlers: {
            createDoc: (data: RefContent) => Promise<CreateDocSocketResponse>;
            getDoc: (refId: string) => Promise<GetDocSocketResponse>;
        },
    ) {
        const socket: Socket<Handlers, Requests> = io(`http://localhost:${port}`);

        socket.on("create_doc", (data, callback) => handlers.createDoc(data).then(response => callback(response)));
        socket.on("get_doc", (refId, callback) => handlers.getDoc(refId).then(response => callback(response)));

        this.socket = socket;
    }

    autosave(refId: string, content: JsonValue) {
        this.socket.emit("autosave", { refId, content });
    }

    close() {
        this.socket.close();
    }
}
