import * as z from "zod";

const Extern = z.object({
    /// The ref that the extern is pointing to
    /// In the future, we might make this more finegrained and
    /// have externs point to ref + witness, or to snapshot
    refId: z.string(),
    /// The type of relationship between the parent document and what this
    /// extern is pointing to, e.g. "submodel" or "analysis"
    taxon: z.string(),
    /// A document might import/reference another document multiple times,
    /// this field allows those references to be distinguished,
    /// for instance by the path under which the model is imported
    via: z.string().or(z.null()),
});

export type Extern = z.infer<typeof Extern>;

// biome-ignore lint/suspicious/noExplicitAny: x can be anything!
export function traverseExterns(x: any, f: (extern: Extern) => void): void {
    if (typeof x === "object") {
        if (Object.hasOwn(x, "__extern__")) {
            const result = Extern.safeParse(x.__extern__);
            if (result.success) {
                f(result.data);
            }
        } else if (Array.isArray(x)) {
            for (const e of x) {
                traverseExterns(e, f);
            }
        } else {
            for (const [_, e] of Object.entries(x)) {
                traverseExterns(e, f);
            }
        }
    }
}
