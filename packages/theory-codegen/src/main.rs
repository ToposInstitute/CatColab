//! Generates TypeScript theory "shape" definitions for `catcolab-document-methods`
//! from the Rust theory definitions in [`catlog`].
//!
//! Each generated file declares a shape with [`defineShape`] over the object and
//! morphism types of a discrete double theory. Object/morphism *structure* and
//! every morphism's *endpoints* are read from the `catlog` theory (the source of
//! truth); the human-readable keys, the document-theory id, the core-theory Wasm
//! class and the migrations come from the [`TheoryGen`] metadata table below.
//!
//! Run with: `cargo run -p theory-codegen`.
//!
//! Scope: discrete double theories only. Modal/tabulator theories (e.g. Petri
//! nets) are not enumerable through the public API yet and stay hand-authored.

use std::fs;
use std::path::PathBuf;

use catlog::dbl::theory::DiscreteDblTheory;
use catlog::one::category::FgCategory;
use catlog::stdlib::theories;
use catlog::zero::{NameSegment, QualifiedName};

/// A display key paired with the underlying `catlog` generator id.
struct TypeName {
    /// Identifier of the generator in the `catlog` theory (the `MorType`/`ObType`
    /// `content`).
    id: &'static str,
    /// The key the type is exposed under in the generated shape.
    key: &'static str,
}

/// A pushforward migration to another document theory.
struct Migration {
    /// Document-theory id migrated into.
    target: &'static str,
    /// Wasm expression performing the migration, e.g. `ThCategory.toSchema`.
    migrate: &'static str,
}

/// Metadata describing how to generate one theory's shape file.
struct TheoryGen {
    /// Document-theory id, e.g. `"simple-schema"`.
    id: &'static str,
    /// Output file name, e.g. `"simple-schema.ts"`.
    file: &'static str,
    /// Exported shape constant, e.g. `"SimpleSchema"`.
    const_name: &'static str,
    /// Wasm class providing the core theory, e.g. `"ThSchema"`.
    core_class: &'static str,
    /// Builds the `catlog` theory to enumerate.
    build: fn() -> DiscreteDblTheory,
    /// Object types to expose, keyed by their generator id.
    objects: &'static [TypeName],
    /// `Hom` morphism types to expose, keyed by the *object* generator they are
    /// the hom over (a `Hom` type is implicit: one per object).
    homs: &'static [TypeName],
    /// `Basic` morphism types to expose, keyed by their generator id. Their
    /// endpoints are read from the theory.
    morphisms: &'static [TypeName],
    /// Migrations to other shapes.
    migrations: &'static [Migration],
}

/// The discrete theories whose shapes are generated. Modal/tabulator theories
/// are out of scope (not enumerable yet).
fn theories_to_generate() -> Vec<TheoryGen> {
    vec![
        TheoryGen {
            id: "simple-schema",
            file: "simple-schema.ts",
            const_name: "SimpleSchema",
            core_class: "ThSchema",
            build: theories::th_schema,
            objects: &[
                TypeName { id: "Entity", key: "Entity" },
                TypeName { id: "AttrType", key: "AttrType" },
            ],
            homs: &[TypeName { id: "Entity", key: "Mapping" }],
            morphisms: &[TypeName { id: "Attr", key: "Attr" }],
            migrations: &[],
        },
        TheoryGen {
            id: "simple-olog",
            file: "simple-olog.ts",
            const_name: "SimpleOlog",
            core_class: "ThCategory",
            build: theories::th_category,
            objects: &[TypeName { id: "Object", key: "Type" }],
            homs: &[TypeName { id: "Object", key: "Aspect" }],
            morphisms: &[],
            migrations: &[Migration {
                target: "simple-schema",
                migrate: "ThCategory.toSchema",
            }],
        },
    ]
}

/// Flattens a single-segment textual [`QualifiedName`] to a string. Panics on
/// qualified or UUID names, which discrete theory shapes do not use.
fn flatten(name: &QualifiedName) -> String {
    match name.only() {
        Some(NameSegment::Text(text)) => text.to_string(),
        _ => panic!("only singleton text names are supported, got: {name:?}"),
    }
}

/// Lowercases the first character of a key (`AttrType` -> `attrType`).
fn lower_first(s: &str) -> String {
    let mut chars = s.chars();
    match chars.next() {
        Some(first) => first.to_lowercase().collect::<String>() + chars.as_str(),
        None => String::new(),
    }
}

/// The local `const` variable name for an object type's literal.
fn ob_var(key: &str) -> String {
    format!("{}ObType", lower_first(key))
}

/// The local `const` variable name for a `Hom` morphism type's literal.
fn hom_var(key: &str) -> String {
    format!("{}MorType", lower_first(key))
}

/// A `Basic` morphism generator together with the endpoints read from the theory.
struct BasicMor {
    dom: String,
    cod: String,
}

fn generate(entry: &TheoryGen) -> String {
    let theory = (entry.build)();
    let cat = &theory.0;

    // Map an object generator id to its exposed key, panicking if the metadata
    // is incomplete.
    let ob_key = |id: &str| -> &'static str {
        entry
            .objects
            .iter()
            .find(|t| t.id == id)
            .unwrap_or_else(|| {
                panic!("theory '{}': object generator '{id}' has no metadata key", entry.id)
            })
            .key
    };

    // Verify every metadata object type is an actual generator of the theory.
    let actual_obs: Vec<String> = cat.ob_generators().map(|n| flatten(&n)).collect();
    for t in entry.objects {
        assert!(
            actual_obs.iter().any(|o| o == t.id),
            "theory '{}': metadata object '{}' is not an object generator",
            entry.id,
            t.id
        );
    }

    // Read every basic morphism generator's endpoints from the theory.
    let lookup_basic = |id: &str| -> BasicMor {
        let m = cat.mor_generators().find(|m| flatten(m) == id).unwrap_or_else(|| {
            panic!("theory '{}': metadata morphism '{id}' is not a morphism generator", entry.id)
        });
        BasicMor {
            dom: flatten(&cat.mor_generator_dom(&m)),
            cod: flatten(&cat.mor_generator_cod(&m)),
        }
    };

    // Collect the Wasm classes to import (core theory + migration classes).
    let mut classes: Vec<&str> = vec![entry.core_class];
    for mig in entry.migrations {
        let class = mig.migrate.split('.').next().unwrap_or(mig.migrate);
        if !classes.contains(&class) {
            classes.push(class);
        }
    }

    let mut out = String::new();

    out.push_str("// GENERATED by theory-codegen — do not edit.\n");
    out.push_str("// Regenerate with: cargo run -p theory-codegen\n\n");

    // Imports.
    out.push_str("import type { MorphismCell, ObjectCell } from \"catcolab-documents\";\n");
    if entry.morphisms.is_empty() {
        out.push_str("import { defineShape } from \"catcolab-documents\";\n\n");
    } else {
        out.push_str("import { basicMorphism, defineShape } from \"catcolab-documents\";\n\n");
    }
    out.push_str(&format!("import {{ {} }} from \"catlog-wasm\";\n\n", classes.join(", ")));

    // Object type literals.
    for t in entry.objects {
        out.push_str(&format!(
            "const {} = {{ tag: \"Basic\", content: \"{}\" }} as const;\n",
            ob_var(t.key),
            t.id
        ));
    }
    // Hom morphism type literals.
    for h in entry.homs {
        out.push_str(&format!(
            "const {} = {{ tag: \"Hom\", content: {} }} as const;\n",
            hom_var(h.key),
            ob_var(ob_key(h.id)),
        ));
    }
    out.push('\n');

    // The shape.
    out.push_str(&format!("export const {} = defineShape({{\n", entry.const_name));
    out.push_str(&format!("    theory: \"{}\",\n", entry.id));
    out.push_str(&format!("    coreTheory: new {}().theory(),\n", entry.core_class));
    out.push_str("    objects: {\n");
    for t in entry.objects {
        out.push_str(&format!("        {}: {},\n", t.key, ob_var(t.key)));
    }
    out.push_str("    },\n");
    out.push_str("    morphisms: {\n");
    for h in entry.homs {
        out.push_str(&format!("        {}: {},\n", h.key, hom_var(h.key)));
    }
    for m in entry.morphisms {
        let endpoints = lookup_basic(m.id);
        out.push_str(&format!(
            "        {}: basicMorphism(\"{}\", {}, {}),\n",
            m.key,
            m.id,
            ob_var(ob_key(&endpoints.dom)),
            ob_var(ob_key(&endpoints.cod)),
        ));
    }
    out.push_str("    },\n");
    if !entry.migrations.is_empty() {
        out.push_str("    migrations: [\n");
        for mig in entry.migrations {
            out.push_str("        {\n");
            out.push_str(&format!("            target: \"{}\",\n", mig.target));
            out.push_str(&format!("            migrate: {},\n", mig.migrate));
            out.push_str("        },\n");
        }
        out.push_str("    ],\n");
    }
    out.push_str("});\n\n");

    // Re-exports of the individual types.
    let ob_keys: Vec<&str> = entry.objects.iter().map(|t| t.key).collect();
    let mor_keys: Vec<&str> = entry
        .homs
        .iter()
        .map(|t| t.key)
        .chain(entry.morphisms.iter().map(|t| t.key))
        .collect();

    out.push_str(&format!(
        "export const {{ {} }} = {}.objects;\n",
        ob_keys.join(", "),
        entry.const_name
    ));
    out.push_str(&format!(
        "export const {{ {} }} = {}.morphisms;\n\n",
        mor_keys.join(", "),
        entry.const_name
    ));

    for key in &ob_keys {
        out.push_str(&format!("export type {key}Cell = ObjectCell<typeof {key}>;\n"));
    }
    for key in &mor_keys {
        out.push_str(&format!("export type {key}Cell = MorphismCell<typeof {key}>;\n"));
    }

    out
}

fn main() {
    let out_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../document-methods/test/literate-ts/catcolab-logics");

    for entry in theories_to_generate() {
        let contents = generate(&entry);
        let path = out_dir.join(entry.file);
        fs::write(&path, contents)
            .unwrap_or_else(|e| panic!("failed to write {}: {e}", path.display()));
        println!("generated {}", path.display());
    }
}
