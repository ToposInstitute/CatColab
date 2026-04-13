import type { EditorVariantOverrides } from "../model/editors";
import { type EditorVariant, type ModelAnalysisMeta, Theory } from "./theory";
export type { EditorVariant, EditorVariantOverrides };

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

    /** Two-letter icon abbreviation for the theory.
    The first letter is usually uppercase and the second is lowercase.
     */
    iconLetters: [string, string];

    /** Is this theory the default theory for new models?
    It is enforced that at most one theory will have this status.
     */
    isDefault?: boolean;

    /** Group to which the theory belongs. */
    group?: string;
};

type TheoryConstructor = (meta: TheoryMeta) => Theory;

/** A generic analysis of a model.

Most model analyses make sense only for specific theories. These are the
exceptional ones that potentially apply to models of any theory.
 */
type GenericModelAnalysis = {
    /** Constructor of analysis metadata. */
    construct: () => ModelAnalysisMeta;

    /** Condition under which the analysis applies (default: always). */
    when?: (theory: Theory) => boolean;
};

/** Library of double theories configured for the frontend.

Theories are lazy loaded.
 */
export class TheoryLibrary {
    /** Map from theory ID to metadata about the theory. */
    private readonly metaMap: Map<string, TheoryMeta>;

    /** Map from theory ID to the theory itself or the constructor for it. */
    private readonly theoryMap: Map<string, Theory | (() => Promise<TheoryConstructor>)>;

    /** Map from editor variant ID to its metadata and base theory ID. */
    private readonly editorVariantMetaMap: Map<
        string,
        { editorVariant: EditorVariant; baseId: string }
    >;

    /** Map from base theory ID to the IDs of its editor variants. */
    private readonly baseToEditorVariants: Map<string, string[]>;

    /** ID of the default theory for new models. */
    private defaultTheoryId: string | undefined;

    private genericModelAnalyses: Array<GenericModelAnalysis>;

    constructor() {
        this.metaMap = new Map();
        this.theoryMap = new Map();
        this.editorVariantMetaMap = new Map();
        this.baseToEditorVariants = new Map();
        this.genericModelAnalyses = [];
    }

    /** Add a theory to the library. */
    add(meta: TheoryMeta, cons: () => Promise<TheoryConstructor>) {
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
    If the ID is an editor variant, the base theory is returned instead.
     */
    async get(id: string): Promise<Theory> {
        // If this is an editor variant, resolve to the base theory.
        const editorVariantEntry = this.editorVariantMetaMap.get(id);
        if (editorVariantEntry !== undefined) {
            return this.get(editorVariantEntry.baseId);
        }

        // Attempt to retrieve cached base theory.
        const meta = this.metaMap.get(id);
        const theoryOrCons = this.theoryMap.get(id);
        if (meta === undefined || theoryOrCons === undefined) {
            throw new Error(`No theory with ID ${id}`);
        } else if (theoryOrCons instanceof Theory) {
            return theoryOrCons;
        }
        // If that fails, construct and cache it.
        const construct = await theoryOrCons();
        const theory = construct(meta);
        for (const info of this.genericModelAnalyses) {
            if (info.when?.(theory) ?? true) {
                theory.addModelAnalysis(info.construct());
            }
        }

        // Register editor variants defined on the theory, skipping any
        // that were already registered (can happen with concurrent loads).
        const editorVariantIds: string[] = [];
        for (const editorVariant of theory.editorVariants?.variants ?? []) {
            if (!this.editorVariantMetaMap.has(editorVariant.id)) {
                this.editorVariantMetaMap.set(editorVariant.id, {
                    editorVariant,
                    baseId: id,
                });
            }
            editorVariantIds.push(editorVariant.id);
        }
        if (editorVariantIds.length > 0) {
            this.baseToEditorVariants.set(id, editorVariantIds);
        }

        this.theoryMap.set(id, theory);
        return theory;
    }

    /** Gets metadata for a theory by ID. */
    getMetadata(id: string): TheoryMeta {
        const meta = this.metaMap.get(id);
        if (meta === undefined) {
            throw new Error(`No theory with ID ${id}`);
        }
        return meta;
    }

    /** Gets the base theory ID for an editor variant, if the given ID is an editor variant. */
    getBaseTheoryId(id: string): string | undefined {
        return this.editorVariantMetaMap.get(id)?.baseId;
    }

    /** Whether the given ID is an editor variant of another theory. */
    isEditorVariant(id: string): boolean {
        return this.editorVariantMetaMap.has(id);
    }

    /** Gets the IDs of all editor variants of the given theory.

    Returns an empty array if the theory has no editor variants.
     */
    getEditorVariantIds(id: string): string[] {
        return this.baseToEditorVariants.get(id) ?? [];
    }

    /** Gets the editor overrides for an editor variant.

    Returns `undefined` if the ID is not an editor variant or if the variant
    has no overrides.
     */
    getEditorOverrides(id: string): EditorVariantOverrides | undefined {
        return this.editorVariantMetaMap.get(id)?.editorVariant.editorOverrides;
    }

    /** Gets metadata for the default theory for new models.

    Throws an error if no default has been set.
     */
    defaultTheoryMetadata(): TheoryMeta {
        if (!this.defaultTheoryId) {
            throw new Error("The default theory has not been set");
        }
        return this.getMetadata(this.defaultTheoryId);
    }

    /** Gets metadata for all available theories. */
    allMetadata(): IterableIterator<TheoryMeta> {
        return this.metaMap.values();
    }

    /** Gets metadata for theories clustered by group.

    When `ids` is provided, exactly those theories are included. Otherwise, all
    theories are returned.
     */
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

    /** Adds a generic model analysis to the library.

    Such an analysis will be automatically added to models of any applicable theory.
     */
    addGenericModelAnalysis(meta: GenericModelAnalysis) {
        this.genericModelAnalyses.push(meta);
    }
}
