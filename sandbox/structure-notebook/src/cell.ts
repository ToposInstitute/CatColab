import { Newtype, iso } from "newtype-ts";
import { generateId } from "./id";

export interface CellId
  extends Newtype<{ readonly CellId: unique symbol }, string> {}

const isoCellId = iso<CellId>();

export type Cell<T> = {
  id: CellId;
  content: T;
};

export function newCell<T>(content: T): Cell<T> {
  return {
    id: isoCellId.wrap(generateId()),
    content,
  };
}
