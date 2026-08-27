import type { Instance } from "./instance/instance";
import type { ModelDocument } from "./model/document";
import type { Notebook } from "./model/notebook";
import type { Shape } from "./shape";

/**
 * The kinds of document API objects that can be created through a `Binder` and
 * staged in a transaction.
 */
export type SupportedDocument<S extends Shape, H, V> =
    | Notebook<S, ModelDocument, H, V>
    | Instance<H, S, V>;
