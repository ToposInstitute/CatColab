module AlgebraicJuliaService

using MLStyle
using Reexport

# this code tracks integrations and allows for basic theory/model-building code to dispatch from it.
# the intent is that this is an interface for AlgebraicJulia code to interoperate with CatColab 
@data AlgebraicJuliaIntegration begin
    ThDecapode()
end
export ThDecapode

# these are just objects for dispatching `to_theory`
@data ElementType begin
    ObType()
    HomType()
end
export ObType, HomType

""" Functions to build a dictionary associating ids in the theory to elements in the model"""
function to_theory end; export to_theory

struct ImplError <: Exception
    name::String
end
export ImplError

Base.showerror(io::IO, e::ImplError) = print(io, "$(e.name) not implemented")


include("kernel_support.jl")
include("decapodes-service/DecapodesService.jl")

@reexport using .DecapodesService

end
