export function assertExhaustive(value: never): never {
    let valueString: string;
    try {
        valueString = JSON.stringify(value);
    } catch (_) {
        valueString = String(value);
    }
    throw new Error(`Unhandled case: ${valueString}`);
}
