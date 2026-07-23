/** Convert an arbitrary caught value to an error message. */
export function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
