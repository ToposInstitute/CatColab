module CatColabInterop

using MLStyle
using Reexport

const Maybe{T} = Union{T, Nothing}

struct QualifiedName
    segments::Vector{String}
    QualifiedName() = new([])
    QualifiedName(str::String) = new([str])
end

Base.isempty(name::QualifiedName) = isempty(name.segments)
Base.join(name::QualifiedName) = join(name.segments, ".")
Base.convert(::Type{QualifiedName}, str::String) = QualifiedName(str)

Core.Symbol(name::QualifiedName) = Symbol("$(String(name))")

struct QualifiedLabel
    segments::Vector{String}
    QualifiedLabel() = new([])
    QualifiedLabel(str::String) = new([str])
    QualifiedLabel(segments::Vector{String}) = new(segments)
end

# I want to promote the qualified label to Maybe
Core.String(name::QualifiedLabel) = join(name)
Core.Symbol(name::QualifiedLabel) = Symbol("$(String(name))")

Base.isempty(name::QualifiedLabel) = isempty(name.segments)
Base.join(name::QualifiedLabel) = join(name.segments, ".")

Base.convert(::Type{String}, name::QualifiedLabel) = join(name)
Base.convert(::Type{QualifiedLabel}, data::T) where T<:AbstractVector = QualifiedLabel(String.(data))



# this code tracks integrations and allows for basic theory/model-building code to dispatch from it.
# the intent is that this is an interface for AlgebraicJulia code to interoperate with CatColab 
abstract type AlgebraicJuliaIntegration end 

""" 
Functions to build a dictionary associating ids in the theory to elements in the model
"""
function to_model end
export to_model

abstract type AbstractAnalysis{T<:AlgebraicJuliaIntegration} end

# an analysis is something that we run
function run(::AbstractAnalysis{T}) where T end

struct ImplError <: Exception
    name::String
end
export ImplError

Base.showerror(io::IO, e::ImplError) = print(io, "$(e.name) not implemented")

# utility
include("result.jl")

# kernel
include("kernel/kernel_management.jl")
include("kernel/kernel_support.jl")

# ccl
include("model.jl")
include("diagram.jl")
include("payload.jl")
# this is actually the analysis


include("decapodes-service/DecapodesService.jl")

@reexport using .DecapodesService

end
