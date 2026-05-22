<!-- verifier:tsconfig:jsx=1 -->
<!-- verifier:next-is-tsx -->
<!-- verifier:prepend-to-following -->

```ts
import { SimpleOlog } from "catcolab-logics";
import { ModelNotebook } from "catcolab-document-methods/future";

declare global {
    namespace JSX {
        interface IntrinsicElements {
            div: { children?: unknown };
        }
    }
}

const el = <div>Hello</div>;
```
