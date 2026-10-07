/** Ownership of subscriptions is independent of storage or UI frameworks. */
export function createSubscriptionScope() {
    const subscriptions = new Set<() => void>();
    let disposed = false;
    return {
        track(unsubscribe: () => void): () => void {
            if (disposed) {
                unsubscribe();
                return () => {};
            }
            const stop = () => {
                if (subscriptions.delete(stop)) {
                    unsubscribe();
                }
            };
            subscriptions.add(stop);
            return stop;
        },
        dispose(): void {
            if (disposed) {
                return;
            }
            disposed = true;
            for (const stop of subscriptions) {
                stop();
            }
        },
    };
}
