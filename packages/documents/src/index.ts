export { parseInstanceData } from "./instance/data";
export { parseNotebookData } from "./model/data";
export { parseInstanceStructure } from "./instance/parse-structure";
export { parseModelNotebookStructure } from "./model/parse-structure";
export { createBinder } from "./binder";
export { CellKind } from "./model/cell";
export type { Binder } from "./binder";
export type {
    DocumentChange,
    DocumentRef,
    DocumentStore,
    HandlesByLinkType,
} from "./document-store";

export type { DeepReadonly } from "./util/deep-readonly";
export type { Issue, PathSegment, Result } from "./result";
export { documentLinks, emptyHandlesByLinkType, getDocumentSnapshot } from "./document-store";
export { createInMemoryStore } from "./document-store/in-memory";
export type { InstanceData, TableData, RowData, FieldValueData } from "./instance/data";
export type { WithIssues, StructuralIssue, StructurallyValid } from "./document/parse-structure";
export { atomicTypeOfAttributeType } from "./instance/validation";
export type {
    FieldPath,
    OrphanedTableIssue,
    EquationViolationIssue,
    MalformedDocumentIssue,
    TableFieldIssue,
    TableIssue,
} from "./instance/errors";
export { instanceFromStore } from "./instance/document";
export type { Instance, InstanceDocument, InstanceValidation } from "./instance/document";
export { llmConversationFromStore } from "./llm-conversation";
export type { LLMConversation, LLMConversationDocument } from "./llm-conversation";
export type {
    FieldValue,
    InstancePath,
    InstanceTable,
    LiteralType,
    LiteralValue,
    TableHeader,
    TableRow,
} from "./instance/tables";
export { shapeHasCell } from "./model/data";
export type {
    CellPatchOf,
    CellRef,
    EquationCellPatch,
    MorphismCellPatch,
    ObjectCellPatch,
    RichTextCellPatch,
} from "./model/update";
export type {
    CellData,
    CellData as NotebookCell,
    EquationCellData,
    EquationSideData,
    MorphismCellData,
    ModelNotebookData,
    ObjectCellData,
    RichTextCellData,
} from "./model/data";
export type { ModelDocument } from "./model/document";
export { modelNotebookFromStore, cellMatchesFilter } from "./model/document";
export type { AddedCellOf, Notebook } from "./model/document";
export type {
    JudgmentOf,
    MorphismJudgment,
    ObjectJudgment,
    ElaboratedModel,
    ModelValidation,
    EquationJudgment,
    EquationJudgmentSide,
} from "./model/elaborated-model";
export type { NotebookDocument } from "./model/notebook-document";
export {
    defineMorphism,
    defineObject,
    defineShape,
    findObjectType,
    findMorphismType,
    PathEquation,
    RichText,
} from "./shape";
export type {
    EquationType,
    InstanceCapableShape,
    MorphismEndpoint,
    MorphismEndpoints,
    MorphismType,
    ObjectType,
    Shape,
} from "./shape";
export type { Commit, Transaction } from "./transaction";
export type { SupportedDocument } from "./supported-document";
