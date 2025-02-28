import { Theory } from "../theory";

/** Frontend metadata for a double theory.

Does not contain the data of the theory but contains enough information to
identify the theory and display it to the user.
 */
export type TheoryMeta = {
    /** Unique identifier of theory. */
    id: string;

    /** Human-readable name for models of theory. */
    name: string;

    /** Short description of models of theory. */
    description: string;

    /** Is this theory the default theory for new models?

    It is enforced that at most one theory will have this status.
     */
    isDefault?: boolean;

    /** Group to which the theory belongs. */
    group?: string;

    /* Name of help page for the theory. */
    help?: string;
};

/** Library of double theories configured for the frontend.

Theories are lazy loaded.
 */
export class TheoryLibrary {
    /** Map from theory ID to metadata about the theory. */
    private readonly metaMap: Map<string, TheoryMeta>;

    /** Map from theory ID to the theory itself or the constructor for it. */
    private readonly theoryMap: Map<string, Theory | ((meta: TheoryMeta) => Theory)>;

    /** ID of the default theory for new models. */
    private defaultTheoryId: string | undefined;

    constructor() {
        this.metaMap = new Map();
        this.theoryMap = new Map();
    }

    /** Add a theory to the library. */
    add(meta: TheoryMeta, cons: (meta: TheoryMeta) => Theory) {
        if (!meta.id) {
            throw new Error("The ID of a theory must be a non-empty string");
        }
        if (this.metaMap.has(meta.id)) {
            throw new Error(`Theory with ID ${meta.id} already defined`);
        }
        this.metaMap.set(meta.id, meta);
        this.theoryMap.set(meta.id, cons);

        // sigma migrations have implicit mappings, make them explicit
        // const T = cons(meta);
        // T.inclusions.forEach((value, _) => {
        //     for (const ty of T.modelTypes) {
        //         if (ty.tag === "ObType") {
        //             let name = ty.obType.content.toString();
        //             if (!value.obnames.has(name)) {
        //                 value.obnames.set(name, name);
        //             }
        //         }
        //         else {
        //             let name = ty.morType.content.toString();
        //             if (!value.mornames.has(name)) {
        //                 value.mornames.set(name, name);
        //             }
        //         }
        //     }
        // });

        // this.theoryMap.forEach((value, key) => {
        //     let m = this.metaMap.get(key);
        //     if (!(m === undefined)) {
        //     if (typeof value === "function") {
        //         let val = value(m);
        //             val.inclusions.forEach((inj, k) => {
        //                 if (k === meta.id) {
        //                     T.pullbacks.set(val.id, inj);
        //                 }
        //             });
        //         }
        //     }
        // });
        // console.log(T.id, "# of pullbacks",T.pullbacks.size)

        if (meta.isDefault) {
            if (this.defaultTheoryId) {
                throw new Error(`The default theory is already set to ${this.defaultTheoryId}`);
            }
            this.defaultTheoryId = meta.id;
        }
    }

    /** Is there a theory with the given ID? */
    has(id: string): boolean {
        return this.metaMap.has(id);
    }

    /** Get a theory by ID.

    A theory is instantiated and cached the first time it is retrieved.
     */
    get(id: string): Theory {
        const meta = this.metaMap.get(id);
        const theoryOrCons = this.theoryMap.get(id);
        if (meta === undefined || theoryOrCons === undefined) {
            throw new Error(`No theory with ID ${id}`);
        } else if (theoryOrCons instanceof Theory) {
            return theoryOrCons;
        } else {
            const theory = theoryOrCons(meta);
            this.theoryMap.set(id, theory);
            return theory;
        }
    }

    /** Gets the default theory for new models.

    Throws an error if no default has been set.
     */
    getDefault(): Theory {
        if (!this.defaultTheoryId) {
            throw new Error("The default theory has not been set");
        }
        return this.get(this.defaultTheoryId);
    }

    /** Iterator over metadata for available theories. */
    metadata(): IterableIterator<TheoryMeta> {
        return this.metaMap.values();
    }

    /** Metadata for available theories, clustered by group. */
    groupedMetadata(): Map<string, TheoryMeta[]> {
        const grouped = new Map<string, TheoryMeta[]>();
        for (const theory of this.metadata()) {
            const groupName = theory.group ?? "Other";
            const group = grouped.get(groupName) || [];
            group.push(theory);
            grouped.set(groupName, group);
        }
        return grouped;
    }
}
