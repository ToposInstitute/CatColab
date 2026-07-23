import type { Result } from "./result";

export function observeValidation<Output>(options: {
    readonly subscribe: (callback: () => void) => () => void;
    readonly validate: () => Promise<Result<Output>>;
    readonly dispose?: (output: Output) => void;
    readonly callback: (result: Result<Output>) => void;
}): () => void {
    let active = true;
    let generation = 0;

    const run = async () => {
        const current = ++generation;
        const result = await options.validate();
        if (!active || current !== generation) {
            if (result.tag === "Ok") {
                options.dispose?.(result.content);
            }
            return;
        }
        options.callback(result);
    };

    queueMicrotask(() => void run());
    const unsubscribe = options.subscribe(() => void run());
    return () => {
        active = false;
        unsubscribe();
    };
}
