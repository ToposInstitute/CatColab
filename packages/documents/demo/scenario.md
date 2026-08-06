# Schema Change Scenarios

This document captures three schema-change scenarios for future interaction
prototyping. They focus on changes that require instance data to be migrated,
not just changes to how the schema is displayed.

## Shared workflow

Schema changes should use a **review before apply** workflow:

1. The user proposes a new attribute type, mapping codomain, or attribute domain.
2. The system analyzes the current instance data.
3. A **Review schema change** dialog summarizes the proposed change and its impact.
4. The system applies safe migrations automatically and asks the user to resolve
   ambiguous or incompatible values.
5. The dialog previews the resulting schema and instance data.
6. The user either cancels or applies the schema and data changes together.

The review should consistently show:

- The current and proposed schema declarations.
- The number of affected rows.
- Values that can be migrated automatically.
- Values that require a decision.
- A preview of representative before-and-after values.
- **Cancel** and **Apply change** actions.

Applying a reviewed change should be atomic and produce one undoable history
operation.

## 1. Change an attribute type

### Proposed change

Change the `temperature` attribute on `Planet` from `Float` to `Integer`:

```text
Planet --temperature--> Float
Planet --temperature--> Integer
```

### Data challenge

Some temperatures are already whole numbers, while others contain fractional
values. Whole numbers can be retained, but fractional values cannot be represented
as integers without a conversion decision.

### Review interaction

The review groups values into:

- Values that are already valid integers.
- Fractional values that require conversion.
- Empty values that remain empty.

The user chooses a migration rule for incompatible values:

- Round to the nearest integer.
- Truncate the fractional part.
- Clear incompatible values.
- Cancel the schema change.

The preview shows examples such as `14.9 -> 15` before the change is applied. The
summary reports how many values will be retained, converted, or cleared.

### Expected outcome

The attribute becomes integer-valued and every retained value conforms to the new
type. The table rebuilds with an integer editor, and the schema change and value
conversions can be undone together.

## 2. Redirect a mapping

### Proposed change

Change the codomain of the `orbits` mapping on `Moon` from `Planet` to `Star`:

```text
Moon --orbits--> Planet
Moon --orbits--> Star
```

### Data challenge

Existing mapping values reference planet rows and cannot be reused as star
references. The system can suggest replacements by following the existing
relationship `Planet <- Orbit -> Star`.

A planet can have no known star, one star, or multiple stars. This creates three
migration cases:

- One candidate star: migrate the reference automatically.
- Multiple candidate stars: require the user to select one.
- No candidate star: require the user to select a star or clear the reference.

The prototype data should include at least one example of each case so all states
can be evaluated.

### Review interaction

The review shows each affected moon with its current planet and proposed star.
Automatically resolved rows are visually distinct from rows requiring attention.
For ambiguous rows, the user selects from the candidate stars. For unresolved
rows, the user can select any star or choose **None**.

The change cannot be applied while a required decision remains unresolved. The
summary reports how many references will be migrated, manually reassigned, or
cleared.

### Expected outcome

The mapping points to `Star`, and every retained reference targets a row in the
`Star` table. No stale planet references remain hidden behind invalid cells. The
schema and reference migrations can be undone together.

## 3. Move an attribute between entities

### Proposed change

Change the domain of `host-role` from `Orbit` to `Star`:

```text
Orbit --host-role--> String
Star  --host-role--> String
```

### Data challenge

Moving the attribute transfers values from orbit rows to star rows. Multiple
orbit rows can reference the same star, so several source values may compete for
one destination cell.

The migration groups orbit rows by their referenced star:

- No source value: leave the star value empty.
- One distinct source value: migrate it automatically.
- Repeated identical values: collapse them into one value.
- Conflicting values: require a decision.

This change may also reveal a modeling problem. A host role such as `primary` or
`secondary` describes a star's role relative to a particular planet, not an
intrinsic property of the star. Moving it to `Star` loses that context.

### Review interaction

The review begins with a semantic warning explaining the loss of planet-star
context. It then shows each destination star, the contributing orbit rows, and
the values found on those rows.

For each conflict, the user can:

- Select one source value.
- Enter a replacement value.
- Clear the destination value.
- Cancel the schema change.

The preview makes discarded source values explicit rather than presenting the
migration as lossless. The design should leave room for the system to recommend
keeping the attribute on `Orbit` when the data demonstrates that the proposed
domain is inappropriate.

### Expected outcome

If the user proceeds, `host-role` appears as a column on `Star` and no longer
appears on `Orbit`. Every destination value reflects an explicit automatic or
manual resolution. If the user cancels, neither the schema nor the instance data
changes.

## Planning questions

- Should conversion and conflict rules apply globally, per row, or support both?
- Should clearing a value be allowed for every migration, or only for optional
  attributes and mappings?
- How should the review communicate values that will be discarded?
- Should semantic warnings merely inform the user, or be able to block a change?
- How should queries and scripts affected by a schema change be surfaced?
