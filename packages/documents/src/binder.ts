import { Model } from "catcolab-document-methods";
import type { DocumentStore } from "./document-store";
import { createInMemoryStore } from "./document-store/in-memory";
import type { ModelDocument } from "./model/document";
import { modelNotebookFromStore, type Notebook } from "./model/notebook";
import type { Shape } from "./shape";

export interface Binder {
    createNotebook<S extends Shape & { readonly theory: string }>(
        shape: S,
        options: { title: string },
    ): Promise<Notebook<S, ModelDocument>>;
}

/* The following two functions cannot be refined to overloads of a single
   function of the form `function foo<T>(opt?: T)`. The reason being is that
   this allows callers the nonsensical pattern foo<S>() for some concrete S and
   the implementation will have to ignore S. In general this pattern would be
   even worse, as the compiler would set T to unknown in `foo()`.
 */

export function createBinder(): Binder {
    return createBinderWithStore(createInMemoryStore());
}

export function createBinderWithStore<Handle>(store: DocumentStore<Handle>): Binder {
    return {
        async createNotebook<S extends Shape & { readonly theory: string }>(
            shape: S,
            options: { title: string },
        ) {
            const document = Model.newModelDocument({
                theory: shape.theory,
            });
            document.name = options.title;

            const handle = await store.createHandle(document);

            return modelNotebookFromStore(shape, store, handle);
        },
    };
}
