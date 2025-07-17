import type { Ob, ObType } from "catlog-wasm";

/** Props passed to any object input component. */
export type ObInputProps = {
    /** Current value of object, if any. */
    ob: Ob | null;

    /** Handler to set a new value of the object. */
    setOb: (ob: Ob | null) => void;

    /** Type of object being edited. */
    obType: ObType;
};
