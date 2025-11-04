# struct Payload{T, S} where S, T <: AlgebraicJuliaIntegration
#     mdp::ModelDiagramPresentation{T}
#     data::S
# end

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
