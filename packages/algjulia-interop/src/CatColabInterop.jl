module CatColabInterop

using MLStyle
using Reexport

# this code tracks integrations and allows for basic theory/model-building code to dispatch from it.
# the intent is that this is an interface for AlgebraicJulia code to interoperate with CatColab 
abstract type AlgebraicJuliaIntegration end 

# cells in the JSON are tagged. these are just objects for dispatching `to_model`
@data ModelElementTag begin
    ObTag()
    HomTag()
end
export ObTag, HomTag

#=
@active patterns are MLStyle-implementations of F# active patterns that forces us to work in the Maybe/Option pattern. 
Practically, yet while a matter of opinion, they make @match statements cleaner; a statement amounts to a helpful pattern
name and the variables we intend to capture.
=# 
@active IsObject(x) begin; x[:content][:tag] == "object" ? Some(x[:content]) : nothing end
@active IsMorphism(x) begin; x[:content][:tag] == "morphism" ? Some(x[:content]) : nothing end
export IsObject, IsMorphism

# Obs, Homs
@data ModelElementValue begin
    ObValue()
    HomValue(dom,cod)
end
export ObValue, HomValue

""" 
Struct capturing the name of the object and its relevant information. 
ModelElementValue may be objects or homs, each of which has different data. 
"""
struct ModelElement
    name::Union{Symbol, Nothing}
    val::Union{<:ModelElementValue, Nothing}
    function ModelElement(;name::Symbol=nothing,val::Any=nothing)
        new(name, val)
    end
end
export ModelElement

Base.nameof(t::ModelElement) = t.name

""" Struct wrapping a dictionary """
struct Model{T<:AlgebraicJuliaIntegration}
    data::Dict{String, ModelElement}
end
export Model

function Model(::T) where T<:AlgebraicJuliaIntegration
    Model{T}(Dict{String, ModelElement}())
end

Base.values(model::Model) = values(model.data)

""" 
Functions to build a dictionary associating ids in the theory to elements in the model
"""
function to_model end
export to_model


# TODO supposes bijection between theories, models, diagrams, etc.
abstract type AbstractDiagram{T<:AlgebraicJuliaIntegration} end

abstract type AbstractAnalysis{T<:AbstractJuliaIntegration} end

struct ImplError <: Exception
    name::String
end
export ImplError

Base.showerror(io::IO, e::ImplError) = print(io, "$(e.name) not implemented")

include("kernel_support.jl")
include("decapodes-service/DecapodesService.jl")

@reexport using .DecapodesService

end
