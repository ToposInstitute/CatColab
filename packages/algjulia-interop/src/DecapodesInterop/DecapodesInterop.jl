module DecapodesInterop

using ComponentArrays
using Distributions
using MLStyle
using StaticArrays
using LinearAlgebra
using OrdinaryDiffEq
using CoordRefSystems

using CombinatorialSpaces
using DiagrammaticEquations
import DiagrammaticEquations: SummationDecapode
using Decapodes
using ACSets

using CatColabInterop, Oxygen, HTTP
import CatColabInterop: endpoint

struct ImplError <: Exception
    name::String
end
export ImplError
Base.showerror(io::IO, e::ImplError) = print(io, "$(e.name) not implemented")

# specifies the mesh
include("geometry.jl")

# code specific to NS equations
include("ns_helper.jl")

# for specifying the initial conditions
include("initial_conditions.jl")

# build the decapode
include("model_diagram.jl")

# for running the simulation
include("simulation.jl")

# for formatting the data into the correct return type
include("formatting.jl")

function endpoint(::Val{:Decapodes})
    @post "/decapodes" function (req::HTTP.Request)
        analysis = json(req, Analysis)
        system = DecapodesSystem(analysis)
        result = run(system)
        
    end
end

function endpoint(::Val{:DecapodesOptions})
    @get "/decapodes-options" function (req::HTTP.Request)
        supported_decapodes_geometries()
    end
end

end # module
