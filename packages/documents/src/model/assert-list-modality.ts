import type { Modality } from "catcolab-document-types";
import type { ListModality } from "../shape";
import { assertExhaustive } from "../util/assert_exhaustive";

export function assertListModality(modality: Modality): asserts modality is ListModality {
    switch (modality) {
        case "List":
        case "SymmetricList":
        case "CocartesianList":
        case "CartesianList":
        case "AdditiveList":
            return;
        case "Discrete":
        case "Codiscrete":
            // These are not used and will likely be removed.
            throw new Error(`Unsupported morphism endpoint modality: ${modality}.`);
        default:
            return assertExhaustive(modality);
    }
}
