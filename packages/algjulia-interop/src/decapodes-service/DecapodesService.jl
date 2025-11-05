module DecapodesService

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

using ..CatColabInterop
using ..CatColabInterop: AlgebraicJuliaIntegration, AbstractDiagram, AbstractAnalysis
import ..CatColabInterop: Model, ObGenerator, MorGenerator, DiagramObGenerator, DiagramMorGenerator

# necessary to export
export infer_types!, evalsim, default_dec_generate, default_dec_matrix_generate, DiagonalHodge, ComponentArray

struct ThDecapode <: AlgebraicJuliaIntegration end
export ThDecapode

# functions for geometry and initial conditions
include("geometry.jl")

# responsible for constructing a valid model 
include("model.jl")

# helper functions for Navier-Stokes
include("ns_helper.jl")

# constructing initial conditions
include("initial_conditions.jl")

# parses a payload to a valid analysis 
include("parse.jl")

# executes the analysis 
include("execute.jl")

end
