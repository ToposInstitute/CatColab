import { Cell } from "./cell";

export type Notebook<T> = {
  name: string;
  cells: Cell<T>[];
};
