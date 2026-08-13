import type { AttrTypeName } from "./document";

/**
 * The pure model behind the free-form sheet view: a schemaless grid of strings
 * from which the user carves out instance tables. Everything here is pure so
 * the inference and conversion planning are testable without a grid.
 */

/** The scratch grid: rows of cell texts. Ragged rows are permitted. */
export type SheetData = string[][];

/**
 * An explicit column type: a scalar attribute type, or a foreign key to the
 * entity named by the tag (`link:<entity uuid>`). Link columns become schema
 * mappings when a table is made, their cell texts resolved to target rows.
 */
export type SheetColumnTag = AttrTypeName | `link:${string}`;

/** Whether a column tag marks a foreign key rather than a scalar type. */
export const isLinkTag = (tag: SheetColumnTag): tag is `link:${string}` => tag.startsWith("link:");

/** The tag marking a foreign key to the given entity. */
export const linkTag = (entityId: string): SheetColumnTag => `link:${entityId}`;

/** The target entity UUID of a link tag. */
export const linkTagEntity = (tag: `link:${string}`): string => tag.slice("link:".length);

/**
 * Explicit column type tags for the scratch grid, aligned with column indexes.
 * `null` (or absence) means *auto*: the type is inferred from the data when a
 * table is made. A tag set by the user wins over inference.
 */
export type SheetColumnTypes = Array<SheetColumnTag | null>;

/**
 * Custom titles for the scratch grid's columns, aligned with column indexes.
 * `null` (or absence) means untitled: the header shows its spreadsheet letter.
 * When any selected column is titled, the titles name the table's columns and
 * every content row is data; otherwise the first content row is the header.
 */
export type SheetColumnTitles = Array<string | null>;

/** The scratch grid's persisted state: cells, column types, column titles. */
export type PersistedSheet = {
    cells: SheetData;
    types: SheetColumnTypes;
    titles: SheetColumnTitles;
};

/** A contiguous, inclusive range of selected sheet columns. */
export type SheetColumnRange = { start: number; end: number };

/** The localStorage key the free sheet's scratch data is persisted under. */
export const SHEET_STORAGE_KEY = "catcolab-instances-demo:sheet";

/** One planned column of a table carved from the sheet. */
export type SheetColumnPlan = {
    /** The 0-based sheet column this plan reads from. */
    sheetColumn: number;
    /** The proposed attribute name, from the column title (or its letters). */
    name: string;
    /**
     * The proposed column type: the column's explicit tag when one is set
     * (possibly a foreign key), otherwise the scalar type inferred from its
     * data values.
     */
    proposedType: SheetColumnTag;
    /** The column's data values, aligned with the plan's `rows`. */
    values: string[];
};

/** The full plan for turning selected sheet columns into a table. */
export type SheetTablePlan = {
    /** The proposed entity name; the review dialog lets the user edit it. */
    entityName: string;
    columns: SheetColumnPlan[];
    /**
     * The data rows (blank rows skipped), each aligned with `columns`;
     * `rows[i][j]` is the value of column `j` in row `i`.
     */
    rows: string[][];
};

/** The 32-bit integer bounds instance Int cells accept. */
const I32_MIN = -2_147_483_648;
const I32_MAX = 2_147_483_647;

const isBlank = (text: string): boolean => text.trim() === "";

const parseBoolean = (text: string): boolean | undefined => {
    const lowered = text.trim().toLowerCase();
    return lowered === "true" ? true : lowered === "false" ? false : undefined;
};

const parseNumber = (text: string): number | undefined => {
    const trimmed = text.trim();
    if (trimmed === "") {
        return undefined;
    }
    const value = Number(trimmed);
    return Number.isFinite(value) ? value : undefined;
};

const isInt32 = (value: number): boolean =>
    Number.isInteger(value) && value >= I32_MIN && value <= I32_MAX;

/** Whether a cell text parses under a scalar type (blank always does: unset). */
export const cellParsesAs = (text: string, type: AttrTypeName): boolean =>
    isBlank(text) || parseCellValue(text, type) !== undefined;

/**
 * Parse one cell text into the value stored for an attribute of the given
 * type: `undefined` for a blank or unparseable cell (the cell is left unset).
 * Strings are kept verbatim, so leading/trailing whitespace survives.
 */
export function parseCellValue(
    text: string,
    type: AttrTypeName,
): string | number | boolean | undefined {
    if (isBlank(text)) {
        return undefined;
    }
    switch (type) {
        case "Boolean":
            return parseBoolean(text);
        case "Integer": {
            const value = parseNumber(text);
            return value !== undefined && isInt32(value) ? value : undefined;
        }
        case "Float": {
            const value = parseNumber(text);
            return value !== undefined && Number.isFinite(Math.fround(value)) ? value : undefined;
        }
        case "String":
            return text;
    }
}

/**
 * Infer the narrowest scalar type accepting every non-blank value: Boolean,
 * then Integer, then Float, falling back to String. All-blank columns are
 * Strings — there is no data to say otherwise.
 */
export function inferAttrType(values: readonly string[]): AttrTypeName {
    const present = values.filter((value) => !isBlank(value));
    if (present.length === 0) {
        return "String";
    }
    for (const type of ["Boolean", "Integer", "Float"] as const) {
        if (present.every((value) => parseCellValue(value, type) !== undefined)) {
            return type;
        }
    }
    return "String";
}

/** How many of a column's values a type override would leave unset. */
export const countUnparseable = (values: readonly string[], type: AttrTypeName): number =>
    values.filter((value) => !cellParsesAs(value, type)).length;

const cellAt = (data: SheetData, row: number, column: number): string => data[row]?.[column] ?? "";

const rowHasContent = (data: SheetData, row: number, range: SheetColumnRange): boolean => {
    for (let column = range.start; column <= range.end; column++) {
        if (!isBlank(cellAt(data, row, column))) {
            return true;
        }
    }
    return false;
};

/** Spreadsheet-style letters for a 0-based column index: A, B, …, Z, AA, … */
export function columnLetters(index: number): string {
    let letters = "";
    let remaining = index;
    do {
        letters = String.fromCharCode(65 + (remaining % 26)) + letters;
        remaining = Math.floor(remaining / 26) - 1;
    } while (remaining >= 0);
    return letters;
}

/**
 * Plan a table from the selected sheet columns. Every row with content in the
 * selection contributes a data row; fully blank rows are skipped. Columns are
 * named by their explicit header titles, falling back to the sheet letters
 * shown in the header. Each column's proposed type is its explicit tag when
 * one is set, and is otherwise inferred from its data.
 */
export function planTableFromColumns(
    data: SheetData,
    range: SheetColumnRange,
    types?: SheetColumnTypes,
    titles?: SheetColumnTitles,
): SheetTablePlan {
    const dataRowIndexes: number[] = [];
    for (let row = 0; row < data.length; row++) {
        if (rowHasContent(data, row, range)) {
            dataRowIndexes.push(row);
        }
    }

    const rows = dataRowIndexes.map((row) => {
        const values: string[] = [];
        for (let column = range.start; column <= range.end; column++) {
            values.push(cellAt(data, row, column));
        }
        return values;
    });

    const columns: SheetColumnPlan[] = [];
    for (let column = range.start; column <= range.end; column++) {
        const index = column - range.start;
        const title = (titles?.[column] ?? "").trim();
        const values = rows.map((row) => row[index] ?? "");
        columns.push({
            sheetColumn: column,
            name: title || columnLetters(column),
            proposedType: types?.[column] ?? inferAttrType(values),
            values,
        });
    }

    return { entityName: "Table", columns, rows };
}

/** The sheet with the given column range removed from every row. */
export function removeColumns(data: SheetData, range: SheetColumnRange): SheetData {
    const width = range.end - range.start + 1;
    return data.map((row) => {
        const next = [...row];
        next.splice(range.start, width);
        return next;
    });
}

/**
 * Column-aligned metadata (type tags, titles) with the given range removed.
 */
export function removeColumnEntries<T>(entries: Array<T | null>, range: SheetColumnRange) {
    const next = [...entries];
    next.splice(range.start, range.end - range.start + 1);
    return next;
}

/**
 * Column-aligned metadata with `count` empty entries inserted at `index`, so
 * the existing entries stay with their columns.
 */
export function insertColumnEntries<T>(entries: Array<T | null>, index: number, count: number) {
    if (index >= entries.length) {
        // Trailing columns are implicitly empty; nothing to shift.
        return entries;
    }
    const next = [...entries];
    next.splice(index, 0, ...Array.from({ length: count }, (): T | null => null));
    return next;
}

/** Column-aligned metadata with one entry set (or cleared with `null`). */
export function setColumnEntry<T>(entries: Array<T | null>, index: number, value: T | null) {
    const next = [...entries];
    while (next.length <= index) {
        next.push(null);
    }
    next[index] = value;
    return trimColumnEntries(next);
}

/** Drop trailing empty entries so the persisted lists stay short. */
export function trimColumnEntries<T>(entries: Array<T | null>): Array<T | null> {
    let end = entries.length;
    while (end > 0 && entries[end - 1] === null) {
        end -= 1;
    }
    return entries.slice(0, end);
}

/** Drop trailing all-blank rows, and trailing blank cells from every row. */
export function trimSheetData(data: SheetData): SheetData {
    const trimmedRows = data.map((row) => {
        let end = row.length;
        while (end > 0 && isBlank(row[end - 1] ?? "")) {
            end -= 1;
        }
        return row.slice(0, end);
    });
    let end = trimmedRows.length;
    while (end > 0 && (trimmedRows[end - 1]?.length ?? 0) === 0) {
        end -= 1;
    }
    return trimmedRows.slice(0, end);
}

const ATTR_TYPE_SET: ReadonlySet<string> = new Set(["String", "Boolean", "Integer", "Float"]);

const sanitizeCells = (parsed: unknown[]): SheetData =>
    parsed.map((row) =>
        Array.isArray(row) ? row.map((cell) => (typeof cell === "string" ? cell : "")) : [],
    );

/**
 * Parse the persisted sheet, or `undefined` when absent or malformed. Reads
 * the current `{ cells, types, titles }` shape as well as the earlier shapes:
 * `{ cells, types }` and the legacy bare cell array.
 */
export function parsePersistedSheet(raw: string | null): PersistedSheet | undefined {
    if (!raw) {
        return undefined;
    }
    try {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            return { cells: sanitizeCells(parsed), types: [], titles: [] };
        }
        if (typeof parsed !== "object" || parsed === null) {
            return undefined;
        }
        const { cells, types, titles } = parsed as {
            cells?: unknown;
            types?: unknown;
            titles?: unknown;
        };
        if (!Array.isArray(cells)) {
            return undefined;
        }
        return {
            cells: sanitizeCells(cells),
            types: Array.isArray(types)
                ? types.map((type) =>
                      typeof type === "string" &&
                      (ATTR_TYPE_SET.has(type) || type.startsWith("link:"))
                          ? (type as SheetColumnTag)
                          : null,
                  )
                : [],
            titles: Array.isArray(titles)
                ? titles.map((title) =>
                      typeof title === "string" && title.trim() !== "" ? title : null,
                  )
                : [],
        };
    } catch {
        return undefined;
    }
}
