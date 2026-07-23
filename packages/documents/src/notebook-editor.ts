import { richTextHandle } from "./cell";
import { newFormalCell, newRichTextCell, type NotebookCore } from "./notebook-core";
import type { Result } from "./result";

export interface FormalCellFamily<Content> {
    supportsType(type: unknown): boolean;
    supportsContent(content: unknown): content is Content;
    create(type: unknown, value: unknown): Content;
    attach(cellId: string): unknown;
    matches(type: unknown, content: Content): boolean;
    duplicate(content: Content): Content;
}

export interface NotebookEditor {
    add(type: unknown, value: unknown): unknown;
    cells(): readonly unknown[];
    cellsOf(type: unknown): readonly unknown[];
    get(type: unknown, cellId: string): Result<unknown>;
}

const isRichTextType = (type: unknown): boolean =>
    typeof type === "object" && type !== null && (type as { kind?: unknown }).kind === "rich-text";

export function createNotebookEditor<
    Formal,
    const Families extends readonly FormalCellFamily<Formal>[],
>(core: NotebookCore<Formal>, families: Families): NotebookEditor {
    const uniqueFamily = (
        matches: (family: FormalCellFamily<Formal>) => boolean,
        description: string,
    ) => {
        const matching = families.filter(matches);
        if (matching.length > 1) {
            throw new Error(`Multiple formal cell families support ${description}.`);
        }
        return matching[0];
    };
    const familyForType = (type: unknown) =>
        uniqueFamily((family) => family.supportsType(type), "the same cell type");
    const familyForContent = (content: Formal) =>
        uniqueFamily((family) => family.supportsContent(content), "the same formal content");

    core.setDuplicateFormal((content) => {
        const family = familyForContent(content);
        if (!family) {
            throw new Error("Formal content is not supported by this notebook.");
        }
        return family.duplicate(content);
    });

    const attach = (cellId: string): unknown => {
        const cell = core.get(cellId);
        if (!cell) {
            throw new Error(`Cell ${cellId} does not exist.`);
        }
        if (cell.tag === "rich-text") {
            return richTextHandle(core, cellId);
        }
        const family = familyForContent(cell.content);
        if (!family) {
            throw new Error(`Formal cell ${cellId} is not supported by this notebook.`);
        }
        return family.attach(cellId);
    };

    const matches = (type: unknown, cellId: string): boolean => {
        const cell = core.get(cellId);
        if (!cell) {
            return false;
        }
        if (cell.tag === "rich-text") {
            return isRichTextType(type);
        }
        const family = familyForType(type);
        return family?.supportsContent(cell.content) === true
            ? family.matches(type, cell.content)
            : false;
    };

    return {
        add(type, value) {
            if (isRichTextType(type)) {
                const cell = newRichTextCell((value as { content: string }).content);
                core.append(cell);
                return richTextHandle(core, cell.id);
            }
            const family = familyForType(type);
            if (!family) {
                throw new Error("Cell type is not supported by this notebook.");
            }
            const cell = newFormalCell(family.create(type, value));
            core.append(cell);
            return family.attach(cell.id);
        },
        cells() {
            return core.cells().map((cell) => attach(cell.id));
        },
        cellsOf(type) {
            return core
                .cells()
                .filter((cell) => matches(type, cell.id))
                .map((cell) => attach(cell.id));
        },
        get(type, cellId) {
            if (!core.get(cellId)) {
                return {
                    tag: "Err",
                    content: [{ message: `No cell with id "${cellId}".`, path: ["id"] }],
                };
            }
            if (!matches(type, cellId)) {
                return {
                    tag: "Err",
                    content: [
                        {
                            message: `Cell "${cellId}" is not of the expected type.`,
                            path: ["id"],
                        },
                    ],
                };
            }
            return { tag: "Ok", content: attach(cellId) };
        },
    };
}
