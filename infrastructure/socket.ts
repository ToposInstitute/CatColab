import { type Socket, io } from "socket.io-client";

import type { JsonValue, RefContent } from "../../backend/pkg/index.ts";

/** Messages handled by the `SocketServer`. */
export type Handlers = {
    create_doc: (data: RefContent, callback: (docId: string) => void) => void;
    get_doc: (refId: string, callback: (docId: string | null) => void) => void;
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
            createDoc: (data: RefContent) => string;
            getDoc: (refId: string) => string | null;
        },
    ) {
        const socket: Socket<Handlers, Requests> = io(`http://localhost:${port}`);

        socket.on("create_doc", (data, callback) => callback(handlers.createDoc(data)));
        socket.on("get_doc", (refId, callback) => callback(handlers.getDoc(refId)));

        this.socket = socket;
    }

    autosave(refId: string, content: JsonValue) {
        this.socket.emit("autosave", { refId, content });
    }

    close() {
        this.socket.close();
    }
}
