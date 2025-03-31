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

@testset "Text-to-Pode" begin
    @test to_model(ThDecapode(), ObTag(), "0-form")      == :Form0
    @test to_model(ThDecapode(), ObTag(), "1-form")      == :Form1
    @test to_model(ThDecapode(), ObTag(), "2-form")      == :Form2
    @test to_model(ThDecapode(), ObTag(), "dual 0-form") == :DualForm0
    @test to_model(ThDecapode(), ObTag(), "dual 1-form") == :DualForm1
    @test to_model(ThDecapode(), ObTag(), "dual 2-form") == :DualForm2
    @test_throws CatColabInterop.ImplError to_model(ThDecapode(), ObTag(), "Form3")
    @test to_model(ThDecapode(), HomTag(), "∂t") == :∂ₜ
    @test to_model(ThDecapode(), HomTag(), "Δ") == :Δ
    @test_throws CatColabInterop.ImplError to_model(ThDecapode(), HomTag(), "∧") 
end

modeljson = open(JSON3.read, joinpath(@__DIR__, "test", "test_jsons", "models", "model_dec.json"), "r")
dec_model = Model(ThDecapode(), modeljson)
@testset "Validating the JSON object" begin
    # validate the JSON
    @test keys(modeljson) == Set([:name, :notebook, :theory, :type])
    cells = modeljson[:notebook][:cells]
    @test @match cells[1] begin
        IsObject(_) => true
        _ => false
    end
    @test_broken @match cells[4] begin
        IsMorphism(_) => true
        _ => false
    end
    model = Model(ThDecapode())
    @match cells[1] begin
        IsObject(content) => add_to_model!(model, content, ObTag())
        _ => nothing
    end
end
@testset "Validate model" begin
    # caveat: \star and \bigstar are different, but indistinguishable in some fonts
    @test Set(nameof.(values(dec_model))) == Set([:DualForm1, :⋆₀⁻¹, :dual_d₁, :dpsw, :Form1, :neg, :⋆₁, :DualForm2, :Form0, :Δ⁻¹, :♭♯, :∂ₜ, :d₀])
end

# ## load diagram
diagram_json = open(JSON3.read, joinpath(@__DIR__, "test", "test_jsons", "diagrams", "inverse_laplacian", "diagram.json"), "r")
diagram = Diagram(diagram_json[:notebook], dec_model)
@testset "Diagram - Inverse Laplacian" begin
    handcrafted_pode = SummationDecapode(parse_decapode(quote end))
    add_part!(handcrafted_pode, :Var, name=:A, type=:Form0)
    add_part!(handcrafted_pode, :Var, name=:B, type=:Form0)
    add_part!(handcrafted_pode, :Op1, src=1, tgt=2, op1=:Δ⁻¹)
    @test diagram.pode == handcrafted_pode
end
# TODO not specifying initial boundary conditions for `B` on the front-end
# means that it will be automatically specified
@testset "Analysis - Inverse Laplacian" begin
    analysis_json = open(JSON3.read, joinpath(@__DIR__, "test", "test_jsons", "diagrams", "inverse_laplacian", "analysis_1.json"), "r")
    system = Analysis(analysis_json, diagram)
    simulator = evalsim(system.pode)
    f = simulator(system.geometry.dualmesh, system.generate, DiagonalHodge())
    soln = run_sim(f, system.init, 50.0, ComponentArray(k=0.5,))
    @test soln.retcode == ReturnCode.Success
    result = SimResult(soln, system)
    @test typeof(result.state) == Dict{String, Vector{AbstractArray{SVector{3, Float64}}}}
    jv = JsonValue(result)
end

# ## load diagram
diagram_json = open(JSON3.read, joinpath(@__DIR__, "test", "test_jsons", "diagrams", "inverse_laplacian_longtrip", "diagram.json"), "r")
diagram = Diagram(diagram_json[:notebook], dec_model)
@testset "Diagram - Inverse Laplacian - Longtrip" begin
    handcrafted_pode = SummationDecapode(parse_decapode(quote end))
    add_part!(handcrafted_pode, :Var, name=:u, type=:Form0)
    add_part!(handcrafted_pode, :Var, name=:Δu, type=:Form0)
    add_part!(handcrafted_pode, :Var, name=Symbol("•1"), type=nothing)
    add_part!(handcrafted_pode, :Var, name=Symbol("•2"), type=nothing)
    add_part!(handcrafted_pode, :Var, name=Symbol("•3"), type=nothing)
    add_part!(handcrafted_pode, :Op1, src=1, tgt=3, op1=:d₀)
    add_part!(handcrafted_pode, :Op1, src=3, tgt=4, op1=:⋆₁)
    add_part!(handcrafted_pode, :Op1, src=4, tgt=5, op1=:dual_d₁)
    add_part!(handcrafted_pode, :Op1, src=5, tgt=2, op1=:⋆₀⁻¹)
    add_part!(handcrafted_pode, :Op1, src=1, tgt=2, op1=:Δ⁻¹)
    @test diagram.pode == handcrafted_pode
end
# TODO not specifying initial boundary conditions for `B` on the front-end means that it will be automatically specified
# TODO: why isn't the infer_types! working?
@testset "Analysis - Inverse Laplacian - Longtrip" begin
    analysis_json = open(JSON3.read, joinpath(@__DIR__, "test", "test_jsons", "diagrams", "inverse_laplacian_longtrip", "analysis.json"), "r")
    system = Analysis(analysis_json, diagram)
    simulator = evalsim(system.pode)
    f = simulator(system.geometry.dualmesh, system.generate, DiagonalHodge())
    soln = run_sim(f, system.init, 50.0, ComponentArray(k=0.5,))
    @test soln.retcode == ReturnCode.Success
    result = SimResult(soln, system)
    @test typeof(result.state) == Dict{String, Vector{AbstractArray{SVector{3, Float64}}}}
    jv = JsonValue(result)
end

# ## load diagram
diagram_json = open(JSON3.read, joinpath(@__DIR__, "test", "test_jsons", "diagrams", "ns_vort", "diagram.json"), "r")
diagram = Diagram(diagram_json[:notebook], dec_model)
# @testset "Diagram - NS Vorticity" begin
#     # construct a decapode
#     handcrafted_pode = SummationDecapode(parse_decapode(quote end))
#     add_part!(handcrafted_pode, :Var, name=:u, type=:Form0)
#     add_part!(handcrafted_pode, :Var, name=Symbol("du/dt"), type=:Form0)
#     add_part!(handcrafted_pode, :TVar, incl=2)
#     add_part!(handcrafted_pode, :Op1, src=1, tgt=2, op1=:∂ₜ)
#     @test diagram.pode == handcrafted_pode
# end
# TODO not specifying initial boundary conditions for `B` on the front-end
# means that it will be automatically specified
@testset "Analysis - Navier-Stokes Vorticity" begin
    analysis_json = open(JSON3.read, joinpath(@__DIR__, "test", "test_jsons", "diagrams", "ns_vort", "analysis.json"), "r")
    system = Analysis(analysis_json, diagram)
    simulator = evalsim(system.pode)
    f = simulator(system.geometry.dualmesh, system.generate, DiagonalHodge())
    soln = run_sim(f, system.init, system.duration, ComponentArray(k=0.5,))
    @test soln.retcode == ReturnCode.Success
    result = SimResult(soln, system)
    @test typeof(result.state) == Dict{String, Vector{AbstractArray{SVector{3, Float64}}}}
    jv = JsonValue(result)
end

# ## load diagram
diagram_json = open(JSON3.read, joinpath(@__DIR__, "test", "test_jsons", "diagrams", "diffusivity_constant", "diagram.json"), "r")
diagram = Diagram(diagram_json[:notebook], dec_model)
@testset "Diagram - Diffusivity Constant" begin
    # construct a decapode
    handcrafted_pode = SummationDecapode(parse_decapode(quote end))
    add_part!(handcrafted_pode, :Var, name=:u, type=:Form0)
    add_part!(handcrafted_pode, :Var, name=Symbol("du/dt"), type=:Form0)
    add_part!(handcrafted_pode, :TVar, incl=2)
    add_part!(handcrafted_pode, :Op1, src=1, tgt=2, op1=:∂ₜ)
    @test diagram.pode == handcrafted_pode
end
# TODO not specifying initial boundary conditions for `B` on the front-end
# means that it will be automatically specified
@testset "Analysis - Diffusivity Constant" begin
    analysis_json = open(JSON3.read, joinpath(@__DIR__, "test", "test_jsons", "diagrams", "diffusivity_constant", "analysis_1.json"), "r")
    system = Analysis(analysis_json, diagram)
    simulator = evalsim(system.pode)
    f = simulator(system.geometry.dualmesh, system.generate, DiagonalHodge())
    soln = run_sim(f, system.init, system.duration, ComponentArray(k=0.5,))
    @test soln.retcode == ReturnCode.Success
    result = SimResult(soln, system)
    @test typeof(result.state) == Dict{String, Vector{AbstractArray{SVector{3, Float64}}}}
    jv = JsonValue(result)
end
