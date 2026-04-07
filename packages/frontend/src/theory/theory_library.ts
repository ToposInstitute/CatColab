import type { EditorVariantOverrides } from "../model/editors";
import { type ModelAnalysisMeta, Theory } from "./theory";
export type { EditorVariantOverrides };

/** Display metadata for an editor variant of a theory.

An editor variant shares the same underlying double theory but uses different
editor components for some types (e.g., a string diagram editor for morphisms).
 */
export type EditorVariantMeta = {
    /** Unique identifier of the editor variant. */
    id: string;

    /** Human-readable name for the editor variant. */
    name: string;

    /** Short description of the editor variant. */
    description: string;

    /** Two-letter icon abbreviation for the editor variant. */
    iconLetters?: [string, string];

    /** Group to which the editor variant belongs. */
    group?: string;

    /** Editor component overrides for this editor variant.

    Specifies which editor components replace the defaults for particular types.
    Components can be wrapped with SolidJS `lazy()` to defer loading.
     */
    editorOverrides?: EditorVariantOverrides;
};

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

    /** Editor variants of this theory.

    Each editor variant appears as a separate selectable option in the theory
    picker but shares the same underlying theory — only the editors differ.
    Editor variants share the base theory's help page and are hidden from
    the help overview.
     */
    editorVariants?: EditorVariantMeta[];
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
    /** Map from theory ID to metadata about the theory.

    Contains entries only for base theories, not editor variants. Use
    `getMetadata()` to look up display metadata for either kind.
     */
    private readonly metaMap: Map<string, TheoryMeta>;

    /** Map from theory ID to the theory itself or the constructor for it.

    Only contains entries for base theories, not editor variants. Editor
    variants are derived from their base theory on demand.
     */
    private readonly theoryMap: Map<string, Theory | (() => Promise<TheoryConstructor>)>;

    /** Map from editor variant ID to its metadata and base theory ID. */
    private readonly editorVariantMetaMap: Map<
        string,
        { editorVariant: EditorVariantMeta; baseId: string }
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

        // Register editor variants.
        if (meta.editorVariants) {
            const editorVariantIds: string[] = [];
            for (const editorVariant of meta.editorVariants) {
                if (this.editorVariantMetaMap.has(editorVariant.id)) {
                    throw new Error(`Editor variant with ID ${editorVariant.id} already defined`);
                }
                this.editorVariantMetaMap.set(editorVariant.id, {
                    editorVariant,
                    baseId: meta.id,
                });
                editorVariantIds.push(editorVariant.id);
            }
            this.baseToEditorVariants.set(meta.id, editorVariantIds);
        }
    }

    /** Is there a theory or editor variant with the given ID? */
    has(id: string): boolean {
        return this.metaMap.has(id) || this.editorVariantMetaMap.has(id);
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
        this.theoryMap.set(id, theory);
        return theory;
    }

    /** Gets display metadata for a theory or editor variant by ID. */
    getMetadata(id: string): TheoryMeta {
        const meta = this.metaMap.get(id);
        if (meta !== undefined) {
            return meta;
        }

        const entry = this.editorVariantMetaMap.get(id);
        if (entry !== undefined) {
            const baseMeta = this.metaMap.get(entry.baseId);
            if (baseMeta === undefined) {
                throw new Error(`Base theory ${entry.baseId} not found for editor variant ${id}`);
            }
            const ev = entry.editorVariant;
            return {
                id: ev.id,
                name: ev.name,
                description: ev.description,
                iconLetters: ev.iconLetters ?? baseMeta.iconLetters,
                group: ev.group ?? baseMeta.group,
            };
        }

        throw new Error(`No theory with ID ${id}`);
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

    /** Gets metadata for all available theories.

    By default, only base theories are returned. Pass
    `includeEditorVariants: true` to also include editor variants.
     */
    *allMetadata(options?: { includeEditorVariants?: boolean }): IterableIterator<TheoryMeta> {
        yield* this.metaMap.values();
        if (options?.includeEditorVariants) {
            for (const id of this.editorVariantMetaMap.keys()) {
                yield this.getMetadata(id);
            }
        }
    }

    /** Gets metadata for theories clustered by group.

    When `ids` is provided, exactly those theories (or editor variants) are
    included. Otherwise, all base theories are returned, optionally including
    editor variants via `options.includeEditorVariants`.
     */
    groupedMetadata(
        ids?: string[],
        options?: { includeEditorVariants?: boolean },
    ): Map<string, TheoryMeta[]> {
        const theories = ids?.map((id) => this.getMetadata(id)) ?? this.allMetadata(options);
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
