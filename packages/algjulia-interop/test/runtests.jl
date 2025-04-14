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

modeljson = open(JSON3.read, joinpath(@__DIR__, "test_jsons", "models", "model_dec.json"), "r")
model_dec = Model(ThDecapode(), modeljson)
@testset "Validating the JSON object" begin
    # validate the JSON
    @test keys(modeljson) == Set([:name, :notebook, :theory, :type])
    cells = modeljson[:notebook][:cells]
    @test @match cells[1] begin
        IsObject(_) => true
        _ => false
    end
    @test @match cells[5] begin
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
    @test Set(nameof.(values(model_dec))) == Set([:DualForm1, :⋆₀⁻¹, :dual_d₁, :dpsw, :Form1, :neg, :⋆₁, :DualForm2, :Form0, :Δ⁻¹, :♭♯, :∂ₜ, :d₀])
end

# ## load diagram
diagram_json = open(JSON3.read, joinpath(@__DIR__, "test_jsons", "diagrams", "inverse_laplacian", "diagram.json"), "r")
diagram = Diagram(diagram_json[:notebook], model_dec)
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
    analysis_json = open(JSON3.read, joinpath(@__DIR__, "test_jsons", "diagrams", "inverse_laplacian", "analysis.json"), "r")
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
diagram_json = open(JSON3.read, joinpath(@__DIR__, "test_jsons", "diagrams", "inverse_laplacian_longtrip", "diagram.json"), "r")
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
    analysis_json = open(JSON3.read, joinpath(@__DIR__, "test_jsons", "diagrams", "inverse_laplacian_longtrip", "analysis.json"), "r")
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
diagram_json = open(JSON3.read, joinpath(@__DIR__, "test_jsons", "diagrams", "ns_vort", "diagram.json"), "r")
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
    @test diagram.pode == handcrafted_pode
end
# TODO not specifying initial boundary conditions for `B` on the front-end
# means that it will be automatically specified
@testset "Analysis - Navier-Stokes Vorticity" begin
    analysis_json = open(JSON3.read, joinpath(@__DIR__, "test_jsons", "diagrams", "ns_vort", "analysis.json"), "r")
    system = Analysis(analysis_json, diagram)
    simulator = evalsim(system.pode)
    f = simulator(system.geometry.dualmesh, system.generate, DiagonalHodge())
    soln = run_sim(f, system.init, system.duration, ComponentArray(k=0.5,))
    @test soln.retcode == ReturnCode.Success
    result = SimResult(soln, system)
    @test typeof(result.state) == Dict{String, Vector{AbstractArray{SVector{3, Float64}}}}
    jv = JsonValue(result)
end

## load diagram
modeljson = open(JSON3.read, joinpath(@__DIR__, "test_jsons", "models", "model_dec_scalar.json"), "r")
model_dec_scalar = Model(ThDecapode(), modeljson)
diagram_json = open(JSON3.read, joinpath(@__DIR__, "test_jsons", "diagrams", "diffusivity_constant", "diagram.json"), "r")
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
    analysis_json = open(JSON3.read, joinpath(@__DIR__, "test_jsons", "diagrams", "diffusivity_constant", "analysis.json"), "r")
    system = Analysis(analysis_json, diagram)
    simulator = evalsim(system.pode)
    f = simulator(system.geometry.dualmesh, system.generate, DiagonalHodge())
    soln = run_sim(f, system.init, system.duration, ComponentArray(k=0.5,))
    @test soln.retcode == ReturnCode.Success
    result = SimResult(soln, system)
    @test typeof(result.state) == Dict{String, Vector{AbstractArray{SVector{3, Float64}}}}
    jv = JsonValue(result)
end

# TODO need to parse
payloadjson = open(JSON3.read, joinpath(@__DIR__, "test", "test_jsons", "payload.json"))
