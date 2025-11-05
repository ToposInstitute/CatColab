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

# ## load diagram
diagram_json = open(JSON3.read, joinpath(@__DIR__,  "test_jsons", "diagrams", "inverse_laplacian_longtrip", "diagram.json"), "r")
diagram = Diagram(diagram_json[:notebook], model_dec)
infer_types!(diagram.pode)
@testset "Diagram - Inverse Laplacian - Longtrip" begin
    handcrafted_pode = SummationDecapode(parse_decapode(quote end))
    add_part!(handcrafted_pode, :Var, name=:u, type=:Form0)
    add_part!(handcrafted_pode, :Var, name=:Δu, type=:Form0)
    add_part!(handcrafted_pode, :Var, name=Symbol("•1"), type=:Form1)
    add_part!(handcrafted_pode, :Var, name=Symbol("•2"), type=:DualForm1)
    add_part!(handcrafted_pode, :Var, name=Symbol("•3"), type=:DualForm2)
    add_part!(handcrafted_pode, :Op1, src=1, tgt=3, op1=:d₀)
    add_part!(handcrafted_pode, :Op1, src=3, tgt=4, op1=:⋆₁)
    add_part!(handcrafted_pode, :Op1, src=4, tgt=5, op1=:dual_d₁)
    add_part!(handcrafted_pode, :Op1, src=5, tgt=2, op1=:⋆₀⁻¹)
    add_part!(handcrafted_pode, :Op1, src=1, tgt=2, op1=:Δ⁻¹)
    @test diagram.pode == handcrafted_pode
end
# TODO not specifying initial boundary conditions for `B` on the front-end means that it will be automatically specified
@testset "Analysis - Inverse Laplacian - Longtrip" begin
    analysis_json = open(JSON3.read, joinpath(@__DIR__,  "test_jsons", "diagrams", "inverse_laplacian_longtrip", "analysis.json"), "r")
    system = Analysis(analysis_json, diagram)
    simulator = evalsim(system.pode)
    f = simulator(system.geometry.dualmesh, system.generate, DiagonalHodge())
    soln = run_sim(f, system.init, 50.0, ComponentArray(k=0.5,))
    @test soln.retcode == ReturnCode.Success
    result = SimResult(soln, system)
    @test typeof(result.state) == Dict{String, Vector{AbstractArray{SVector{3, Float64}}}}
    jv = JsonValue(result)
end

#= ------------------------------------------------------------------------- =#

# ## load diagram
diagram_json = open(JSON3.read, joinpath(@__DIR__,  "test_jsons", "diagrams", "ns_vort", "diagram.json"), "r")
diagram = Diagram(diagram_json[:notebook], model_dec)
infer_types!(diagram.pode)
@testset "Diagram - NS Vorticity" begin
    # construct a decapode
    handcrafted_pode = SummationDecapode(parse_decapode(quote end))
    add_part!(handcrafted_pode, :Var, name=:v, type=:DualForm1)
    add_part!(handcrafted_pode, :Var, name=:dv, type=:DualForm2)
    add_part!(handcrafted_pode, :Var, name=:ψ, type=:Form0)
    # infer
    add_part!(handcrafted_pode, :Var, name=Symbol("•1"), type=:Form0)
    add_part!(handcrafted_pode, :Var, name=Symbol("•2"), type=:Form1)
    add_part!(handcrafted_pode, :Var, name=Symbol("•3"), type=:infer)
    add_part!(handcrafted_pode, :Var, name=Symbol("•4"), type=:infer)
    add_part!(handcrafted_pode, :Var, name=Symbol("•5"), type=:infer)
    add_part!(handcrafted_pode, :Var, name=Symbol("•6"), type=:infer)
    add_part!(handcrafted_pode, :Var, name=Symbol("•7"), type=:infer)
    # tvar
    add_part!(handcrafted_pode, :TVar, incl=9)
    # op1
    add_part!(handcrafted_pode, :Op1, src=2, tgt=4, op1=:⋆₀⁻¹)
    add_part!(handcrafted_pode, :Op1, src=3, tgt=5, op1=:d₀)
    add_part!(handcrafted_pode, :Op1, src=5, tgt=1, op1=:⋆₁)
    add_part!(handcrafted_pode, :Op1, src=1, tgt=6, op1=:dpsw) # TODO breaks infer_types
    add_part!(handcrafted_pode, :Op1, src=6, tgt=7, op1=:♭♯)
    add_part!(handcrafted_pode, :Op1, src=7, tgt=8, op1=:⋆₁)
    add_part!(handcrafted_pode, :Op1, src=2, tgt=9, op1=:∂ₜ)
    add_part!(handcrafted_pode, :Op1, src=8, tgt=10, op1=:dual_d₁)
    add_part!(handcrafted_pode, :Op1, src=10, tgt=9, op1=:neg)
    infer_types!(handcrafted_pode)
    @test diagram.pode == handcrafted_pode
end

## load diagram
modeljson = open(JSON3.read, joinpath(@__DIR__,  "test_jsons", "models", "model_dec_scalar.json"), "r")
model_dec_scalar = Model(ThDecapode(), modeljson)
diagram_json = open(JSON3.read, joinpath(@__DIR__,  "test_jsons", "diagrams", "diffusivity_constant", "diagram.json"), "r")
diagram = Diagram(diagram_json[:notebook], model_dec_scalar)
infer_types!(diagram.pode)
@testset "Diagram - Diffusivity Constant" begin
    # construct a decapode
    handcrafted_pode = SummationDecapode(parse_decapode(quote end))
    add_part!(handcrafted_pode, :Var, name=:u, type=:DualForm2)
    add_part!(handcrafted_pode, :Var, name=Symbol("du/dt"), type=:DualForm2)
    add_part!(handcrafted_pode, :Var, name=Symbol("•1"), type=:Form0)
    add_part!(handcrafted_pode, :Var, name=Symbol("•2"), type=:Form1)
    add_part!(handcrafted_pode, :Var, name=Symbol("•3"), type=:DualForm1)
    add_part!(handcrafted_pode, :Var, name=Symbol("•4"), type=:DualForm2)
    add_part!(handcrafted_pode, :TVar, incl=2)
    add_part!(handcrafted_pode, :Op1, src=1, tgt=3, op1=:⋆₀⁻¹)
    add_part!(handcrafted_pode, :Op1, src=3, tgt=4, op1=:d₀)
    add_part!(handcrafted_pode, :Op1, src=4, tgt=5, op1=:⋆₁)
    add_part!(handcrafted_pode, :Op1, src=5, tgt=6, op1=:dual_d₁)
    add_part!(handcrafted_pode, :Op1, src=6, tgt=2, op1=:any_scalar)
    add_part!(handcrafted_pode, :Op1, src=1, tgt=2, op1=:∂ₜ)
    @test diagram.pode == handcrafted_pode
end
# TODO not specifying initial boundary conditions for `B` on the front-end
# means that it will be automatically specified
@testset "Analysis - Diffusivity Constant" begin
    analysis_json = open(JSON3.read, joinpath(@__DIR__,  "test_jsons", "diagrams", "diffusivity_constant", "analysis.json"), "r")
    system = Analysis(analysis_json, diagram)
    simulator = evalsim(system.pode)
    f = simulator(system.geometry.dualmesh, system.generate, DiagonalHodge())
    soln = run_sim(f, system.init, system.duration, ComponentArray(k=0.5,))
    @test soln.retcode == ReturnCode.Success
    result = SimResult(soln, system)
    @test typeof(result.state) == Dict{String, Vector{AbstractArray{SVector{3, Float64}}}}
    jv = JsonValue(result)
end


# Payload
payloadjson = open(JSON3.read, joinpath(@__DIR__, "test_jsons", "payload.json"))
model = Model(ThDecapode(), payloadjson.model)
diagram = Diagram(payloadjson.diagram, model)
infer_types!(diagram.pode)
# TODO need to verify
@testset "(Payload) Diagram - Diffusivity Constant" begin
    # construct a decapode
    handcrafted_pode = SummationDecapode(parse_decapode(quote end))
    add_part!(handcrafted_pode, :Var, name=Symbol("dv/dt"), type=:DualForm2)
    add_part!(handcrafted_pode, :Var, name=Symbol("•1"), type=:Form0)
    add_part!(handcrafted_pode, :Var, name=Symbol("•2"), type=:Form1)
    add_part!(handcrafted_pode, :Var, name=Symbol("•3"), type=:DualForm1)
    add_part!(handcrafted_pode, :Var, name=Symbol("•4"), type=:DualForm2)
    add_part!(handcrafted_pode, :Var, name=:v, type=:DualForm2)
    add_part!(handcrafted_pode, :TVar, incl=1)
    add_part!(handcrafted_pode, :Op1, src=6, tgt=2, op1=:⋆₀⁻¹)
    add_part!(handcrafted_pode, :Op1, src=3, tgt=4, op1=:⋆₁)
    add_part!(handcrafted_pode, :Op1, src=5, tgt=1, op1=:any_scalar)
    add_part!(handcrafted_pode, :Op1, src=6, tgt=1, op1=:∂ₜ)
    add_part!(handcrafted_pode, :Op1, src=4, tgt=5, op1=:dual_d₁)
    add_part!(handcrafted_pode, :Op1, src=2, tgt=3, op1=:d₀)
    @test diagram.pode == handcrafted_pode
end
# TODO not specifying initial boundary conditions for `B` on the front-end
# means that it will be automatically specified
@testset "Analysis - Diffusivity Constant" begin
    system = Analysis(ThDecapode(), payloadjson)
    simulator = evalsim(system.pode)
    # DEBUGGING SNIPPET:
    # path = joinpath(@__DIR__, "testsim.jl")
    # open(path, "w") do f
    #     write(f, string(gensim(system.pode)))
    # end
    # simulator = include(path)
    f = simulator(system.geometry.dualmesh, system.generate, DiagonalHodge())
    soln = run_sim(f, system.init, system.duration, ComponentArray(k=0.5,))
    @test soln.retcode == ReturnCode.Success
    result = SimResult(soln, system)
    @test typeof(result.state) == Dict{String, Vector{AbstractArray{SVector{3, Float64}}}}
    jv = JsonValue(result)
end
