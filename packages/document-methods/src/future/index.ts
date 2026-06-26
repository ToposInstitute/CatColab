export { type ModelDocument, newModelDocument } from "../model";
export { type AnalysisDocument, newAnalysisDocument } from "./analysis";

export { plainStore, type DocumentStore } from "./store";
export { binder, createBinder, type Binder, type Notebook } from "./notebook";
export {
    CellKind,
    RichText,
    Instantiation,
    defineObject,
    defineMorphism,
    defineAnalysis,
    defineShape,
    type RichTextType,
    type InstantiationType,
    type ObjectDef,
    type ObjectCell,
    type EndpointOf,
    type Endpoints,
    type ModalityBrand,
    type MorEndpointMeta,
    type MorphismDef,
    type DomOf,
    type CodOf,
    type MorphismCell,
    type RichTextCell,
    type InstantiationSpecialization,
    type ValidatableNotebook,
    type InstantiationArgs,
    type InstantiationCell,
    type NotebookCell,
    type ModelMigration,
    type Shape,
    type ModelValidationResult,
    type AnalysisDef,
    type AnalysisCell,
    type AnalysisShape,
} from "./definitions";
