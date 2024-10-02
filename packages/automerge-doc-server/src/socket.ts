import { io, type Socket } from "socket.io-client";

/** Messages handled by the `SocketServer`. */
export type Handlers = {
    doc_id: (refId: string, callback: (docId: string) => void) => void;
};

/** Messages emitted by the `SocketServer`. */
export type Requests = {
    autosave: (refId: string, data: unknown) => void;
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
            docId: (refId: string) => string;
        },
    ) {
        const socket: Socket<Handlers, Requests> = io(`http://localhost:${port}`);

        socket.on("doc_id", (refId, callback) => callback(handlers.docId(refId)));

        this.socket = socket;
    }

    autosave(refId: string, data: unknown) {
        this.socket.emit("autosave", refId, data);
    }

    close() {
        this.socket.close();
    }
}
