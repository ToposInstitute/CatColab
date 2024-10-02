import { io, type Socket } from "socket.io-client";

type SocketHandlers = {
    get_doc: (data: string, callback: (docId: string) => void) => void;
};

const socket: Socket<SocketHandlers> = io("http://localhost:3000");

socket.on("get_doc", (data, callback) => {
    console.log(`Handling get_doc with data ${data}`);
    callback("#12345");
});
