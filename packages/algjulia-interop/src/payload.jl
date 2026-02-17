abstract type AbstractPayload end

Base.getindex(payload::AbstractPayload, field::Symbol) = payload.data[field]

"""
"""
struct ModelPayload{T<:AlgebraicJuliaIntegration} <: AbstractPayload
    model::Model{T}
    data::AbstractDict
end
export ModelPayload

ModelPayload(model::Model{T}, data) where T = ModelPayload{T}(model, data)

function ModelPayload(::T, json_str::String) where T <: AlgebraicJuliaIntegration
    json = JSON3.read(json_str)
    ModelPayload(T(), json)
end

function ModelPayload(::T, json::AbstractDict) where T <: AlgebraicJuliaIntegration
    model = Model(T(), json[:model])
    data = Dict(k => json[k] for k in keys(json) if k ∉ [:model, :diagram])
    ModelPayload(model, data)
end

"""
CatColab will send a Payload to CatColabInterop. It should consist of a diagram, its model, and incidental data necessary for its analysis' execution.
"""
struct DiagramPayload{T<:AlgebraicJuliaIntegration} <: AbstractPayload
    diagram::ModelDiagramPresentation{T}
    model::Model{T}
    data::AbstractDict
end
export DiagramPayload

DiagramPayload(diagram::ModelDiagramPresentation{T}, model::Model{T}, data) where T = DiagramPayload{T}(diagram, model, data)

function DiagramPayload(::T, json_str::String) where T <: AlgebraicJuliaIntegration
    json = JSON3.read(json_str)
    DiagramPayload(T(), json)
end

function DiagramPayload(::T, json::AbstractDict) where T <: AlgebraicJuliaIntegration
    diagram = ModelDiagramPresentation(T(), json[:diagram])
    model = Model(T(), json[:model])
    data = Dict(k => json[k] for k in keys(json) if k ∉ [:model, :diagram])
    DiagramPayload(diagram, model, data)
end

""" An analysis is a functor out of a model or its diagram which must simply implement `run` """
abstract type AbstractAnalysis{T<:AlgebraicJuliaIntegration} end

# an analysis is something that we run
function run(::AbstractAnalysis{T}) where T end
export run
