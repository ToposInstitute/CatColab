import { Server } from "./server.js";

const server = new Server();

export type AppRouter = typeof server.appRouter;

process.once("SIGINT", (_code) => {
    console.log("SIGINT received...");
    server.close();
});

process.once("SIGTERM", (_code) => {
    console.log("SIGTERM received...");
    server.close();
});
