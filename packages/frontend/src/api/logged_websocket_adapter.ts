import { BrowserWebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";
import type { PeerId, PeerMetadata } from "@automerge/automerge-repo";

/**
 * A wrapper around BrowserWebSocketClientAdapter that adds console logging
 * to help diagnose connection issues in test environments.
 */
export class LoggedWebSocketAdapter extends BrowserWebSocketClientAdapter {
    private originalOnOpen: () => void;
    private originalOnClose: () => void;
    private originalOnMessage: (event: MessageEvent) => void;
    private originalOnError: (event: Event) => void;

    constructor(url: string, retryInterval?: number) {
        console.log(`[LoggedWS] Creating adapter with URL: ${url}, retryInterval: ${retryInterval}`);
        super(url, retryInterval);

        // Store the original handlers
        this.originalOnOpen = this.onOpen.bind(this);
        this.originalOnClose = this.onClose.bind(this);
        this.originalOnMessage = this.onMessage.bind(this);
        this.originalOnError = this.onError.bind(this);

        // Replace with logged versions
        this.onOpen = () => {
            console.log(`[LoggedWS] onOpen event fired`);
            console.log(`[LoggedWS] Socket readyState: ${this.socket?.readyState}`);
            this.originalOnOpen();
        };

        this.onClose = () => {
            console.log(`[LoggedWS] onClose event fired`);
            console.log(`[LoggedWS] Remote peer ID: ${this.remotePeerId}`);
            this.originalOnClose();
        };

        this.onMessage = (event: MessageEvent) => {
            console.log(`[LoggedWS] onMessage event fired, data length:`, event.data?.byteLength || event.data?.length);
            this.originalOnMessage(event);
        };

        this.onError = (event: Event) => {
            console.error(`[LoggedWS] onError event fired:`, event);
            console.error(`[LoggedWS] Socket readyState: ${this.socket?.readyState}`);
            this.originalOnError(event);
        };
    }

    connect(peerId: PeerId, peerMetadata?: PeerMetadata) {
        console.log(`[LoggedWS] connect() called with peerId: ${peerId}`, peerMetadata);
        console.log(`[LoggedWS] Current socket state:`, this.socket?.readyState);
        try {
            super.connect(peerId, peerMetadata);
            console.log(`[LoggedWS] connect() completed, socket created`);
        } catch (error) {
            console.error(`[LoggedWS] Error in connect():`, error);
            throw error;
        }
    }

    join() {
        console.log(`[LoggedWS] join() called`);
        console.log(`[LoggedWS] peerId: ${this.peerId}, socket readyState: ${this.socket?.readyState}`);
        try {
            super.join();
            console.log(`[LoggedWS] join() completed successfully`);
        } catch (error) {
            console.error(`[LoggedWS] Error in join():`, error);
            throw error;
        }
    }

    send(message: any) {
        console.log(`[LoggedWS] send() called, message type: ${message.type}`);
        console.log(`[LoggedWS] Socket readyState: ${this.socket?.readyState}`);
        try {
            super.send(message);
            console.log(`[LoggedWS] send() completed successfully`);
        } catch (error) {
            console.error(`[LoggedWS] Error in send():`, error);
            throw error;
        }
    }

    disconnect() {
        console.log(`[LoggedWS] disconnect() called`);
        super.disconnect();
        console.log(`[LoggedWS] disconnect() completed`);
    }

    peerCandidate(remotePeerId: PeerId, peerMetadata: PeerMetadata) {
        console.log(`[LoggedWS] peerCandidate() called with remotePeerId: ${remotePeerId}`, peerMetadata);
        super.peerCandidate(remotePeerId, peerMetadata);
        console.log(`[LoggedWS] peerCandidate() completed`);
    }

    receiveMessage(messageBytes: Uint8Array) {
        console.log(`[LoggedWS] receiveMessage() called, bytes length: ${messageBytes.byteLength}`);
        try {
            super.receiveMessage(messageBytes);
            console.log(`[LoggedWS] receiveMessage() completed successfully`);
        } catch (error) {
            console.error(`[LoggedWS] Error in receiveMessage():`, error);
            throw error;
        }
    }

    isReady() {
        const ready = super.isReady();
        console.log(`[LoggedWS] isReady() called, returning: ${ready}`);
        return ready;
    }

    whenReady() {
        console.log(`[LoggedWS] whenReady() called`);
        return super.whenReady();
    }
}
