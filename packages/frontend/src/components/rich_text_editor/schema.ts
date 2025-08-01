import type { DocHandle, Prop } from "@automerge/automerge-repo";
import { type MappedSchemaSpec, SchemaAdapter, init } from "@automerge/prosemirror";
import type { Node, Schema } from "prosemirror-model";
import type { Plugin } from "prosemirror-state";
import { basicSchema } from "./basic_schema";
import { catcolabSchema } from "./catcolab_schema";
import { katexSchema } from "./katex_schema";

// Typically all nodes and marks on a prosemirror schema are optionally undefined. This is quite annoying
// because our schema is defined as a constant and there is nothing at all dynamic about it. We do some
// cleverish typescript with the `satisfies` operator to make our schema type accurately reflect the
// contents of the const that defines it. This allows us to avoid doing tedious checks or assertions
// wherever we use the schema.
const customSchemaSpec = {
    nodes: {
        ...basicSchema.nodes,
        ...catcolabSchema.nodes,
        ...katexSchema.nodes,
    },
    marks: {
        ...basicSchema.marks,
    },
} satisfies MappedSchemaSpec;

type NodeNames = keyof typeof customSchemaSpec.nodes;
//type MarkNames = keyof NonNullable<typeof customSchemaSpec.marks>;
type MarkNames = string;

export type CustomSchema = Schema<NodeNames, MarkNames>;

export function proseMirrorAutomergeInit(
    handle: DocHandle<unknown>,
    path: Prop[],
): {
    schema: CustomSchema;
    pmDoc: Node;
    automergePlugin: Plugin;
} {
    const { schema, pmDoc, plugin } = init(handle, path, {
        schemaAdapter: new SchemaAdapter(customSchemaSpec),
    });

    return {
        schema: schema as CustomSchema,
        pmDoc,
        automergePlugin: plugin,
    };
}
