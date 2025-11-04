using OrderedCollections

abstract type AbstractDiagram{T<:AlgebraicJuliaIntegration} end

""" Struct defining an object generator """
struct DiagramObGenerator
    id::String
    label::QualifiedLabel # TODO maybe
    obType::AbstractDict
    over::AbstractDict
end
export DiagramObGenerator

# TODO macro
function DiagramObGenerator(data::AbstractDict)
    DiagramObGenerator(getindex.(Ref(data), fieldnames(DiagramObGenerator))...)
end

Base.nameof(ob::DiagramObGenerator) = ob.label

Base.getindex(obs::Vector{MorGenerator}, id::String) = 
only(filter(ob -> ob.id == id, obs))

""" Struct defining an morphism generator """
struct DiagramMorGenerator 
    id::String
    morType::AbstractDict
    over::AbstractDict
    dom::DiagramObGenerator
    cod::DiagramObGenerator
end
export DiagramMorGenerator

# TODO macro
function DiagramMorGenerator(data::AbstractDict; obs::Vector{DiagramObGenerator}=[])
    fields = OrderedDict(field => data[field] for field in fieldnames(DiagramMorGenerator))
    fields[:dom] = only(filter(ob -> ob.id == data[:dom][:content], obs))
    fields[:cod] = only(filter(ob -> ob.id == data[:cod][:content], obs))
    DiagramMorGenerator(values(fields)...)
end

Base.nameof(mor::DiagramMorGenerator) = mor.label

Base.getindex(mors::Vector{MorGenerator}, id::String) = 
only(filter(mor -> mor.id == id, mors))


""" Struct wrapping a dictionary """
struct ModelDiagramPresentation{T<:AlgebraicJuliaIntegration}
    ob_generators::Vector{DiagramObGenerator}
    mor_generators::Vector{DiagramMorGenerator}
    ModelDiagramPresentation(::T, obs, mors) where T = new{T}(obs, mors)
    ModelDiagramPresentation(::T) where T = new{T}([], [])
end
export ModelDiagramPresentation

function ModelDiagramPresentation(::T, data::JSON3.Object) where T
    ob_generators = DiagramObGenerator.(data[:obGenerators])
    mor_generators = DiagramMorGenerator.(data[:morGenerators]; obs=ob_generators)
    ModelDiagramPresentation(T(), ob_generators, mor_generators)
end
