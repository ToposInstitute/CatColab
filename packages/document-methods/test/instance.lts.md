Our schema

```ts
import { binder } from "catcolab-documents";
import { SimpleSchema, Mapping, Attr } from "catcolab-logics/simple-schema";

const schema = binder.createNotebook(SimpleSchema, { name: "Company schema" });
const person = schema.add(Entity, { name: "Person" });
const company = schema.add(Entity, { name: "Company" });
const str = schema.add(AttrType, { name: "String" });

const employer = schema.add(Mapping, { name: "employer", from: person, to: company });
const name = schema.add(Attr, { name: "name", from: person, to: str });
```

A diagram

```ts
const diagram = binder.createNotebook(SimpleSchema.Diagram, {
    name: "Company diagram",
    model: schema,
});

const acme = diagram.add(SimpleSchema.Diagram.Individual, { over: company, name: "ACME Corp" });
const fred = diagram.add(SimpleSchema.Diagram.Individual, { over: person, name: "Fred" });
diagram.add(SimpleSchema.Diagram.Mapping, { over: employer, from: fred, to: acme });
```

An instance?

```ts
const instance = await binder.createInstance(schema, { name: "Company instance" });

const people = instance.tableOf(person);
const companies = instance.tableOf(company);

const acme = companies.addRow({});
people.addRow({ name: "Fred", employer: acme });
```

```ts
const instance = await binder.createInstance(schema, { name: "Company instance" });
const acme = instance.add(company, {});
instance.add(person, { name: "Fred", employer: acme });
```

Since that keeps the `add` method uniform, ignoring practical concerns `SimpleSchema` could then be an instance of itself or slightly more practically (though still not very practical) a `SuperSchema`.

```ts
const SimpleSchema = binder.createInstance(SuperSchema, { name: "simple-schema" });

const Entity = SimpleSchema.add(SuperEntity, { name: "Entity" });
const AttrType = SimpleSchema.add(SuperEntity, { name: "AttrType" });
const String = SimpleSchema.add(SuperAttrType, { name: "String" });

const Mapping = SimpleSchema.add(SuperEntity, { name: "Mapping" });
const mappingFrom = SimpleSchema.add(SuperMapping, { name: "from", from: Mapping, to: Entity });
const mappingTo = SimpleSchema.add(SuperMapping, { name: "to", from: Mapping, to: Entity });

const Attr = SimpleSchema.add(SuperEntity, { name: "Attr" });
const attrFrom = SimpleSchema.add(SuperAttr, { name: "from", from: Attr, to: Entity });
const attrTo = SimpleSchema.add(SuperAttr, { name: "from", from: Attr, to: AttrType });

const name = SimpleSchema.add(SuperAttr, { name: "name", from: Entity, to: String });
```

```ts
const schema = binder.createInstance(SimpleSchema, { name: "Company schema" });

const person = schema.add(Entity, { name: "Person" });
const company = schema.add(Entity, { name: "Company" });
const str = schema.add(AttrType, { name: "String" });

const employer = schema.add(Mapping, { name: "employer", from: person, to: company });
const name = schema.add(Attr, { name: "name", from: person, to: str });
```
