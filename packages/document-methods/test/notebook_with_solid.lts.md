A notebook can be placed in a SolidJS store so its state can be consumed reactively.

<!-- verifier:prepend-to-following -->

```ts
import { createEffect, createRoot } from "solid-js";
import { createStore } from "solid-js/store";
import { SimpleOlog } from "catcolab-logics";
import { ModelNotebook } from "catcolab-document-methods/future";

const notebook = ModelNotebook.create(SimpleOlog, { name: "An Olog" });
const [store, setStore] = createStore(notebook);
notebook.bind(setStore);
```

Reads of `store` are reactive.

<!-- #solid-store-read -->

```ts
createRoot(async () => {
    createEffect(() => {
        console.log("notebook name:", store.name);
    });

    notebook.update({ name: "An updated Olog" });
    await new Promise((r) => setTimeout(r, 100));

    setStore("name", "An updated Olog (via store)");
    await new Promise((r) => setTimeout(r, 100));
});
```

<!-- #solid-store-read-output -->

```
notebook name: An updated Olog
notebook name: An updated Olog (via store)
```
