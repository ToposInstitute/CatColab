import { Place, Transition, PetriNet } from "catcolab-logics/petri-net";
import { createBinder, RichText } from "catcolab-documents";
import { describe, expect, test } from "vitest";

describe("The petri-net logic", () => {
    test("The shape can be used to create a notebook", async () => {
        const binder = createBinder();
        const notebook = await binder.createNotebook(PetriNet, { title: "Petri net" });
        expect(notebook.document.theory).toBe("petri-net");
    });

    test.skip("Places are basic objects and transitions are hom morphisms", async () => {
        const binder = createBinder();
        const notebook = await binder.createNotebook(PetriNet, { title: "Petri net for catalysis" });
        
        expect(Place.obType).toEqual({ tag: "Basic", content: "Object" });
        expect(Transition.morType).toEqual({ tag: "Hom", content: Place.obType });

        const reactant = notebook.add(Place, { label: "Reactant" });
        const product = notebook.add(Place, { label: "Product" });
        const catalyst = notebook.add(Place, { label: "Catalyst" });

        const reaction = notebook.add(Transition, {
            label: "Reaction",
            from: [reactant, catalyst],
            to: [product, catalyst]
        });

        expect(reactant.type.obType.content).toBe("Object");
        expect(product.type.obType.content).toBe("Object");
        expect(catalyst.type.obType.content).toBe("Object");
        
        expect(reaction.type.morType.tag).toBe("Hom");
    });

    test("The shape supports rich text", async () => {
        const binder = createBinder();
        const notebook = await binder.createNotebook(PetriNet, { title: "Petri net" });

        const note = notebook.add(RichText, { content: "Some rich-text content." });
        expect(note.content).toBe("Some rich-text content.");
    });

    test.skip("Notebooks validate in the core theory of Petri nets", async () => {
        const binder = createBinder();
        const notebook = await binder.createNotebook(PetriNet, { title: "Petri net for catalysis" });
        
        expect(Place.obType).toEqual({ tag: "Basic", content: "Object" });
        expect(Transition.morType).toEqual({ tag: "Hom", content: Place.obType });

        const reactant = notebook.add(Place, { label: "Reactant" });
        const product = notebook.add(Place, { label: "Product" });
        const catalyst = notebook.add(Place, { label: "Catalyst" });

        const reaction = notebook.add(Transition, {
            label: "Reaction",
            from: [reactant, catalyst],
            to: [product, catalyst]
        });

        const result = await notebook.validate();
        expect(result.tag).toBe("Ok");
        if (result.tag !== "Ok") {
            return;
        }
        expect(result.content.obGenerators().length).toBe(3);
        expect(result.content.morGenerators().length).toBe(1);
    });
});
