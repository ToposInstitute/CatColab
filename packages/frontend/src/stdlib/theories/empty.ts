import { ThEmpty } from "catlog-wasm";

import { Theory } from "../../theory";
import type { TheoryMeta } from "../types";

export default function createEmptyTheory(theoryMeta: TheoryMeta): Theory {
    const thEmpty = new ThEmpty();

    return new Theory({
        ...theoryMeta,
        theory: thEmpty.theory(),
    });
}
