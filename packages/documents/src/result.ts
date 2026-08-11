/** The result of a fallible operation. */
export type Result<T, E = ReadonlyArray<Issue>> =
    | { readonly tag: "Ok"; readonly content: T }
    | { readonly tag: "Err"; readonly content: E };

/** The issue interface of the failure output. */
export interface Issue {
    /** The error message of the issue. */
    readonly message: string;
    /** The path of the issue, if any. */
    readonly path?: ReadonlyArray<PropertyKey | PathSegment> | undefined;
}

/** The path segment interface of the issue. */
export interface PathSegment {
    /** The key representing a path segment. */
    readonly key: PropertyKey;
}
