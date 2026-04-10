#!/usr/bin/env -S uv run --script
#
# /// script
# requires-python = ">=3.13"
# dependencies = ["tree-sitter", "tree-sitter-rust"]
# ///

from __future__ import annotations
import argparse
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
import tree_sitter as ts
import tree_sitter_rust as tsrust

WRAPPERS: dict[str, list[int]] = {
    "Box": [0],
    "Vec": [0],
    "Option": [0],
    "Arc": [0],
    "Rc": [0],
    "Cell": [0],
    "RefCell": [0],
    "Mutex": [0],
    "RwLock": [0],
    "Pin": [0],
    "Cow": [0],
    "PhantomData": [0],
    "HashSet": [0],
    "BTreeSet": [0],
    "HashMap": [0, 1],
    "BTreeMap": [0, 1],
    "Result": [0, 1],
}
PRIMITIVES = frozenset(
    {
        "bool",
        "char",
        "str",
        "u8",
        "u16",
        "u32",
        "u64",
        "u128",
        "usize",
        "i8",
        "i16",
        "i32",
        "i64",
        "i128",
        "isize",
        "f32",
        "f64",
        "String",
        "Self",
        "()",
    }
)

STD_TRAITS = frozenset(
    {
        # fmt
        "Debug",
        "Display",
        # clone / copy
        "Clone",
        "Copy",
        # comparison
        "PartialEq",
        "Eq",
        "PartialOrd",
        "Ord",
        "Hash",
        # conversion
        "From",
        "Into",
        "TryFrom",
        "TryInto",
        "AsRef",
        "AsMut",
        # default
        "Default",
        # marker / auto traits
        "Send",
        "Sync",
        "Sized",
        "Unpin",
        # ops
        "Deref",
        "DerefMut",
        "Drop",
        "Add",
        "Sub",
        "Mul",
        "Div",
        "Neg",
        "Not",
        "Index",
        "IndexMut",
        # iter
        "Iterator",
        "IntoIterator",
        "FromIterator",
        # io / error
        "Error",
        "Read",
        "Write",
        "Seek",
        # serde
        "Serialize",
        "Deserialize",
    }
)

CONVERSION_TRAITS = frozenset({"From", "Into", "TryFrom", "TryInto"})


@dataclass
class StructDef:
    name: str
    file: str
    generic_trait_bounds: list[str] = field(default_factory=list)
    field_types: list[str] = field(default_factory=list)
    dyn_traits: list[str] = field(default_factory=list)
    type_params: set[str] = field(default_factory=set)


@dataclass
class TraitDef:
    name: str
    file: str
    supertraits: list[str] = field(default_factory=list)


@dataclass
class TypeAlias:
    name: str
    file: str
    # types referenced on the RHS (after unwrapping containers)
    rhs_types: list[str] = field(default_factory=list)
    # trait bounds on generic params (type Foo<T: Bar> = ...)
    generic_trait_bounds: list[str] = field(default_factory=list)
    # dyn traits found in the RHS
    dyn_traits: list[str] = field(default_factory=list)
    # names of generic type params
    type_params: set[str] = field(default_factory=set)


@dataclass
class EnumDef:
    name: str
    file: str
    generic_trait_bounds: list[str] = field(default_factory=list)
    # types found in variant fields (tuple and struct variants)
    field_types: list[str] = field(default_factory=list)
    dyn_traits: list[str] = field(default_factory=list)
    type_params: set[str] = field(default_factory=set)


@dataclass
class ImplBlock:
    """Represents `impl<GENERICS> [TRAIT for] TYPE { ... }`"""

    self_type: str
    trait_name: str | None  # base name for node refs (e.g. "From")
    trait_display: str | None  # full name with type args (e.g. "From<Config>")
    file: str
    # concrete types referenced in trait type args (e.g. [Config] for From<Config>)
    trait_type_args: list[str] = field(default_factory=list)
    generic_trait_bounds: list[str] = field(default_factory=list)
    id: str = ""


@dataclass
class Graph:
    structs: dict[str, StructDef] = field(default_factory=dict)
    traits: dict[str, TraitDef] = field(default_factory=dict)
    type_aliases: dict[str, TypeAlias] = field(default_factory=dict)
    enums: dict[str, EnumDef] = field(default_factory=dict)
    impls: list[ImplBlock] = field(default_factory=list)

    def kind_of(self, name: str) -> str:
        """Resolve a type name to its kind for node shape hints."""
        if name in self.traits:
            return "trait"
        if name in self.type_aliases:
            return "type"
        if name in self.enums:
            return "enum"
        return "struct"  # TODO


def children_of_type(node: ts.Node, *types: str) -> list[ts.Node]:
    return [c for c in node.children if c.type in types]


def first_child_of_type(node: ts.Node, *types: str) -> ts.Node | None:
    for c in node.children:
        if c.type in types:
            return c
    return None


def text(node: ts.Node | None) -> str:
    return node.text.decode() if node is not None else ""


def collect_type_names(node: ts.Node) -> list[str]:
    names: list[str] = []
    _collect(node, names)
    return names


def _collect(node: ts.Node, acc: list[str]) -> None:
    if node.type == "type_identifier":
        name = text(node)
        if name not in PRIMITIVES:
            acc.append(name)
    elif node.type == "generic_type":
        outer = first_child_of_type(node, "type_identifier")
        outer_name = text(outer)
        args_node = first_child_of_type(node, "type_arguments")
        if outer_name in WRAPPERS and args_node is not None:
            type_children = [
                c
                for c in args_node.children
                if c.type not in ("<", ">", ",", "lifetime")
            ]
            for idx in WRAPPERS[outer_name]:
                if idx < len(type_children):
                    _collect(type_children[idx], acc)
        else:
            if outer_name not in PRIMITIVES:
                acc.append(outer_name)
            if args_node:
                for c in args_node.children:
                    if c.type not in ("<", ">", ",", "lifetime"):
                        _collect(c, acc)
    elif node.type == "dynamic_type":
        inner = first_child_of_type(node, "type_identifier")
        if inner:
            name = text(inner)
            if name not in PRIMITIVES:
                acc.append(name)
    elif node.type == "reference_type":
        for c in node.children:
            if c.type not in ("&", "mut", "lifetime", "mutable_specifier"):
                _collect(c, acc)
    elif node.type == "tuple_type":
        for c in node.children:
            if c.type not in ("(", ")", ","):
                _collect(c, acc)
    elif node.type == "scoped_type_identifier":
        idents = children_of_type(node, "type_identifier")
        if idents:
            name = text(idents[-1])
            if name not in PRIMITIVES:
                acc.append(name)
    elif node.type == "array_type":
        for c in node.children:
            _collect(c, acc)
    elif node.child_count > 0 and node.type not in (
        "type_identifier",
        "primitive_type",
        "lifetime",
    ):
        for c in node.children:
            _collect(c, acc)


def collect_trait_bounds(node: ts.Node) -> list[str]:
    names: list[str] = []
    for c in node.children:
        if c.type == "type_identifier":
            name = text(c)
            if name not in PRIMITIVES:
                names.append(name)
        elif c.type == "generic_type":
            outer = first_child_of_type(c, "type_identifier")
            if outer:
                name = text(outer)
                if name not in PRIMITIVES:
                    names.append(name)
    return names


def collect_type_param_names(tparams: ts.Node) -> set[str]:
    names: set[str] = set()
    for tp in children_of_type(tparams, "type_parameter", "constrained_type_parameter"):
        ident = first_child_of_type(tp, "type_identifier")
        if ident:
            names.add(text(ident))
    return names


def collect_dyn_traits_from_fields(field_list: ts.Node) -> list[str]:
    traits: list[str] = []
    _find_dyn(field_list, traits)
    return traits


def _find_dyn(node: ts.Node, acc: list[str]) -> None:
    if node.type == "dynamic_type":
        inner = first_child_of_type(node, "type_identifier")
        if inner:
            name = text(inner)
            if name not in PRIMITIVES:
                acc.append(name)
    for c in node.children:
        _find_dyn(c, acc)


def extract_trait_name_from_node(node: ts.Node) -> tuple[str, str, list[str]] | None:
    """Extract (base_name, display_name, type_arg_names) from a trait reference node.

    For `From<Config>` returns ("From", "From<Config>", ["Config"]).
    For plain `Display` returns ("Display", "Display", []).
    For `std::fmt::Display` returns ("Display", "Display", []).
    Type args are unwrapped through std containers (Vec, Box, etc.).
    """
    if node.type == "type_identifier":
        name = text(node)
        return (name, name, [])
    elif node.type == "generic_type":
        outer = first_child_of_type(node, "type_identifier")
        if outer:
            base = text(outer)
            display = text(node)
            args_node = first_child_of_type(node, "type_arguments")
            type_args: list[str] = []
            if args_node:
                for c in args_node.children:
                    if c.type not in ("<", ">", ",", "lifetime"):
                        type_args.extend(collect_type_names(c))
            return (base, display, type_args)
    elif node.type == "scoped_type_identifier":
        idents = children_of_type(node, "type_identifier")
        if idents:
            base = text(idents[-1])
            return (base, base, [])
    return None


def extract_struct(node: ts.Node, filepath: str) -> StructDef | None:
    name_node = first_child_of_type(node, "type_identifier")
    if name_node is None:
        return None
    name = text(name_node)
    s = StructDef(name=name, file=filepath)
    tparams = first_child_of_type(node, "type_parameters")
    if tparams:
        s.type_params = collect_type_param_names(tparams)
        for tp in children_of_type(
            tparams, "type_parameter", "constrained_type_parameter"
        ):
            bounds = first_child_of_type(tp, "trait_bounds")
            if bounds:
                s.generic_trait_bounds.extend(collect_trait_bounds(bounds))
    # Named fields: struct Foo { field: Type }
    field_list = first_child_of_type(node, "field_declaration_list")
    if field_list:
        for fd in children_of_type(field_list, "field_declaration"):
            for c in fd.children:
                if c.type not in ("field_identifier", ":", ",", "visibility_modifier"):
                    s.field_types.extend(collect_type_names(c))
        s.dyn_traits = collect_dyn_traits_from_fields(field_list)
    # Tuple fields: struct Foo(Type1, Type2)
    ordered_list = first_child_of_type(node, "ordered_field_declaration_list")
    if ordered_list:
        for c in ordered_list.children:
            if c.type not in ("(", ")", ",", "visibility_modifier"):
                s.field_types.extend(collect_type_names(c))
        dyn_acc: list[str] = []
        _find_dyn(ordered_list, dyn_acc)
        s.dyn_traits.extend(dyn_acc)
    return s


def extract_trait(node: ts.Node, filepath: str) -> TraitDef | None:
    name_node = first_child_of_type(node, "type_identifier")
    if name_node is None:
        return None
    name = text(name_node)
    t = TraitDef(name=name, file=filepath)
    bounds = first_child_of_type(node, "trait_bounds")
    if bounds:
        t.supertraits = collect_trait_bounds(bounds)
    return t


def extract_type_alias(node: ts.Node, filepath: str) -> TypeAlias | None:
    name_node = first_child_of_type(node, "type_identifier")
    if name_node is None:
        return None
    name = text(name_node)
    ta = TypeAlias(name=name, file=filepath)

    # Generic params and their trait bounds
    tparams = first_child_of_type(node, "type_parameters")
    if tparams:
        ta.type_params = collect_type_param_names(tparams)
        for tp in children_of_type(
            tparams, "type_parameter", "constrained_type_parameter"
        ):
            bounds = first_child_of_type(tp, "trait_bounds")
            if bounds:
                ta.generic_trait_bounds.extend(collect_trait_bounds(bounds))
    # RHS types
    saw_eq = False
    for c in node.children:
        if c.type == "=":
            saw_eq = True
            continue
        if saw_eq and c.type != ";":
            ta.rhs_types.extend(collect_type_names(c))
            # Also grab dyn traits from RHS
            dyn_acc: list[str] = []
            _find_dyn(c, dyn_acc)
            ta.dyn_traits.extend(dyn_acc)

    return ta


def extract_enum(node: ts.Node, filepath: str) -> EnumDef | None:
    name_node = first_child_of_type(node, "type_identifier")
    if name_node is None:
        return None
    name = text(name_node)
    e = EnumDef(name=name, file=filepath)

    # Generic params and their trait bounds
    tparams = first_child_of_type(node, "type_parameters")
    if tparams:
        e.type_params = collect_type_param_names(tparams)
        for tp in children_of_type(
            tparams, "type_parameter", "constrained_type_parameter"
        ):
            bounds = first_child_of_type(tp, "trait_bounds")
            if bounds:
                e.generic_trait_bounds.extend(collect_trait_bounds(bounds))

    variant_list = first_child_of_type(node, "enum_variant_list")
    if variant_list:
        for variant in children_of_type(variant_list, "enum_variant"):
            # Tuple variants: Foo(Type1, Type2)
            for ofdl in children_of_type(variant, "ordered_field_declaration_list"):
                for c in ofdl.children:
                    if c.type not in ("(", ")", ",", "visibility_modifier"):
                        e.field_types.extend(collect_type_names(c))
            # Struct-like variants: Foo { field: Type }
            for fdl in children_of_type(variant, "field_declaration_list"):
                for fd in children_of_type(fdl, "field_declaration"):
                    for c in fd.children:
                        if c.type not in (
                            "field_identifier",
                            ":",
                            ",",
                            "visibility_modifier",
                        ):
                            e.field_types.extend(collect_type_names(c))
                # dyn traits from struct-like variants
                dyn_acc: list[str] = []
                _find_dyn(fdl, dyn_acc)
                e.dyn_traits.extend(dyn_acc)
            # Also check tuple variants for dyn traits
            for ofdl in children_of_type(variant, "ordered_field_declaration_list"):
                dyn_acc2: list[str] = []
                _find_dyn(ofdl, dyn_acc2)
                e.dyn_traits.extend(dyn_acc2)

    return e


def extract_impl(node: ts.Node, filepath: str) -> ImplBlock | None:
    has_for = any(c.type == "for" for c in node.children)
    impl = ImplBlock(self_type="", trait_name=None, trait_display=None, file=filepath)
    tparams = first_child_of_type(node, "type_parameters")
    if tparams:
        for tp in children_of_type(
            tparams, "type_parameter", "constrained_type_parameter"
        ):
            bounds = first_child_of_type(tp, "trait_bounds")
            if bounds:
                impl.generic_trait_bounds.extend(collect_trait_bounds(bounds))
    if has_for:
        saw_for = False
        for c in node.children:
            if c.type == "for":
                saw_for = True
                continue
            if c.type in ("impl", "declaration_list", "where_clause"):
                continue
            if c.type == "type_parameters":
                continue
            if not saw_for:
                result = extract_trait_name_from_node(c)
                if result:
                    impl.trait_name, impl.trait_display, impl.trait_type_args = result
            else:
                st = (
                    first_child_of_type(c, "type_identifier")
                    if c.type == "generic_type"
                    else c
                )
                if st and st.type == "type_identifier":
                    impl.self_type = text(st)
                elif c.type == "scoped_type_identifier":
                    idents = children_of_type(c, "type_identifier")
                    if idents:
                        impl.self_type = text(idents[-1])
    else:
        for c in node.children:
            if c.type in (
                "impl",
                "type_parameters",
                "declaration_list",
                "where_clause",
            ):
                continue
            st = (
                first_child_of_type(c, "type_identifier")
                if c.type == "generic_type"
                else c
            )
            if st and st.type == "type_identifier":
                impl.self_type = text(st)
                break
            elif c.type == "scoped_type_identifier":
                idents = children_of_type(c, "type_identifier")
                if idents:
                    impl.self_type = text(idents[-1])
                break
    if not impl.self_type:
        return None
    return impl


def find_rs_files(paths: list[str]) -> list[Path]:
    result: list[Path] = []
    for p in paths:
        pp = Path(p)
        if pp.is_dir():
            result.extend(sorted(pp.rglob("*.rs")))
        elif pp.is_file() and pp.suffix == ".rs":
            result.append(pp)
        else:
            print(f"warning: skipping {p}", file=sys.stderr)
    return result


def extract_macro_impl(node: ts.Node, filepath: str) -> ImplBlock | None:
    # special case handling for the following, both of which yield impl DblTheory for Type
    # impl_dbl_theory!(Type, Kind)
    # impl_dbl_theory!(Type<Kind>)
    macro = (
        node
        if node.type == "macro_invocation"
        else first_child_of_type(node, "macro_invocation")
    )
    if macro is None:
        return None

    name_node = first_child_of_type(macro, "identifier", "scoped_identifier")
    if name_node is None:
        return None
    if name_node.type == "scoped_identifier":
        idents = children_of_type(name_node, "identifier")
        macro_name = text(idents[-1]) if idents else ""
    else:
        macro_name = text(name_node)
    if macro_name != "impl_dbl_theory":
        return None

    tt = first_child_of_type(macro, "token_tree")
    if tt is None:
        return None

    ident = first_child_of_type(tt, "identifier")
    if ident is None:
        return None

    return ImplBlock(
        self_type=text(ident),
        trait_name="DblTheory",
        trait_display="DblTheory",
        file=filepath,
    )


def parse_files(files: list[Path]) -> Graph:
    lang = ts.Language(tsrust.language())
    parser = ts.Parser(lang)
    graph = Graph()
    for fpath in files:
        code = fpath.read_bytes()
        tree = parser.parse(code)
        rel = str(fpath)
        for node in tree.root_node.children:
            if node.type == "struct_item":
                s = extract_struct(node, rel)
                if s:
                    graph.structs[s.name] = s
            elif node.type == "trait_item":
                t = extract_trait(node, rel)
                if t:
                    graph.traits[t.name] = t
            elif node.type == "type_item":
                ta = extract_type_alias(node, rel)
                if ta:
                    graph.type_aliases[ta.name] = ta
            elif node.type == "enum_item":
                e = extract_enum(node, rel)
                if e:
                    graph.enums[e.name] = e
            elif node.type == "impl_item":
                imp = extract_impl(node, rel)
                if imp:
                    imp.id = f"impl_{len(graph.impls)}"
                    graph.impls.append(imp)
            elif node.type in ("expression_statement", "macro_invocation"):
                imp = extract_macro_impl(node, rel)
                if imp:
                    imp.id = f"impl_{len(graph.impls)}"
                    graph.impls.append(imp)
    return graph


def is_std_trait(name: str) -> bool:
    return name in STD_TRAITS


def is_std_type(name: str) -> bool:
    """Is this name a well-known standard library type or trait?"""
    return name in PRIMITIVES or name in STD_TRAITS or name in WRAPPERS


def filter_graph(graph: Graph, *, show_std_traits: bool = False) -> Graph:
    if show_std_traits:
        return graph

    known = (
        set(graph.structs.keys())
        | set(graph.traits.keys())
        | set(graph.type_aliases.keys())
        | set(graph.enums.keys())
    )

    def impl_sides(imp: ImplBlock) -> list[str]:
        sides = [imp.self_type]
        if imp.trait_name and is_std_trait(imp.trait_name):
            sides.extend(imp.trait_type_args)
        elif imp.trait_name:
            sides.append(imp.trait_name)
        return sides

    def keep_impl(imp: ImplBlock) -> bool:
        if imp.trait_name is None:
            return True  # inherent impl, filtered elsewhere
        sides = impl_sides(imp)
        if len(sides) < 2:
            return False  # e.g. impl Display for X --- no second side
        if any(is_std_type(s) for s in sides):
            return False  # either side is std
        if not any(s in known for s in sides):
            return False  # both sides external
        return True

    graph.impls = [imp for imp in graph.impls if keep_impl(imp)]

    # Still filter std noise from non-impl edge sources
    for s in graph.structs.values():
        s.generic_trait_bounds = [
            b for b in s.generic_trait_bounds if not is_std_trait(b)
        ]
        s.dyn_traits = [d for d in s.dyn_traits if not is_std_trait(d)]
        s.field_types = [f for f in s.field_types if not is_std_trait(f)]
    for ta in graph.type_aliases.values():
        ta.generic_trait_bounds = [
            b for b in ta.generic_trait_bounds if not is_std_trait(b)
        ]
        ta.dyn_traits = [d for d in ta.dyn_traits if not is_std_trait(d)]
        ta.rhs_types = [r for r in ta.rhs_types if not is_std_trait(r)]
    for e in graph.enums.values():
        e.generic_trait_bounds = [
            b for b in e.generic_trait_bounds if not is_std_trait(b)
        ]
        e.dyn_traits = [d for d in e.dyn_traits if not is_std_trait(d)]
        e.field_types = [f for f in e.field_types if not is_std_trait(f)]
    for t in graph.traits.values():
        t.supertraits = [s for s in t.supertraits if not is_std_trait(s)]
    for imp in graph.impls:
        imp.generic_trait_bounds = [
            b for b in imp.generic_trait_bounds if not is_std_trait(b)
        ]

    return graph


def exclude_from_graph(graph: Graph, pattern: re.Pattern[str]) -> Graph:

    def excluded(name: str) -> bool:
        return pattern.search(name) is not None

    # 1. Remove matching definitions
    graph.structs = {n: v for n, v in graph.structs.items() if not excluded(n)}
    graph.enums = {n: v for n, v in graph.enums.items() if not excluded(n)}
    graph.traits = {n: v for n, v in graph.traits.items() if not excluded(n)}
    graph.type_aliases = {
        n: v for n, v in graph.type_aliases.items() if not excluded(n)
    }

    # 2. Strip excluded names from all reference lists
    def strip(names: list[str]) -> list[str]:
        return [n for n in names if not excluded(n)]

    for s in graph.structs.values():
        s.field_types = strip(s.field_types)
        s.dyn_traits = strip(s.dyn_traits)
        s.generic_trait_bounds = strip(s.generic_trait_bounds)
    for ta in graph.type_aliases.values():
        ta.rhs_types = strip(ta.rhs_types)
        ta.dyn_traits = strip(ta.dyn_traits)
        ta.generic_trait_bounds = strip(ta.generic_trait_bounds)
    for e in graph.enums.values():
        e.field_types = strip(e.field_types)
        e.dyn_traits = strip(e.dyn_traits)
        e.generic_trait_bounds = strip(e.generic_trait_bounds)
    for t in graph.traits.values():
        t.supertraits = strip(t.supertraits)

    # 3. Filter impls — drop if self_type or trait is excluded,
    #    or if conversion lost all type args
    surviving: list[ImplBlock] = []
    for imp in graph.impls:
        if excluded(imp.self_type):
            continue
        if imp.trait_name and excluded(imp.trait_name):
            continue
        imp.generic_trait_bounds = strip(imp.generic_trait_bounds)
        imp.trait_type_args = strip(imp.trait_type_args)
        # Conversion with no remaining inputs is useless
        if imp.trait_name in CONVERSION_TRAITS and not imp.trait_type_args:
            continue
        surviving.append(imp)
    graph.impls = surviving

    return graph


def sanitize(name: str) -> str:
    """Make a name safe for use as a graphviz node id."""
    inner = (
        name.replace("::", "__").replace("<", "_").replace(">", "_").replace('"', '\\"')
    )
    return f'"{inner}"'


def dot_escape(label: str) -> str:
    """Escape a string for use inside a DOT label attribute."""
    return (
        label.replace("\\", "\\\\")
        .replace('"', '\\"')
        .replace("<", "\\<")
        .replace(">", "\\>")
    )


def emit_dot(graph: Graph) -> str:
    lines: list[str] = []
    a = lines.append
    a("digraph rust_types {")
    a("  rankdir=LR;")
    a('  node [style=filled, fillcolor="#ffffff", fontname="Helvetica"];')
    a('  edge [fontname="Helvetica", fontsize=10];')
    a("")
    # ── Legend ──
    a("  subgraph cluster_legend {")
    a('    label="Legend";')
    a('    color="#d8d2a8";')
    a('    style="rounded";')
    a('    fillcolor="#fffde7";')
    a("")
    # Node kinds in a row
    a('    lk_struct [label="struct", shape=box];')
    a(
        '    lk_enum [label="enum", shape=component, fillcolor="#e8f5e9", color="#5b8a5e"];'
    )
    a(
        '    lk_trait [label="trait", shape=hexagon, fillcolor="#eef6ff", color="#6d8fb3"];'
    )
    a(
        '    lk_type [label="type", shape=ellipse, fillcolor="#f3e5f5", color="#8e6b99"];'
    )
    a("    lk_type -> lk_trait [style=invis];")
    a("    lk_struct -> lk_enum [style=invis];")
    a("")
    # Edge meanings — one per color, dotted circles as abstract endpoints
    dot = 'shape=circle, style=dotted, label="", width=0.15, fixedsize=true'
    for i, (lbl, color) in enumerate(
        [
            ("self type", "darkgreen"),
            ("implements", "darkblue"),
            ("generic over", "darkred"),
            ("gives a", "darkorange"),
            ("uses", "black"),
            ("supertrait", "pink"),
            ("converts", "darkcyan"),
        ]
    ):
        cattr = f', color="{color}"' if color != "black" else ""
        a(f"    ea{i} [{dot}]; eb{i} [{dot}];")
        a(f'    ea{i} -> eb{i} [label="{lbl}"{cattr}];')
    a("  }")
    a("")

    emitted: set[str] = set()
    # Track referenced names with their best-known kind.
    # Priority: trait > enum > type > struct (struct is the fallback guess).
    _KIND_PRIORITY = {"trait": 3, "enum": 2, "type": 1, "struct": 0}
    referenced: dict[str, str] = {}

    def ref_add(name: str, kind: str) -> None:
        prev = referenced.get(name)
        if prev is None or _KIND_PRIORITY.get(kind, 0) > _KIND_PRIORITY.get(prev, 0):
            referenced[name] = kind

    for name in sorted(graph.structs):
        sid = sanitize(name)
        a(f'  {sid} [label="{name}", shape=box];')
        emitted.add(name)

    for name in sorted(graph.traits):
        sid = sanitize(name)
        a(
            f'  {sid} [label="{name}", shape=hexagon, fillcolor="#eef6ff", color="#6d8fb3"];'
        )
        emitted.add(name)

    for name in sorted(graph.type_aliases):
        sid = sanitize(name)
        a(
            f'  {sid} [label="{name}", shape=ellipse, fillcolor="#f3e5f5", color="#8e6b99"];'
        )
        emitted.add(name)

    for name in sorted(graph.enums):
        sid = sanitize(name)
        a(
            f'  {sid} [label="{name}", shape=component, fillcolor="#e8f5e9", color="#5b8a5e"];'
        )
        emitted.add(name)

    graph.impls = [impl for impl in graph.impls if impl.trait_name]

    for imp in graph.impls:
        inputs: list[tuple[str, str]] = []  # (node_name, edge_color)
        outputs: list[tuple[str, str]] = []  # (node_name, edge_color)

        if imp.trait_name in CONVERSION_TRAITS:
            # Conversion: inputs are trait type args, output is self_type
            seen: set[str] = set()
            for arg in imp.trait_type_args:
                if arg not in seen:
                    seen.add(arg)
                    inputs.append((arg, "darkcyan"))
            outputs.append((imp.self_type, "darkgreen"))
        else:
            # Normal: input is self_type, output is trait
            inputs.append((imp.self_type, "darkgreen"))
            if imp.trait_name:
                outputs.append((imp.trait_name, "darkblue"))

        # Generic bounds are additional inputs
        for bound in imp.generic_trait_bounds:
            inputs.append((bound, "darkred"))

        if len(inputs) == 1 and len(outputs) == 1:
            # Elide: direct edge from input to output
            src_name, in_color = inputs[0]
            dst_name, out_color = outputs[0]
            src = sanitize(src_name)
            dst = sanitize(dst_name)
            a(f'  {src} -> {dst} [color="{out_color}"];')
            src_kind = "trait" if in_color == "darkred" else graph.kind_of(src_name)
            dst_kind = "trait" if out_color == "darkblue" else graph.kind_of(dst_name)
            ref_add(src_name, src_kind)
            ref_add(dst_name, dst_kind)
        else:
            if imp.trait_name in CONVERSION_TRAITS:
                label = imp.trait_name
            else:
                label = "impl"
            a(
                f'  {imp.id} [label="{label}", shape=diamond, fillcolor="#fff3e0", color="#d08b2d"];'
            )
            for src_name, in_color in inputs:
                src = sanitize(src_name)
                a(f'  {src} -> {imp.id} [color="{in_color}"];')
                kind = "trait" if in_color == "darkred" else graph.kind_of(src_name)
                ref_add(src_name, kind)
            for dst_name, out_color in outputs:
                dst = sanitize(dst_name)
                a(f'  {imp.id} -> {dst} [color="{out_color}"];')
                kind = "trait" if out_color == "darkblue" else graph.kind_of(dst_name)
                ref_add(dst_name, kind)

    # 4. gives a: struct/type/enum -> any (darkorange)
    def emit_gives_a(
        name: str, field_types: list[str], type_params: set[str], dyn_traits: list[str]
    ) -> None:
        src = sanitize(name)
        seen: set[str] = set()
        for ft in field_types:
            if ft == name or ft in seen:
                continue
            if ft in type_params:
                continue
            if ft in dyn_traits:
                continue
            seen.add(ft)
            dst = sanitize(ft)
            a(f'  {src} -> {dst} [color="darkorange"];')
            ref_add(ft, graph.kind_of(ft))

    for s in graph.structs.values():
        emit_gives_a(s.name, s.field_types, s.type_params, s.dyn_traits)
    for ta in graph.type_aliases.values():
        emit_gives_a(ta.name, ta.rhs_types, ta.type_params, ta.dyn_traits)
    for e in graph.enums.values():
        emit_gives_a(e.name, e.field_types, e.type_params, e.dyn_traits)

    # 5. uses: trait -> struct/type/enum (black)
    def emit_uses(
        name: str, dyn_traits: list[str], generic_trait_bounds: list[str]
    ) -> None:
        dst = sanitize(name)
        seen: set[str] = set()
        for dt in dyn_traits:
            if dt not in seen:
                seen.add(dt)
                tn = sanitize(dt)
                a(f"  {tn} -> {dst};")
                ref_add(dt, "trait")
        for gb in generic_trait_bounds:
            if gb not in seen:
                seen.add(gb)
                tn = sanitize(gb)
                a(f"  {tn} -> {dst};")
                ref_add(gb, "trait")

    for s in graph.structs.values():
        emit_uses(s.name, s.dyn_traits, s.generic_trait_bounds)
    for ta in graph.type_aliases.values():
        emit_uses(ta.name, ta.dyn_traits, ta.generic_trait_bounds)
    for e in graph.enums.values():
        emit_uses(e.name, e.dyn_traits, e.generic_trait_bounds)

    # 6. supertrait: trait -> trait (pink)
    for t in graph.traits.values():
        src = sanitize(t.name)
        for st in t.supertraits:
            dst = sanitize(st)
            a(f'  {src} -> {dst} [color="pink"];')
            ref_add(st, "trait")

    DANGLING_STYLE: dict[str, str] = {
        "trait": 'shape=hexagon, fillcolor="#eef6ff", color="#6d8fb3", style="filled,dashed"',
        "type": 'shape=ellipse, fillcolor="#f3e5f5", color="#8e6b99", style="filled,dashed"',
        "enum": 'shape=component, fillcolor="#e8f5e9", color="#5b8a5e", style="filled,dashed"',
        "struct": 'shape=box, style="filled,dashed"',
    }
    for name, kind in sorted(referenced.items()):
        if name not in emitted:
            sid = sanitize(name)
            style = DANGLING_STYLE.get(kind, DANGLING_STYLE["struct"])
            a(f'  {sid} [label="{name}\\n(external)", {style}];')
            emitted.add(name)
    a("}")
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate a Graphviz DOT graph of Rust struct/trait/impl relationships."
    )
    parser.add_argument(
        "paths",
        nargs="+",
        help="Directories (searched recursively for .rs files) or individual .rs files.",
    )
    parser.add_argument(
        "--show-std-traits",
        action="store_true",
        default=False,
        help="Include standard library traits (Display, Clone, From, etc.) in the graph.",
    )
    parser.add_argument(
        "--exclude",
        type=str,
        action="append",
        default=[],
        metavar="REGEX",
        help="Exclude nodes whose name matches this regex (can be repeated).",
    )
    args = parser.parse_args()
    files = find_rs_files(args.paths)
    if not files:
        print("error: no .rs files found", file=sys.stderr)
        sys.exit(1)
    print(f"# Parsing {len(files)} file(s)…", file=sys.stderr)
    graph = parse_files(files)
    print(
        f"# Found {len(graph.structs)} structs, {len(graph.enums)} enums, "
        f"{len(graph.traits)} traits, {len(graph.type_aliases)} types, "
        f"{len(graph.impls)} impl blocks",
        file=sys.stderr,
    )
    graph = filter_graph(graph, show_std_traits=args.show_std_traits)
    if args.exclude:
        combined = "|".join(f"(?:{pat})" for pat in args.exclude)
        graph = exclude_from_graph(graph, re.compile(combined))
    print(
        f"# After filtering: {len(graph.structs)} structs, {len(graph.enums)} enums, "
        f"{len(graph.traits)} traits, {len(graph.type_aliases)} types, "
        f"{len(graph.impls)} impl blocks",
        file=sys.stderr,
    )
    dot = emit_dot(graph)
    print(dot)


if __name__ == "__main__":
    main()
