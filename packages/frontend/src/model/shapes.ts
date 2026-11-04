import { CausalLoop } from "catcolab-logics/causal-loop";
import { CausalLoopDelays } from "catcolab-logics/causal-loop-delays";
import { Empty } from "catcolab-logics/empty";
import { IndeterminateCausalLoop } from "catcolab-logics/indeterminate-causal-loop";
import { PetriNet } from "catcolab-logics/petri-net";
import { PolynomialODE } from "catcolab-logics/polynomial-ode";
import { PowerSystem } from "catcolab-logics/power-system";
import { RegNet } from "catcolab-logics/reg-net";
import { SignedPolynomialODE } from "catcolab-logics/signed-polynomial-ode";
import { SimpleOlog } from "catcolab-logics/simple-olog";
import { SimpleSchema } from "catcolab-logics/simple-schema";
import { UnaryDEC } from "catcolab-logics/unary-dec";

/**
 * Which theories the frontend can load through a document binder, and the
 * shapes it uses to load them.
 */
import type { ModelDocument, Notebook, Shape } from "catcolab-documents";
import type { ApiDocumentHandle, ApiDocumentVersion } from "../api";

/** Shapes of model notebooks that can be loaded through a document binder. */
export const notebookShapes = [
    Empty,
    SimpleOlog,
    SimpleSchema,
    PetriNet,
    PolynomialODE,
    SignedPolynomialODE,
    CausalLoop,
    CausalLoopDelays,
    IndeterminateCausalLoop,
    RegNet,
    UnaryDEC,
    PowerSystem,
] as const;

type NotebookShape = (typeof notebookShapes)[number];

/** A model notebook loaded through a frontend document binder. */
export type ApiNotebook = Notebook<
    NotebookShape,
    ModelDocument,
    ApiDocumentHandle,
    ApiDocumentVersion
>;

/** Shapes whose models can have data instances. */
export const instanceShapes = [SimpleOlog, SimpleSchema] as const;

/** Look up the shape for a theory among the given shapes, if any. */
export function shapeForTheory<ShapeType extends Shape & { theory: string }>(
    shapes: ReadonlyArray<ShapeType>,
    theory?: string,
): ShapeType | undefined {
    return shapes.find((shape) => shape.theory === theory);
}
