module DecapodesService

# algebraicjulia dependencies
using ACSets
using DiagrammaticEquations
using Decapodes
using Decapodes: dec_mat_dual_differential, dec_mat_inverse_hodge
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
Point3D = Point3{Float64};

# simulation
using OrdinaryDiffEq

using ..CatColabInterop
using ..CatColabInterop: AlgebraicJuliaIntegration, AbstractDiagram, AbstractAnalysis
import ..CatColabInterop: Model, to_model

# necessary to export
export infer_types!, evalsim, default_dec_generate, default_dec_matrix_generate,
    DiagonalHodge, ComponentArray

struct ThDecapode <: AlgebraicJuliaIntegration end
export ThDecapode

# funcitons for geometry and initial conditions
include("geometry.jl")
include("model.jl") ## model-building
include("diagram.jl") ## diagram-building
include("analysis/Analysis.jl")

end
