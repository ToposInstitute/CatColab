import * as catlog from "catlog-wasm";

import { Theory } from "../../theory";
import type { TheoryMeta } from "../types";

export default function createEmptyTheory(theoryMeta: TheoryMeta): Theory {
    const thEmpty = new catlog.ThEmpty();

    return new Theory({
        ...theoryMeta,
        theory: thEmpty.theory(),
    });
}
