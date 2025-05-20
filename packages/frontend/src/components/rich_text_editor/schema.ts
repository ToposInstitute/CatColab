import { init, type MappedSchemaSpec, SchemaAdapter } from "@automerge/prosemirror";
import { basicSchema } from "./basic_schema";
import { catcolabSchema } from "./catcolab_schema";
import { katexSchema } from "./katex_schema";
import type { DocHandle, Prop } from "@automerge/automerge-repo";
import type { Plugin } from "prosemirror-state";
import type { Node, Schema } from "prosemirror-model";

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
type MarkNames = keyof NonNullable<typeof customSchemaSpec.marks>;

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
