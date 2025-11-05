"""
CatColab will send a Payload to CatColabInterop. It should consist of a diagram, its model, and incidental data necessary for its analysis' execution.
"""
struct Payload{T<:AlgebraicJuliaIntegration}
    diagram::ModelDiagramPresentation{T}
    model::Model{T}
    data::AbstractDict
end
export Payload

function Payload(diagram::ModelDiagramPresentation{T}, model::Model{T}, data) where T
    Payload{T}(diagram, model, data)
end

function Payload(::T, path::String) where T <: AlgebraicJuliaIntegration
    json = JSON3.read(read(path, String))
    Payload(T(), json)
end

function Payload(::T, json::AbstractDict) where T <: AlgebraicJuliaIntegration
    diagram = ModelDiagramPresentation(T(), json[:diagram])
    model = Model(T(), json[:model])
    data = Dict(k => json[k] for k in keys(json) if k ∉ [:model, :diagram])
    Payload(diagram, model, data)
end

Base.getindex(payload::Payload, field::Symbol) = payload.data[field]

""" An analysis is a functor out of a model or its diagram which must simply implement `run` """
abstract type AbstractAnalysis{T<:AlgebraicJuliaIntegration} end

# an analysis is something that we run
function run(::AbstractAnalysis{T}) where T end
export run
