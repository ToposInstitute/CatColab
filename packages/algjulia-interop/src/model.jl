struct ObGenerator
    id::String
    label::Symbol # TODO maybe
    obType::Any # TODO concretize
end

# TODO macro
ObGenerator(data::AbstractDict) = ObGenerator(getindex.(Ref(data), fieldnames(ObGenerator))...)

Base.nameof(ob::ObGenerator) = Symbol(ob.label)
Base.getindex(obs::Vector{ObGenerator}, id::String) = only(filter(ob -> ob.id == id, obs))

struct MorGenerator
    id::String
    label::Symbol # TODO maybe
    morType::Any # TODO concretize
    dom::ObGenerator
    cod::ObGenerator
end

# TODO macro
MorGenerator(data::AbstractDict) = MorGenerator(getindex.(Ref(data), fieldnames(MorGenerator))...)

Base.nameof(mor::MorGenerator) = Symbol(mor.label)
Base.getindex(obs::Vector{MorGenerator}, id::String) = only(filter(mor -> mor.id == id, mors))

struct Model{T<:AlgebraicJuliaIntegration}
    ob_generators::Vector{ObGenerator}
    mor_generators::Vector{MorGenerator}
    Model(::T) where T = Model(T(), ObGenerator[], MorGenerator[])
    Model(::T, obs, mors) where T = new{T}(obs, mors)
end

function Model(::T, data::AbstractDict) where T <: AlgebraicJuliaIntegration
    ob_generators = ObGenerator.(Ref(T()), data[:obGenerators])
    mor_generators = MorGenerator.(Ref(T()), data[:morGenerators])
    Model(T(), ob_generators, mor_generators)
end

