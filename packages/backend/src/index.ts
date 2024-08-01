import { Server } from "./server.js"

const server = new Server()

export type AppRouter = typeof server.appRouter;

process.once('SIGINT', function (_code) {
    console.log('SIGINT received...');
    server.close();
});

process.once('SIGTERM', function (_code) {
    console.log('SIGTERM received...');
    server.close();
});
