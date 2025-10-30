import { type MorType, MorTypeIndex, type ObType, ObTypeIndex } from "catlog-wasm";

/** Map with object types as keys. */
export class ObTypeMap<V> {
    private readonly index: ObTypeIndex;
    private readonly values: Array<V>;

    constructor() {
        this.index = new ObTypeIndex();
        this.values = [];
    }

    get(obType: ObType): V | undefined {
        const i = this.index.get(obType);
        if (i !== undefined) {
            return this.values[i];
        }
    }

    set(obType: ObType, value: V) {
        if (this.index.has(obType)) {
            throw new Error(`Object type is already set: ${obType}`);
        }
        this.index.set(obType, this.values.length);
        this.values.push(value);
    }
}

/** Map with morphism types as keys. */
export class MorTypeMap<V> {
    private readonly index: MorTypeIndex;
    private readonly values: Array<V>;

    constructor() {
        this.index = new MorTypeIndex();
        this.values = [];
    }

    get(morType: MorType): V | undefined {
        const i = this.index.get(morType);
        if (i !== undefined) {
            return this.values[i];
        }
    }

    set(morType: MorType, value: V) {
        if (this.index.has(morType)) {
            throw new Error(`Morphism type is already set: ${morType}`);
        }
        this.index.set(morType, this.values.length);
        this.values.push(value);
    }
}
