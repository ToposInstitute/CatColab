import { defineShape, RichText } from "catcolab-documents";

export const Empty = defineShape({
    theory: "empty",
    getCoreTheory: async () => {
        const { ThEmpty } = await import("catlog-wasm");
        return new ThEmpty().theory();
    },
    objects: {},
    morphisms: {},
    informal: { RichText },
});
