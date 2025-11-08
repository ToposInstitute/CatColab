module CatlabExt

using ACSets
using Catlab: Presentation, FreeSchema
import Catlab: id, dom
using Catlab.CategoricalAlgebra.Pointwise.FunctorialDataMigrations.Yoneda: 
  yoneda, colimit_representables, DiagramData
using CatColabInterop, Oxygen, HTTP
import CatColabInterop: endpoint

# workaround, could be upstreamed
""" 
If we call `id(X::FreeSchema.Ob{:generator})` we get a FreeSchema.Hom. However,
there is no analogue for attribute types. For `list_to_hom` (a function within)
`colimit_representables` to be concisely defined, we need such an analogue. 
`IdAttr` is workaround type intended to fill this absence.
"""
struct IdAttr{T} x::FreeSchema.AttrType{:generator} end
dom(i::IdAttr) = i.x
id(x::FreeSchema.AttrType{:generator}) = IdAttr{:id}(x)


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
    h = (Symbol(only(stmt.label)), names[stmt.dom.content], names[stmt.cod.content])
    names[stmt.id] = h[1]
    if stmt.morType.content == "Attr"
      push!(attrs, h)
    else 
      push!(homs, h)
    end
  end
  (Schema(Presentation(BasicSchema{Symbol}(obs, homs, attrtypes, attrs, []))), names)
end

function diagram_to_data(d::Types.Diagram, names::Dict{String,Symbol})::DiagramData
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

""" Receiver of the data already knows the schema """
function acset_to_json(X::ACSet, S::Schema)::AbstractDict
  Dict{Symbol, Union{Int,Vector{Int}}}(
    [t => nparts(X, t) for t in types(S)] 
    ∪ [f => X[f] for f in homs(S; just_names=true)] 
    ∪ [f => getvalue.(X[f]) for f in attrs(S; just_names=true)] )
end

""" 
Compute ACSet colimit of a diagrammatic instance. Return a tabular representation 
"""
function endpoint(::Val{:ACSetColim})
  @post "/acsetcolim" function(req::HTTP.Request)
    payload = json(req, ModelDiagram)
    schema, names = model_to_schema(payload.model)
    data = diagram_to_data(payload.diagram, names)
    acset_type = AnonACSet(
      schema; type_assignment=Dict(a=>Nothing for a in schema.attrtypes))
    y = yoneda(constructor(acset_type))
    res = colimit_representables(data, y)
    acset_to_json(res, schema)
  end
end

end # module
