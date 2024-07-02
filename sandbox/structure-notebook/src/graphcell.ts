import { Newtype, iso } from "newtype-ts";
import { generateId } from "./id";

export interface VertexId
  extends Newtype<{ readonly VertexId: unique symbol }, string> {}

const isoVertexId = iso<VertexId>();

export interface EdgeId
  extends Newtype<{ readonly EdgeId: unique symbol }, string> {}

const isoEdgeId = iso<EdgeId>();

export type VertexCell = {
  tag: "vertex";
  id: VertexId;
  name: string;
};

export function newVertexCell(): VertexCell {
  return {
    tag: "vertex",
    id: isoVertexId.wrap(generateId()),
    name: "",
  };
}

export type EdgeCell = {
  tag: "edge";
  id: EdgeId;
  name: string;
  src: VertexId | null;
  tgt: VertexId | null;
};

export function newEdgeCell(): EdgeCell {
  return {
    tag: "edge",
    id: isoEdgeId.wrap(generateId()),
    name: "",
    src: null,
    tgt: null,
  };
}

export type GraphCell = VertexCell | EdgeCell;
