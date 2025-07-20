import { Theory } from "../../theory";

export type TheoryMeta = {
  id: string;
  name: string;
  description: string;
  isDefault?: boolean;
  group: string;
  help?: string;
};

export type TheoryCreator = (meta: TheoryMeta) => Theory;