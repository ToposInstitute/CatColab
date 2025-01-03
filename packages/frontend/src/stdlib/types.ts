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

    constructor() {
        this.metaMap = new Map();
        this.theoryMap = new Map();
    }

    /** Add a theory to the library. */
    add(meta: TheoryMeta, cons: (meta: TheoryMeta) => Theory) {
        if (this.metaMap.has(meta.id)) {
            throw new Error(`Theory with ID ${meta.id} already defined`);
        }
        this.metaMap.set(meta.id, meta);
        this.theoryMap.set(meta.id, cons);
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
