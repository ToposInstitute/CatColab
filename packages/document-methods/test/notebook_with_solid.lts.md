A notebook can be placed in a SolidJS store so its state can be consumed reactively.

<!-- verifier:prepend-to-following -->
```ts
import { createRenderEffect, createRoot } from "solid-js";
import { createStore } from "solid-js/store";
import { SimpleOlog } from "catcolab-logics";
import { ModelNotebook } from "catcolab-document-methods/future";
```

We create a notebook and wrap it in a store.

<!-- verifier:prepend-to-following -->
```ts
const notebook = ModelNotebook.create(SimpleOlog, { name: "An Olog" });
const [store, _setStore] = createStore(notebook);
```

Reads of `store` are reactive, while mutations flow through the notebook API.

<!-- #solid-store-read -->
```ts
createRoot(() => {
    createRenderEffect(() => {
        console.log("notebook name:", store.name);
    });

    notebook.update({ name: "A simple Olog example" });
    console.log("after update:", store.name);
});
```

<!-- #solid-store-read-output -->
```
notebook name: An Olog
after update: A simple Olog example
```
