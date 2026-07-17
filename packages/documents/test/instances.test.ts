import { Attr, AttrType, Entity, Mapping, SimpleSchema } from "catcolab-logics/simple-schema";
import { describe, expect, test } from "vitest";

// RFC-0006 "Tabular instances": an instance API that mirrors the notebook API,
// with `add` keyed by schema entities and a `rowsOf` that mirrors `cellsOf`.
// Unlike cells, rows keep a separate `values` field to keep them in their own
// namespace.
import { createBinder } from "catcolab-documents";

describe.skip("tabular instances", () => {
    test("an instance of a schema has a similar add method and rowsOf", async () => {
        const binder = createBinder();

        const schema = await binder.createNotebook(SimpleSchema, { title: "Company schema" });
        const person = schema.add(Entity, { label: "Person" });
        const company = schema.add(Entity, { label: "Company" });
        const str = schema.add(AttrType, { label: "String" });

        schema.add(Mapping, { label: "employer", from: person, to: company });
        schema.add(Attr, { label: "name", from: person, to: str });

        const instance = await binder.createInstance(schema, { title: "Company instance" });
        const acme = instance.add(company, {});
        instance.add(person, { name: "Alice", employer: acme });
        instance.add(person, { name: "Bob", employer: acme });

        const names: unknown[] = [];
        for (const row of instance.rowsOf(person)) {
            names.push(row.values["name"]);
        }
        expect(names).toEqual(["Alice", "Bob"]);
    });

    test("logic shapes can be defined as notebooks of SimpleSchema", async () => {
        const binder = createBinder();

        const CausalLoop = await binder.createNotebook(SimpleSchema, { title: "Causal loop" });

        const String = CausalLoop.add(AttrType, { label: "String" });

        const Variable = CausalLoop.add(Entity, { label: "Variable" });
        CausalLoop.add(Attr, { label: "name", from: Variable, to: String });

        const PositiveLink = CausalLoop.add(Entity, { label: "PositiveLink" });
        CausalLoop.add(Mapping, { label: "from", from: PositiveLink, to: Variable });
        CausalLoop.add(Mapping, { label: "to", from: PositiveLink, to: Variable });

        const NegativeLink = CausalLoop.add(Entity, { label: "NegativeLink" });
        CausalLoop.add(Mapping, { label: "from", from: NegativeLink, to: Variable });
        CausalLoop.add(Mapping, { label: "to", from: NegativeLink, to: Variable });

        // Instances of `CausalLoop` are akin to notebooks of the actual
        // `CausalLoop` logic.
        const predatorPrey = await binder.createInstance(CausalLoop, { title: "Predator-prey" });

        const foxes = predatorPrey.add(Variable, { name: "Foxes" });
        const rabbits = predatorPrey.add(Variable, { name: "Rabbits" });

        predatorPrey.add(PositiveLink, { from: rabbits, to: foxes });
        predatorPrey.add(NegativeLink, { from: foxes, to: rabbits });

        expect(predatorPrey.rowsOf(Variable).map((row) => row.values["name"])).toEqual([
            "Foxes",
            "Rabbits",
        ]);
        expect(predatorPrey.rowsOf(PositiveLink).length).toBe(1);
        expect(predatorPrey.rowsOf(NegativeLink).length).toBe(1);
    });
});
