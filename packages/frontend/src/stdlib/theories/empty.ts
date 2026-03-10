import { ThEmpty } from "catlog-wasm";
import { Theory, type TheoryMeta } from "../../theory";
import * as analyses from "../analyses";

export default function createEmptyTheory(theoryMeta: TheoryMeta): Theory {
    const thEmpty = new ThEmpty();

    return new Theory({
        ...theoryMeta,
        theory: thEmpty.theory(),
        modelAnalyses: [analyses.compositionPattern()],
    });
}
