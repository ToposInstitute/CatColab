import * as catlog from "catlog-wasm";
import { Theory } from "../../theory";
import type { TheoryMeta } from "../types";

export function createTheory(meta: TheoryMeta): Theory {
  const thEmpty = new catlog.ThEmpty();
  return new Theory({
    ...meta,
    theory: thEmpty.theory(),
  });
}
// type TheoryMeta = {
//   id: string;
//   name: string;
//   description: string;
//   isDefault?: boolean;
//   group: string;
//   help?: string;
// };

