import { Aspect, SimpleOlog, Type } from "catcolab-logics/simple-olog";
import { describe, test } from "vitest";

import type { Document } from "catcolab-document-types";
import { createBinder, type Notebook } from "catcolab-documents";

type InstanceDocument = Extract<Document, { type: "instance" }>;

describe("creating and editing notebooks (type level)", () => {
    test("instance documents cannot back notebooks", () => {
        // @ts-expect-error Instance documents contain tables rather than notebooks.
        const notebook = null as unknown as Notebook<typeof SimpleOlog, InstanceDocument>;
        void notebook;
    });

    test("invalid shapes are type errors in a simple olog", async () => {
        const binder = createBinder();
        const notebook = await binder.createNotebook(SimpleOlog, { title: "An Olog" });

        const source = notebook.add(Type, { label: "A" });
        const target = notebook.add(Type, { label: "B" });
        const arrow = notebook.add(Aspect, { label: "has", from: source, to: target });

        // @ts-expect-error Arrays are not valid endpoints in a simple olog.
        arrow.update({ from: [source] });

        // @ts-expect-error Arrays are not valid endpoints in a simple olog.
        notebook.add(Aspect, { label: "bad", from: [source, target], to: target });
        // @ts-expect-error Missing required fields.
        notebook.add(Aspect, {});
        // null fields are allowed.
        notebook.add(Aspect, { label: null, from: null, to: null });
    });
});
