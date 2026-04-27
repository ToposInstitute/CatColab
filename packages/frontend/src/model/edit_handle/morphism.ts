import type { Accessor } from "solid-js";

import type { MorDecl, Ob, ObOp, ObType } from "catlog-wasm";
import type { Theory } from "../../theory";
import { removeProxyAndCopy } from "../../util/remove_proxy_and_copy";
import type { ValidatedModel } from "../model_library";
import { buildObList, extractObList, unwrapApp, wrapApp } from "./ob";

/** Callback to mutate a morphism declaration in place. */
type ModifyMorphism = (f: (mor: MorDecl) => void) => void;

/** Constructor arguments for a morphism edit handle.

All inputs are accessors so the handle stays reactive: reading any getter
re-reads the underlying props.
 */
export type MorphismEditHandleArgs = {
    /** Accessor for the theory the morphism belongs to. */
    theory: Accessor<Theory>;
    /** Accessor for the morphism declaration being edited. */
    morphism: Accessor<MorDecl>;
    /** Callback to mutate the morphism declaration in place. */
    modify: ModifyMorphism;
    /** Accessor for the current validated model, if any. */
    validated: Accessor<ValidatedModel | undefined>;
};

/** Common surface for any morphism edit handle, regardless of dom/cod shape. */
export abstract class BaseMorphismEditHandle {
    protected readonly theory: Accessor<Theory>;
    protected readonly morphism: Accessor<MorDecl>;
    protected readonly modify: ModifyMorphism;
    protected readonly validated: Accessor<ValidatedModel | undefined>;

    constructor(args: MorphismEditHandleArgs) {
        this.theory = args.theory;
        this.morphism = args.morphism;
        this.modify = args.modify;
        this.validated = args.validated;
    }

    protected get meta() {
        return this.theory().modelMorTypeMeta(this.morphism().morType);
    }

    protected get domApplyOp(): ObOp | undefined {
        return this.meta?.domain?.apply;
    }

    protected get codApplyOp(): ObOp | undefined {
        return this.meta?.codomain?.apply;
    }

    /** Type of the morphism's domain (after unwrapping any `applyOp`). */
    get domType(): ObType {
        const op = this.domApplyOp;
        return op === undefined
            ? this.theory().theory.src(this.morphism().morType)
            : this.theory().theory.dom(op);
    }

    /** Type of the morphism's codomain (after unwrapping any `applyOp`). */
    get codType(): ObType {
        const op = this.codApplyOp;
        return op === undefined
            ? this.theory().theory.tgt(this.morphism().morType)
            : this.theory().theory.dom(op);
    }

    /** The morphism's name. */
    get name(): string {
        return this.morphism().name;
    }

    /** Set the morphism's name. */
    setName = (name: string) => {
        this.modify((mor) => {
            mor.name = name;
        });
    };

    private errors() {
        const v = this.validated();
        if (v?.tag !== "Invalid") {
            return [];
        }
        return v.errors.filter((err) => err.content === this.morphism().id);
    }

    /** Whether the morphism's domain is invalid in the current validation. */
    get hasDomError(): boolean {
        return this.errors().some((err) => err.tag === "Dom" || err.tag === "DomType");
    }

    /** Whether the morphism's codomain is invalid in the current validation. */
    get hasCodError(): boolean {
        return this.errors().some((err) => err.tag === "Cod" || err.tag === "CodType");
    }
}

/** Handle for morphisms whose dom and cod are single objects.

The handle hides any `applyOp` wrapper specified by the theory: callers always
read and write the inner object.
 */
export class MorphismEditHandle extends BaseMorphismEditHandle {
    /** Read the domain object (with any `applyOp` wrapper stripped). */
    get dom(): Ob | null {
        const op = this.domApplyOp;
        return op ? unwrapApp(this.morphism().dom, op) : this.morphism().dom;
    }

    /** Read the codomain object (with any `applyOp` wrapper stripped). */
    get cod(): Ob | null {
        const op = this.codApplyOp;
        return op ? unwrapApp(this.morphism().cod, op) : this.morphism().cod;
    }

    /** Set the domain object (re-wrapping in `applyOp` if applicable). */
    setDom = (ob: Ob | null) => {
        const op = this.domApplyOp;
        const wrapped = ob && op ? wrapApp(ob, op) : ob;
        this.modify((mor) => {
            mor.dom = removeProxyAndCopy(wrapped);
        });
    };

    /** Set the codomain object (re-wrapping in `applyOp` if applicable). */
    setCod = (ob: Ob | null) => {
        const op = this.codApplyOp;
        const wrapped = ob && op ? wrapApp(ob, op) : ob;
        this.modify((mor) => {
            mor.cod = removeProxyAndCopy(wrapped);
        });
    };
}

/** Handle for morphisms whose dom and cod are lists of objects (`ModeApp`
list-modality types).

The handle hides the `ModeApp` list shape and any `applyOp` wrapper specified by
the theory; callers see and operate on a list of objects directly.
 */
export class MultiaryMorphismEditHandle extends BaseMorphismEditHandle {
    private readList(side: "dom" | "cod"): Array<Ob | null> {
        const op = side === "dom" ? this.domApplyOp : this.codApplyOp;
        const ob = side === "dom" ? this.morphism().dom : this.morphism().cod;
        return extractObList(op ? unwrapApp(ob, op) : ob);
    }

    private writeList(side: "dom" | "cod", objects: Array<Ob | null>) {
        const obType = side === "dom" ? this.domType : this.codType;
        const op = side === "dom" ? this.domApplyOp : this.codApplyOp;
        if (obType.tag !== "ModeApp") {
            return;
        }
        const built = buildObList(obType.content.modality, objects);
        const wrapped = op ? wrapApp(built, op) : built;
        this.modify((mor) => {
            const cloned = removeProxyAndCopy(wrapped);
            if (side === "dom") {
                mor.dom = cloned;
            } else {
                mor.cod = cloned;
            }
        });
    }

    private updateList(side: "dom" | "cod", f: (objects: Array<Ob | null>) => void) {
        const objects = removeProxyAndCopy(this.readList(side));
        f(objects);
        this.writeList(side, objects);
    }

    /** Read the domain as a list of objects. */
    get domList(): readonly (Ob | null)[] {
        return this.readList("dom");
    }

    /** Read the codomain as a list of objects. */
    get codList(): readonly (Ob | null)[] {
        return this.readList("cod");
    }

    /** Insert `ob` (or `null` for an empty placeholder) at index `i` in dom. */
    insertDom = (i: number, ob: Ob | null) =>
        this.updateList("dom", (objects) => objects.splice(i, 0, ob));

    /** Insert `ob` (or `null` for an empty placeholder) at index `i` in cod. */
    insertCod = (i: number, ob: Ob | null) =>
        this.updateList("cod", (objects) => objects.splice(i, 0, ob));

    /** Remove the entry at index `i` from dom. */
    removeDom = (i: number) => this.updateList("dom", (objects) => objects.splice(i, 1));

    /** Remove the entry at index `i` from cod. */
    removeCod = (i: number) => this.updateList("cod", (objects) => objects.splice(i, 1));

    /** Replace the entry at index `i` in dom. */
    setDomAt = (i: number, ob: Ob | null) =>
        this.updateList("dom", (objects) => {
            objects[i] = ob;
        });

    /** Replace the entry at index `i` in cod. */
    setCodAt = (i: number, ob: Ob | null) =>
        this.updateList("cod", (objects) => {
            objects[i] = ob;
        });
}
