import * as catlog from "catlog-wasm";

import { Theory } from "../../theory";
import { TheoryMeta } from "../types";

export function createEmptyTheory(theoryMeta: TheoryMeta): Theory {
  const thEmpty = new catlog.ThEmpty();
  return new Theory({
    ...theoryMeta,
    theory: thEmpty.theory(),
  });
}
