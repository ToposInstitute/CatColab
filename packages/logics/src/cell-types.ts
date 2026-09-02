import type { EquationType, MorphismType, ObjectType } from "catcolab-documents";
import { RichText } from "catcolab-documents";
import { PetriNet, petriNetCellTypes } from "./petri-net";
import { SimpleOlog, simpleOlogCellTypes } from "./simple-olog";
import { SimpleSchema, simpleSchemaCellTypes } from "./simple-schema";

export type CellType = ObjectType | MorphismType | typeof RichText | EquationType;

export type CellTypeVocabulary = Readonly<Record<string, CellType>>;

const shapeCellTypes: ReadonlyArray<{ theory: string; cellTypes: CellTypeVocabulary }> = [
    { theory: SimpleOlog.theory!, cellTypes: simpleOlogCellTypes },
    { theory: SimpleSchema.theory!, cellTypes: simpleSchemaCellTypes },
    { theory: PetriNet.theory!, cellTypes: petriNetCellTypes },
];

export function cellTypesForTheory(theory?: string): CellTypeVocabulary | undefined {
    if (theory === undefined) {
        return undefined;
    }
    return shapeCellTypes.find((entry) => entry.theory === theory)?.cellTypes;
}
