declare module "deep-equal-json" {
    // biome-ignore lint/suspicious/noExplicitAny: any JSON objects
    declare function deepEqualJSON(actual: any, expected: any): boolean;

    export = deepEqualJSON;
}
