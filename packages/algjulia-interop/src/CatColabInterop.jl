module CatColabInterop

import Base: run
using JSON3
using MLStyle
using Reexport

# this code tracks integrations and allows for basic theory/model-building code to dispatch from it.
# the intent is that this is an interface for AlgebraicJulia code to interoperate with CatColab 
abstract type AlgebraicJuliaIntegration end 

#= These files are responsible for parsing the model and diagram in the CCL payload =#
include("qualified_name.jl")
include("model.jl")
include("diagram.jl")
include("payload.jl") # payload and analysis are here

struct ImplError <: Exception
    name::String
end
export ImplError
Base.showerror(io::IO, e::ImplError) = print(io, "$(e.name) not implemented")

# Kernel utilities
include("kernel/KernelUtility.jl")

#= The Decapodes service contains an analysis =#
include("decapodes-service/DecapodesService.jl")

@reexport using .KernelUtility
@reexport using .DecapodesService

end
