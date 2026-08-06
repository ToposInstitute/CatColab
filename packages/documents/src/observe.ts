import type { ModelCache } from "./model-cache";

/**
 * The machinery behind {@link Notebook.onValidate}: a validation observer
 * re-validates a notebook when — and only when — something its validation
 * actually depends on changes, and delivers the result to a callback when — and
 * only when — it differs from the last delivered one.
 *
 * The dependency set comes from the model cache: after each validation the
 * observer reads the ids of every document in the resolution subtree
 * ({@link ModelCache.depsOf}) and keeps a change subscription
 * ({@link ModelCache.onDocChange}) on exactly those, resubscribing as
 * instantiations are added or removed. This is what per-component wiring built
 * on `onChangeFormalContent` cannot do: it watches one document, while a
 * validation depends on the whole subtree — an edit to an instantiated child
 * (or, for an instance, to its schema) re-validates here without the consumer
 * knowing the dependency graph exists.
 *
 * Re-validation is cheap by construction: the model cache serves an unchanged
 * subtree from memory, so the observer can afford to run on every reported
 * change (including noisy ones like rich-text keystrokes) and let the
 * `equivalent` gate suppress deliveries that would re-render nothing.
 */
export type ValidationObserverOptions<T> = {
    /** Run one validation, producing the value considered for delivery. */
    validate(): Promise<T>;
    /** The cache tracking the model dependency tree. */
    cache: ModelCache;
    /**
     * The id of the document whose resolution roots the dependency tree: the
     * notebook's own reference id for a model notebook, the host model's
     * (`diagramIn`/`instanceIn`) for a diagram or instance. `undefined` when
     * there is no such rooting document (e.g. an unlinked diagram/instance); the
     * observer then only reacts to `subscribeOwn` triggers.
     */
    depRootId: string | undefined;
    /**
     * Subscribe to changes of the observed notebook's own (formal) content —
     * the one dependency that is not a resolved model document, and the
     * fallback trigger while no resolution has succeeded yet.
     */
    subscribeOwn(callback: () => void): () => void;
    /** Whether two results are equivalent; an equivalent result is not
     * re-delivered, so no-op re-validations cause no re-renders. */
    equivalent(previous: T, next: T): boolean;
    /** Deliver a changed result (and the first result). */
    deliver(result: T): void;
};

/**
 * Start observing: validate once (asynchronously) and deliver, then re-validate
 * on relevant changes, delivering only results that are not `equivalent` to the
 * last delivered one. Returns a dispose function that stops observation and
 * releases every subscription.
 *
 * Changes are coalesced: a burst of synchronous edits triggers one validation
 * (the loop yields a microtask before validating), and a change arriving while
 * a validation is in flight queues exactly one more run. Exceptions from
 * `validate` are not caught — a throw indicates shape misconfiguration (e.g. a
 * missing core theory), not invalid content, and surfaces as an unhandled
 * rejection; the observer stays subscribed and re-runs on the next change.
 */
export function createValidationObserver<T>(options: ValidationObserverOptions<T>): () => void {
    /** Cache-side change subscriptions, one per dependency doc id. */
    const depSubscriptions = new Map<string, () => void>();
    let disposed = false;
    let running = false;
    let dirty = false;
    /** Boxed so a legitimately-undefined first result still counts as delivered. */
    let last: { value: T } | undefined;

    /**
     * Align the cache subscriptions with the dependency set of the latest
     * resolution. When the resolution failed (no fresh entry, so no dep set),
     * the current subscriptions are kept: the documents involved are the likely
     * site of the fix, so their changes must keep re-triggering.
     */
    const resyncDeps = (): void => {
        const deps = options.depRootId ? options.cache.depsOf(options.depRootId) : undefined;
        if (!deps) {
            return;
        }
        for (const [id, unsubscribe] of depSubscriptions) {
            if (!deps.has(id)) {
                unsubscribe();
                depSubscriptions.delete(id);
            }
        }
        for (const id of deps) {
            if (!depSubscriptions.has(id)) {
                depSubscriptions.set(id, options.cache.onDocChange(id, schedule));
            }
        }
    };

    const run = async (): Promise<void> => {
        running = true;
        try {
            while (dirty) {
                if (disposed) {
                    return;
                }
                dirty = false;
                // Yield one microtask so a synchronous burst of changes is
                // batched into a single validation.
                await Promise.resolve();
                const value = await options.validate();
                if (disposed) {
                    return;
                }
                resyncDeps();
                if (!last || !options.equivalent(last.value, value)) {
                    last = { value };
                    options.deliver(value);
                }
            }
        } finally {
            running = false;
        }
    };

    const schedule = (): void => {
        if (disposed) {
            return;
        }
        dirty = true;
        if (!running) {
            void run();
        }
    };

    const unsubscribeOwn = options.subscribeOwn(schedule);
    schedule();

    return () => {
        disposed = true;
        unsubscribeOwn();
        for (const unsubscribe of depSubscriptions.values()) {
            unsubscribe();
        }
        depSubscriptions.clear();
    };
}
