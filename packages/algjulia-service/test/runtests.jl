using Test

using AlgebraicJuliaService
using ACSets
using CombinatorialSpaces
using Decapodes
using DiagrammaticEquations

using MLStyle
using JSON3
using ComponentArrays
using StaticArrays
import OrdinaryDiffEq: ReturnCode

# load data
data = open(JSON3.read, joinpath(@__DIR__, "diffusion_data.json"), "r")
diagram = data[:diagram];
model = data[:model];

@testset "Text-to-Pode" begin

    @test to_pode(Val(:Ob), "0-form") == :Form0
    @test to_pode(Val(:Ob), "1-form") == :Form1
    @test to_pode(Val(:Ob), "2-form") == :Form2
    @test_throws AlgebraicJuliaService.ImplError to_pode(Val(:Ob), "Constant")

    @test to_pode(Val(:Hom), "∂t") == :∂ₜ
    @test to_pode(Val(:Hom), "Δ") == :Δ
    @test_throws AlgebraicJuliaService.ImplError to_pode(Val(:Hom), "∧") 

end

@testset "Parsing the Theory JSON Object" begin

    @test Set(keys(data)) == Set([:diagram, :model])

    # the intent was to check that the JSON is coming in with the correct keys
    # @test_broken Set(keys(model)) == Set([:name, :notebook, :theory, :type])

    @test @match model[1] begin
        IsObject(_) => true
        _ => false
    end
    
    @test @match model[4] begin
        IsMorphism(_) => true
        _ => false
    end

    theory = Theory();
    @match model[1] begin
        IsObject(content) => add_to_theory!(theory, content, Val(:Ob))
        _ => nothing
    end
    @test theory.data["019323fa-49cb-7373-8c5d-c395bae4006d"] == TheoryElement(;name=:Form0, val=nothing)
    
end

@testset "Making the Decapode" begin
   
    theory = Theory(model);
    @test Set(nameof.(values(theory))) == Set([:Form0, :Form1, :Form2, :Δ, :∂ₜ])

    handcrafted_pode = SummationDecapode(parse_decapode(quote end));
    add_part!(handcrafted_pode, :Var, name=:C, type=:Form0);
    add_part!(handcrafted_pode, :Var, name=Symbol("dC/dt"), type=:Form0);
    add_part!(handcrafted_pode, :TVar, incl=2);
    add_part!(handcrafted_pode, :Op1, src=1, tgt=2, op1=:∂ₜ);
    add_part!(handcrafted_pode, :Op1, src=1, tgt=2, op1=:Δ);

    decapode = Decapode(diagram, theory);

    @test decapode == handcrafted_pode 

end

@testset "Simulation" begin

    json_string = read(joinpath(@__DIR__, "diffusion_data.json"), String);
    system = System(json_string);

    simulator = evalsim(system.pode)
    f = simulator(system.mesh, default_dec_generate, DiagonalHodge());

    # time
    soln = run_sim(f, system.init, 100.0, ComponentArray(k=0.5,));
    # returns ::ODESolution
    #     - retcode
    #     - interpolation
    #     - t
    #     - u::Vector{ComponentVector}

    @test soln.retcode == ReturnCode.Success
  
    result = SimResult(soln, system.mesh);

    @test typeof(result.state) == Vector{Matrix{SVector{3, Float64}}}

    jv = JsonValue(result);

end
