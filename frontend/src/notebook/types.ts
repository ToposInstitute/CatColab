import { Newtype, iso } from "newtype-ts";
import { generateId } from "../util/id";

export type Notebook<T> = {
    cells: Cell<T>[];
}

export type Cell<T> = RichTextCell | FormalCell<T>;

export const newNotebook = <T>(): Notebook<T> => ({
    cells: [],
});

export type RichTextCell = {
    tag: "rich-text";
    id: CellId;
    content: string;
};

export const newRichTextCell = (): RichTextCell => ({
    tag: "rich-text",
    id: isoCellId.wrap(generateId()),
    content: "",
});

export type FormalCell<T> = {
    tag: "formal";
    id: CellId;
    content: T;
};

export const newFormalCell = <T>(content: T): FormalCell<T> => ({
    tag: "formal",
    id: isoCellId.wrap(generateId()),
    content: content,
});

export interface CellId
extends Newtype<{ readonly CellId: unique symbol }, string> {}

const isoCellId = iso<CellId>();
