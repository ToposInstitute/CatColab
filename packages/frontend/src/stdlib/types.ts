import { Theory, type TheoryId } from "../theory";

/** Frontend metadata for a double theory.

Does not contain the data of the theory but contains enough information to
identify the theory and display it to the user.
 */
export type TheoryMeta = {
    /** Unique identifier of theory. */
    id: TheoryId;

    /** Human-readable name for models of theory. */
    name: string;

    /** Short description of models of theory. */
    description?: string;
    
    /** division Category for theory catalogue */
    divisionCategory?: string;
};

/** Library of double theories configured for the frontend.

Theories are lazy loaded.
 */
export class TheoryLibrary {
    private readonly metaMap: Map<TheoryId, TheoryMeta>;
    private readonly theoryMap: Map<TheoryId, Theory | ((meta: TheoryMeta) => Theory)>;

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

    /** Get a theory by ID.

    A theory is instantiated and cached the first time it is retrieved.
     */
    get(id: TheoryId): Theory {
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
}
