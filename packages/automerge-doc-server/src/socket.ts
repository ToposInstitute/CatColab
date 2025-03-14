import { type Socket, io } from "socket.io-client";

import type { JsonValue, RefContent } from "../../backend/pkg/src/index.ts";
import type { CreateDocSocketResponse, StartListeningSocketResponse } from "./types.js";

/** Messages handled by the `SocketServer`. */
export type Handlers = {
    create_doc: (data: RefContent, callback: (response: CreateDocSocketResponse) => void) => void;
    start_listening: (
        refId: string,
        docId: string,
        callback: (response: StartListeningSocketResponse) => void,
    ) => void;
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
            startListening: (refId: string, docId: string) => StartListeningSocketResponse;
        },
    ) {
        const socket: Socket<Handlers, Requests> = io(`http://localhost:${port}`);

        socket.on("create_doc", (content, callback) => {
            handlers.createDoc(content).then((response) => callback(response));
        });

        socket.on("start_listening", (refId, docId, callback) => {
            callback(handlers.startListening(refId, docId));
        });

        this.socket = socket;
    }

    autosave(refId: string, content: JsonValue) {
        this.socket.emit("autosave", { refId, content });
    }

    close() {
        this.socket.close();
    }
}
