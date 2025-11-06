using Test
#
using CatColabInterop
using ACSets
using CombinatorialSpaces
using Decapodes
using DiagrammaticEquations
#
using MLStyle
using JSON3
using ComponentArrays
using StaticArrays
using LinearAlgebra
import OrdinaryDiffEq: ReturnCode

const KEYS = Set([:mesh, :plotVariables, :initialConditions, :domain, :diagram, :model, :scalars, :duration])

@testset "Model Verification" begin
   include("model_verification.jl")
end

@testset "Analysis" begin
   include("simulation.jl")
end
