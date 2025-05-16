import { AutomergeServer } from "./server.js";
import { SocketServer } from "./socket.js";

const internal_port = process.env.AUTOMERGE_INTERNAL_PORT || 3000;
const port = process.env.AUTOMERGE_PORT || 8010;

const server = new AutomergeServer(port);

const socket_server = new SocketServer(internal_port, server);

server.handleChange = (refId, content) => socket_server.autosave(refId, content);

process.once("SIGINT", () => {
    socket_server.close();
    server.close();
});

process.once("SIGTERM", () => {
    socket_server.close();
    server.close();
});
