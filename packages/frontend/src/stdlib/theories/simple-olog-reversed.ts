import { lazy } from "solid-js";
import { ThCategory } from "catlog-wasm";
import { Theory, type TheoryMeta } from "../../theory";
import {
    ologDiagramAnalyses,
    ologInstanceTypes,
    ologModelAnalyses,
    ologMorTypeMeta,
    ologObTypeMeta,
} from "./simple-olog";

const ReversedMorphismCellEditor = lazy(
    () => import("../../model/reversed_morphism_cell_editor"),
);

export default function createOlogReversedTheory(theoryMeta: TheoryMeta): Theory {
    const thCategory = new ThCategory();

    return new Theory({
        ...theoryMeta,
        theory: thCategory.theory(),
        inclusions: ["simple-olog"],
        pushforwards: [
            {
                target: "simple-schema",
                migrate: ThCategory.toSchema,
            },
        ],
        modelTypes: [
            ologObTypeMeta,
            { ...ologMorTypeMeta, editor: ReversedMorphismCellEditor },
        ],
        instanceTypes: ologInstanceTypes,
        modelAnalyses: ologModelAnalyses(),
        diagramAnalyses: ologDiagramAnalyses(),
    });
}
