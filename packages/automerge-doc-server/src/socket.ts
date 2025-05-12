import { type Socket, io } from "socket.io-client";

import type { JsonValue, RefContent } from "../../backend/pkg/src/index.ts";
import type { NewDocSocketResponse, StartListeningSocketResponse } from "./types.js";

/** Messages handled by the `SocketServer`. */
export type SocketIOHandlers = {
    createDoc: (data: RefContent) => Promise<NewDocSocketResponse>;
    cloneDoc: (docId: string) => Promise<NewDocSocketResponse>;
    startListening: (refId: string, docId: string) => Promise<StartListeningSocketResponse>;
};

/** Messages emitted by the `SocketServer`. */
export type Requests = {
    autosave: (data: RefContent) => void;
};

// Convert the type of each property from `(...args) => ret` to `(...args, (ret) => void) => void` to
// match the signature expected for SocketIO listeners
type Callbackify<T> = {
    [K in keyof T]: T[K] extends (...args: infer Args) => infer Ret
        ? (...args: [...Args, (ret: Promise<Ret>) => void]) => void
        : never;
};

function registerHandler<
    H extends SocketIOHandlers,
    E extends keyof H,
    S extends Socket<H, Requests>,
>(socket: S, event: E, automergeServer: H) {
    // Socket listeners receive event arguments followed by a callback for sending the response.
    // The function signature is type-safe, but the implementation is not type-checked because working
    // with tuple types and variadic arguments in TypeScript is really hard

    const listener = (...args: any[]) => {
        const callback = args.pop();
        const handler = automergeServer[event] as any;
        const result = handler.apply(automergeServer, args);

        // Wrap result in a promise so this doesn't blow up when a sync handler is added in the future
        Promise.resolve(result).then(callback);
    };

    socket.on(event as any, listener);
}

export class SocketServer {
    private socket: Socket<Callbackify<SocketIOHandlers>, Requests>;

    constructor(port: number | string, automergeServer: SocketIOHandlers) {
        const socket: Socket<Callbackify<SocketIOHandlers>, Requests> = io(
            `http://localhost:${port}`,
        );

        registerHandler(socket, "createDoc", automergeServer);
        registerHandler(socket, "cloneDoc", automergeServer);
        registerHandler(socket, "startListening", automergeServer);

        this.socket = socket;
    }

    autosave(refId: string, content: JsonValue) {
        this.socket.emit("autosave", { refId, content });
    }

    close() {
        this.socket.close();
    }
}
