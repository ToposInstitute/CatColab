export type * from "../dist/pkg-node/document_types";

import { Cell } from "../dist/pkg-node/document_types";

/** A cell containing custom data, usually a formal object. */
export type FormalCell<T> = Cell<T> & { tag: "formal" };

/** A cell containing rich text. */
export type RichTextCell = Cell<unknown> & { tag: "rich-text" };

/** A stem cell is a placeholder which will be converted into another cell.

Stem cells are created when the user opens the "new cell" menu and are destroyed
and replaced when a type for the new cell is selected.
 */
export type StemCell = Cell<unknown> & { tag: "stem" };
