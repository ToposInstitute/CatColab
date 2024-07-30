import express from "express"
import { Repo } from '@automerge/automerge-repo'
import { NodeWSServerAdapter } from '@automerge/automerge-repo-network-websocket'
import { WebSocketServer } from "ws"

const app = express()

app.get("/", (_req, res) => {
    res.send(`👍 backend is running`)
})

const wss = new WebSocketServer({
    noServer: true
})

const repo = new Repo({
    network: [new NodeWSServerAdapter(wss)]
})

const server = app.listen(3000)

server.on("upgrade", (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (socket) => {
        wss.emit("connection", socket, request)
    })
})
