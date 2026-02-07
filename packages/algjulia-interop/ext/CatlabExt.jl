module CatlabExt

using ACSets
using Catlab: Presentation, FreeSchema, Left
import Catlab: id, dom
using Catlab.CategoricalAlgebra.Pointwise.FunctorialDataMigrations.Yoneda: 
  yoneda, colimit_representables, DiagramData
using CatColabInterop, Oxygen, HTTP
import CatColabInterop: endpoint

""" 
Take a parsed CatColab model of ThSchema and make a Catlab schema. Also 
collect the mapping from UUIDs to human-readable names. 
"""
function model_to_schema(m::Model)::Tuple{Schema, Dict{String,Symbol}}
  obs, homs, attrtypes, attrs = Symbol[],[],[],[]
  names = Dict{String, Symbol}()

  for stmt in m.obGenerators
    names[stmt.id] = Symbol(only(stmt.label))
    if stmt.obType.content == "Entity"
        push!(obs, names[stmt.id])
    elseif stmt.obType.content == "AttrType"
        push!(attrtypes, names[stmt.id])
    else 
      error(stmt.obType)
    end
  end

  for stmt in m.morGenerators
    h = (Symbol(only(stmt.label)), names[stmt.dom.content], 
         names[stmt.cod.content])
    names[stmt.id] = h[1]
    if stmt.morType.content == "Attr"
      push!(attrs, h)
    else 
      push!(homs, h)
    end
  end
  (Schema(Presentation(BasicSchema{Symbol}(obs, homs, attrtypes, attrs, []))), 
   names)
end

""" 
Take a CatColab diagram in a model of ThSchema and construct the input data 
that gets parsed normally from `@acset_colim`. Mutate an existing mapping of 
UUIDs to schema-level names to include UUID mappings for instance-level names.
"""
function diagram_to_data(d::Types.Diagram, names::Dict{String,Symbol}
                        )::DiagramData
  data = DiagramData()
  for o in d.obGenerators
    names[o.id] = Symbol(only(o.label))
    push!(data.reprs[names[o.over.content]], names[o.id])
  end
  for m in d.morGenerators
    p1 = names[m.cod.content] => Symbol[]
    p2 = names[m.dom.content] => [names[m.over.content]]
    push!(data.eqs, p1 => p2)
  end
  data
end

""" 
Receiver of the data already knows the schema, so the JSON payload to CatColab
just includes the columns of data. Every part is named, so we use the names 
(including for primary key columns) rather than numeric indices.
"""
function acset_to_json(X::ACSet, S::Schema, ids::Dict{String, Symbol}, names::Dict{Symbol, Vector{String}}
                      )::AbstractDict
  Dict{String, Vector{String}}(
    [findfirst(==(t), ids) => names[t] for t in types(S)] 
    ∪ [findfirst(==(f), ids) => names[c][X[f]] for (f,_,c) in homs(S)] 
    ∪ [findfirst(==(f), ids) => names[c][getvalue.(X[f])] for (f,_,c) in attrs(S)] )
end

"""
Pick a human-readable name for all parts of the ACSet, given explicit names for 
some of the parts. There is some ambiguity here (the vertex of a generic 
reflexive edge `e` could be either `src(e)` or `tgt(e)`), but an arbitrary name
is chosen after minimizing length (`src(e)` preferred over `src(refl(src(e)))`). 
"""
function make_names(res::ACSet, names::NamedTuple
                   )::Dict{Symbol, Vector{String}}
  S = acset_schema(res)
  function get_name(o::Symbol, i, curr=[])::Vector{Vector{Symbol}}
    V(x) = o in attrtypes(S) ? AttrVar(x) : x # embellish attrvars
    L(x) = o in attrtypes(S) ? Left(x) : x    # embellish attrvars
    found = findfirst(==((o, L(i))), names)     # if (o,i) is in names
    isnothing(found) || return [[found; curr]]  # then just give the name
    inc = [(d, new_i, f) for (f, d, _) in arrows(S, to=o) 
           for new_i in incident(res, V(i), f)]
    return vcat([get_name(d, new_i, [f; curr]) for (d, new_i, f) in inc]...)
  end
  return Dict{Symbol, Vector{String}}(map(types(acset_schema(res))) do o
    o => map(parts(res, o)) do i
      possible_names = sort(get_name(o, i); by=length)
      foldl((x,y)->"$y($x)", string.(first(possible_names)))
    end
  end)
end

""" 
Top level function called by CatColab. Computes an ACSet colimit of a 
  diagrammatic instance. Return a JSON tabular representation.
"""
function endpoint(::Val{:ACSetColim})
  @post "/acsetcolim" function(req::HTTP.Request)
    payload = json(req, ModelDiagram)
    schema, ids = model_to_schema(payload.model)
    data = diagram_to_data(payload.diagram, ids)
    acset_type = AnonACSet(
      schema; type_assignment=Dict(a=>Nothing for a in schema.attrtypes))
    y = yoneda(constructor(acset_type))
    names, res = colimit_representables(data, y)
    acset_to_json(res, schema, ids, make_names(res, names))
  end
end

end # module
