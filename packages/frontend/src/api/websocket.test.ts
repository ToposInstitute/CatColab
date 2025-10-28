import { assert, describe, test } from "vitest";

const plainWsUrl = "ws://localhost:3010";

describe("Plain WebSocket connection", () => {
    test("should connect and echo messages", async () => {
        return new Promise<void>((resolve, reject) => {
            const ws = new WebSocket(plainWsUrl);
            const testMessage = "Hello WebSocket";
            let hasReceivedMessage = false;

            ws.onopen = () => {
                console.log("WebSocket connection opened");
                ws.send(testMessage);
            };

            ws.onmessage = (event) => {
                console.log("Received message:", event.data);
                hasReceivedMessage = true;

                // The server echoes back "Echo: " + message
                assert.strictEqual(event.data, `Echo: ${testMessage}`);

                ws.close();
            };

            ws.onclose = () => {
                console.log("WebSocket connection closed");
                if (hasReceivedMessage) {
                    resolve();
                } else {
                    reject(new Error("Connection closed without receiving message"));
                }
            };

            ws.onerror = (error) => {
                console.error("WebSocket error:", error);
                reject(error);
            };

            // Timeout after 5 seconds
            setTimeout(() => {
                if (!hasReceivedMessage) {
                    ws.close();
                    reject(new Error("Test timed out after 5 seconds"));
                }
            }, 5000);
        });
    });

    test("should handle multiple messages", async () => {
        return new Promise<void>((resolve, reject) => {
            const ws = new WebSocket(plainWsUrl);
            const messages = ["Message 1", "Message 2", "Message 3"];
            const receivedMessages: string[] = [];

            ws.onopen = () => {
                console.log("WebSocket connection opened");
                // Send all messages
                for (const msg of messages) {
                    ws.send(msg);
                }
            };

            ws.onmessage = (event) => {
                console.log("Received message:", event.data);
                receivedMessages.push(event.data);

                // Check if we've received all expected messages
                if (receivedMessages.length === messages.length) {
                    // Verify each message
                    for (let i = 0; i < messages.length; i++) {
                        assert.strictEqual(receivedMessages[i], `Echo: ${messages[i]}`);
                    }
                    ws.close();
                }
            };

            ws.onclose = () => {
                console.log("WebSocket connection closed");
                if (receivedMessages.length === messages.length) {
                    resolve();
                } else {
                    reject(
                        new Error(
                            `Expected ${messages.length} messages, received ${receivedMessages.length}`,
                        ),
                    );
                }
            };

            ws.onerror = (error) => {
                console.error("WebSocket error:", error);
                reject(error);
            };

            // Timeout after 5 seconds
            setTimeout(() => {
                if (receivedMessages.length < messages.length) {
                    ws.close();
                    reject(new Error("Test timed out after 5 seconds"));
                }
            }, 5000);
        });
    });
});
