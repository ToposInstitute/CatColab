/** Create a debounced version of a function.

The returned function delays invoking `fn` until `ms` milliseconds have elapsed
since the last invocation. Each new call resets the timer.

Also returns a `cancel` method to clear any pending invocation.
 */
export function debounce<Args extends unknown[]>(
    fn: (...args: Args) => void,
    ms: number,
): ((...args: Args) => void) & { cancel: () => void } {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const debounced = (...args: Args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    };

    debounced.cancel = () => {
        clearTimeout(timer);
    };

    return debounced;
}
