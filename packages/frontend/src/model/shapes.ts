import { PetriNet } from "catcolab-logics/petri-net";
import { SimpleOlog } from "catcolab-logics/simple-olog";
import { SimpleSchema } from "catcolab-logics/simple-schema";

/**
 * Which theories the frontend can load through a document binder, and the
 * shapes it uses to load them.
 */
import type { ModelDocument, Notebook, Shape } from "catcolab-documents";
import type { ApiDocumentHandle } from "../api";

/** Shapes of model notebooks that can be loaded through a document binder. */
export const notebookShapes = [SimpleOlog, SimpleSchema, PetriNet] as const;

type NotebookShape = (typeof notebookShapes)[number];

/** A model notebook loaded through a frontend document binder. */
export type ApiNotebook = Notebook<NotebookShape, ModelDocument, ApiDocumentHandle>;

/** Shapes whose models can have data instances. */
export const instanceShapes = [SimpleOlog, SimpleSchema] as const;

/** Look up the shape for a theory among the given shapes, if any. */
export function shapeForTheory<ShapeType extends Shape & { theory: string }>(
    shapes: ReadonlyArray<ShapeType>,
    theory?: string,
): ShapeType | undefined {
    return shapes.find((shape) => shape.theory === theory);
}
