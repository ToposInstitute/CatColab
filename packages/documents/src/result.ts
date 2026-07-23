export interface Issue {
    readonly message: string;
    readonly path?: readonly (string | number)[];
}

export type Result<T, E = readonly Issue[]> =
    | { readonly tag: "Ok"; readonly content: T }
    | { readonly tag: "Err"; readonly content: E };
