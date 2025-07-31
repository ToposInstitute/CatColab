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

    /** Gets metadata for a theory by ID. */
    getMetadata(id: string): TheoryMeta {
        const meta = this.metaMap.get(id);
        if (meta === undefined) {
            throw new Error(`No theory with ID ${id}`);
        }
        return meta;
    }

    /** Gets metadata for all available theories. */
    allMetadata(): IterableIterator<TheoryMeta> {
        return this.metaMap.values();
    }

    /** Gets metadata for theories clustered by group. */
    groupedMetadata(ids?: string[]): Map<string, TheoryMeta[]> {
        const theories = ids?.map((id) => this.getMetadata(id)) ?? this.allMetadata();
        const grouped = new Map<string, TheoryMeta[]>();
        for (const theory of theories) {
            const groupName = theory.group ?? "Other";
            const group = grouped.get(groupName) || [];
            group.push(theory);
            grouped.set(groupName, group);
        }
        return grouped;
    }
}
