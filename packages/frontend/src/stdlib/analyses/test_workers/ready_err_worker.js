self.postMessage({ type: "ready" });

self.onmessage = (event) => {
    const request = event.data;
    self.postMessage({
        requestId: request.requestId,
        tag: "Err",
        error: "test-worker",
    });
};
