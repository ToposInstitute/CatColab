module DecapodesExt 

import Base: run

# algebraicjulia dependencies
using ACSets
using DiagrammaticEquations
using Decapodes
using CombinatorialSpaces

# dependencies
import JSON3
using StaticArrays
using MLStyle
using LinearAlgebra
using ComponentArrays
using Distributions # for initial conditions

# meshing
using CoordRefSystems
using GeometryBasics: Point2, Point3
Point3D = Point3{Float64}

# simulation
using OrdinaryDiffEq


using CatColabInterop, Oxygen, HTTP
import CatColabInterop: Model, ModelDiagram, ObGenerator, MorGenerator, DiagramObGenerator, DiagramMorGenerator
import CatColabInterop: endpoint

# necessary to export
export infer_types!, evalsim, default_dec_generate, default_dec_matrix_generate, DiagonalHodge, ComponentArray

include("interop.jl")

# functions for geometry and initial conditions
include("geometry.jl")

# helper functions for Navier-Stokes
include("ns_helper.jl")

# constructing initial conditions
include("initial_conditions.jl")

# constructs a simulation from the payload
include("simulation.jl")

# executes the analysis 
include("execute.jl")

"""
"""
function endpoint(::Val{:DecapodeSimulation})
    @post "/decapodes-simulation" function(req::HTTP.Request)
        payload = json(req, ModelDiagrma)
        simulation = DecapodesSimulation(payload)
        sim = evalsim(simulation.pode)
        f = sim(simulation.geometry.dualmesh, simulation.generate, DiagonalHodge())
        res = run(f, simulation, ComponentArray(k=0.5,))
        sim_to_json(res)
    end
end

end
