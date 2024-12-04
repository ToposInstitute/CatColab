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
using LinearAlgebra
import OrdinaryDiffEq: ReturnCode

# visualization
#using Plots

# load data
data = open(JSON3.read, joinpath(@__DIR__, "diffusion_data.json"), "r")
diagram = data[:diagram];
model = data[:model];

@testset "Text-to-Pode" begin

    @test to_decapode_theory(Val(:Ob), "0-form")      == :Form0
    @test to_decapode_theory(Val(:Ob), "1-form")      == :Form1
    @test to_decapode_theory(Val(:Ob), "2-form")      == :Form2
    @test to_decapode_theory(Val(:Ob), "dual 0-form") == :DualForm0
    @test to_decapode_theory(Val(:Ob), "dual 1-form") == :DualForm1
    @test to_decapode_theory(Val(:Ob), "dual 2-form") == :DualForm2

    @test_throws AlgebraicJuliaService.ImplError to_decapode_theory(Val(:Ob), "Form3")

    @test to_decapode_theory(Val(:Hom), "∂t") == :∂ₜ
    @test to_decapode_theory(Val(:Hom), "Δ") == :Δ
    @test_throws AlgebraicJuliaService.ImplError to_decapode_theory(Val(:Hom), "∧") 

end

@testset "Parsing the Theory JSON Object" begin

    @test Set(keys(data)) == Set([:diagram, :model,:plotVariables])

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

    _id = "019323fa-49cb-7373-8c5d-c395bae4006d";
    @test theory.data[_id] == TheoryElement(;name=:Form0, val=nothing)
    
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

    # no scalars in second position
    decapode, _, _ = Decapode(diagram, theory);

    @test decapode == handcrafted_pode 

end

#=
@testset "Simulation" begin

    json_string = read(joinpath(@__DIR__, "diffusion_data.json"), String);
    system = PodeSystem(json_string);

    simulator = evalsim(system.pode)
    f = simulator(system.dualmesh, default_dec_generate, DiagonalHodge());

    # time
    soln = run_sim(f, system.init, 50.0, ComponentArray(k=0.5,));
    # returns ::ODESolution
    #     - retcode
    #     - interpolation
    #     - t
    #     - u::Vector{ComponentVector}

    @test soln.retcode == ReturnCode.Success
  
    result = SimResult(soln, system);

    @test typeof(result.state) == Dict{String, Vector{Matrix{SVector{3, Float64}}}}

    jv = JsonValue(result);

end


@testset "SimulationTwoVar" begin

    json_string = read(joinpath(@__DIR__,"diffusion_data_twovars.json"), String);
    system = PodeSystem(json_string);

    # DEBUGGING
    open("test_sim.jl", "w") do f
        write(f, string(gensim(system.pode)))
    end
    simulator = include("../test_sim.jl")

    f = simulator(system.dualmesh, system.generate, DiagonalHodge())

    # time
    soln = run_sim(f, system.init, 50.0, ComponentArray(k=0.5,)); 
    # returns ::ODESolution
    #     - retcode
    #     - interpolation
    #     - t
    #     - u::Vector{ComponentVector}

    @test soln.retcode == ReturnCode.Success
  
    result = SimResult(soln, system);

    @test typeof(result.state) == Dict{String, Vector{Matrix{SVector{3, Float64}}}}

    jvs = JsonValue(result);

end
=#

#####

data = open(JSON3.read, joinpath(@__DIR__,"diffusion_long_trip.json"), "r")
diagram = data[:diagram];
model = data[:model];

@testset "Parsing the Theory JSON Object" begin

    @test Set(keys(data)) == Set([:diagram, :model, :scalars,:plotVariables])

    @test @match model[1] begin
        IsObject(_) => true
        _ => false
    end
    
    @test @match model[6] begin
        IsMorphism(_) => true
        _ => false
    end

    theory = Theory();
    @match model[1] begin
        IsObject(content) => add_to_theory!(theory, content, Val(:Ob))
        _ => nothing
    end

    @test theory.data["01936ac6-d1c1-7db1-a3ca-b8678a75299c"] == TheoryElement(;name=:Form0, val=nothing)
    
end

@testset "Simulation 2" begin

    json_string = read(joinpath(@__DIR__, "diffusion_long_trip.json"), String);
    system = PodeSystem(json_string);

    simulator = evalsim(system.pode)
    # open("test_sim.jl", "w") do f
    #     write(f, string(gensim(system.pode)))
    # end
    # simulator = include("test_sim.jl") 
    f = simulator(system.dualmesh, default_dec_matrix_generate, DiagonalHodge());

    # time
    soln = run_sim(f, system.init, 50.0, ComponentArray(k=0.5,));
    # returns ::ODESolution
    #     - retcode
    #     - interpolation
    #     - t
    #     - u::Vector{ComponentVector}

    @test soln.retcode == ReturnCode.Success
  
    result = SimResult(soln, system);

    @test typeof(result.state) == Dict{String, Vector{Matrix{SVector{3, Float64}}}}

    jv = JsonValue(result);

end

###

data = open(JSON3.read, joinpath(@__DIR__, "diffusivity_constant.json"), "r")
diagram = data[:diagram];
model = data[:model];
scalars = data[:scalars];

@testset "Parsing the Theory JSON Object" begin

    @test Set(keys(data)) == Set([:diagram, :model, :scalars,:plotVariables])

    @test @match model[1] begin
        IsObject(_) => true
        _ => false
    end
    
    @test @match model[6] begin
        IsMorphism(_) => true
        _ => false
    end

    theory = Theory();
    @match model[1] begin
        IsObject(content) => add_to_theory!(theory, content, Val(:Ob))
        _ => nothing
    end

    @test theory.data["01936f2c-dba6-7c7b-8ec0-811bbe06bad4" ] == TheoryElement(;name=:Form0, val=nothing)
    
end

@testset "Simulation 3" begin

    json_string = read(joinpath(@__DIR__, "diffusivity_constant.json"), String);
    system = PodeSystem(json_string);

    simulator = evalsim(system.pode)
    # open("test_sim.jl", "w") do f
        # write(f, string(gensim(system.pode)))
    # end
    # simulator = include("test_sim.jl");
    
    f = simulator(system.dualmesh, system.generate, DiagonalHodge());

    soln = run_sim(f, system.init, 50.0, ComponentArray(k=0.5,));
    # returns ::ODESolution
    #     - retcode
    #     - interpolation
    #     - t
    #     - u::Vector{ComponentVector}

    @test soln.retcode == ReturnCode.Success
 
    result = SimResult(soln, system);

    @test typeof(result.state) == Dict{String, Vector{Matrix{SVector{3, Float64}}}}

    jv = JsonValue(result);

end

@testset "Simulation from real front-end data" begin

    json_string = read(joinpath(@__DIR__, "ns_vorticity.json"), String);
    system = PodeSystem(json_string);

    simulator = evalsim(system.pode)
    # open("test_sim.jl", "w") do f
        # write(f, string(gensim(system.pode)))
    # end
    # simulator = include("test_sim.jl");
    
    f = simulator(system.dualmesh, system.generate, DiagonalHodge());

    soln = run_sim(f, system.init, 50.0, ComponentArray(k=0.5,));
    # returns ::ODESolution
    #     - retcode
    #     - interpolation
    #     - t
    #     - u::Vector{ComponentVector}

    @test soln.retcode == ReturnCode.Success
 
    result = SimResult(soln, system);

    @test typeof(result.state) == Dict{String, Vector{Matrix{SVector{3, Float64}}}}

    jv = JsonValue(result);

end

# PLOTTING UTILITIES

# TODO size fixed
# function at_time(sr::SimResult, t::Int)
#     [sr.state[t][i,j][3] for i in 1:51 for j in 1:51]
# end

# function show_heatmap(sr::SimResult, t::Int)
#     data = at_time(result, t)
#     ℓ = floor(Int64, sqrt(length(data)));
#     reshaped = reshape(data, ℓ, ℓ)
#     Plots.heatmap(1:51, 1:51, reshaped, clims=(minimum(data), maximum(data)); palette=:redsblues)
# end

# @gif for t ∈ 1:length(result.time)
#     show_heatmap(result, t)
# end every 5

