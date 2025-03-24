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

## load data
#data = open(JSON3.read, joinpath(@__DIR__, "test_jsons", "diffusivity_constant.json"), "r")
#jsondiagram = data[:diagram]
#jsonmodel = data[:model]

#@testset "Text-to-Pode" begin

#    @test to_model(ThDecapode(), ObTag(), "0-form")      == :Form0
#    @test to_model(ThDecapode(), ObTag(), "1-form")      == :Form1
#    @test to_model(ThDecapode(), ObTag(), "2-form")      == :Form2
#    @test to_model(ThDecapode(), ObTag(), "dual 0-form") == :DualForm0
#    @test to_model(ThDecapode(), ObTag(), "dual 1-form") == :DualForm1
#    @test to_model(ThDecapode(), ObTag(), "dual 2-form") == :DualForm2

#    @test_throws CatColabInterop.ImplError to_model(ThDecapode(), ObTag(), "Form3")

#    @test to_model(ThDecapode(), HomTag(), "∂t") == :∂ₜ
#    @test to_model(ThDecapode(), HomTag(), "Δ") == :Δ
#    @test_throws CatColabInterop.ImplError to_model(ThDecapode(), HomTag(), "∧") 

#end


#@testset "Parsing the Model JSON Object" begin

#    @test Set(keys(data)) == KEYS

#    @test @match jsonmodel[1] begin
#        IsObject(_) => true
#        _ => false
#    end
    
#    @test @match jsonmodel[4] begin
#        IsMorphism(_) => true
#        _ => false
#    end

#    model = Model(ThDecapode())
#    @match jsonmodel[1] begin
#        IsObject(content) => add_to_model!(model, content, ObTag())
#        _ => nothing
#    end

#    # _id = "019323fa-49cb-7373-8c5d-c395bae4006d"
#    # @test model.data[_id] == ModelElement(;name=:Form0, val=nothing)
    
#end

#@testset "Making the Decapode" begin
   
#    model = Model(ThDecapode(), jsonmodel)
#    @test Set(nameof.(values(model))) == Set([:Form0, :Form1, :Form2, :Δ, :∂ₜ, :diffusivity])

#    handcrafted_pode = SummationDecapode(parse_decapode(quote end))
#    add_part!(handcrafted_pode, :Var, name=:u, type=:Form0)
#    add_part!(handcrafted_pode, :Var, name=Symbol("du/dt"), type=:Form0)
#    add_part!(handcrafted_pode, :Var, name=Symbol("•1"), type=:Form0)
#    add_part!(handcrafted_pode, :TVar, incl=2)
#    add_part!(handcrafted_pode, :Op1, src=1, tgt=2, op1=:∂ₜ)
#    add_part!(handcrafted_pode, :Op1, src=3, tgt=2, op1=:diffusivity)
#    add_part!(handcrafted_pode, :Op1, src=1, tgt=3, op1=:Δ)

#    # no scalars in second position
#    decapode, _, _ = Decapode(jsondiagram, model)

#    @test decapode == handcrafted_pode 

#end

#@testset "Parsing the Model JSON Object - Diffusivity Constant" begin
    
#    data = open(JSON3.read, joinpath(@__DIR__, "test_jsons", "diffusivity_constant.json"), "r")
#    jsondiagram = data[:diagram]
#    jsonmodel = data[:model]
#    jsonscalars = data[:scalars]

#    @test Set(keys(data)) == KEYS

#    @test @match jsonmodel[1] begin
#        IsObject(_) => true
#        _ => false
#    end
    
#    @test @match jsonmodel[6] begin
#        IsMorphism(_) => true
#        _ => false
#    end

#    model = Model(ThDecapode())
#    @match jsonmodel[1] begin
#        IsObject(content) => add_to_model!(model, content, ObTag())
#        _ => nothing
#    end

#    @test model.data["01936f2c-dba6-7c7b-8ec0-811bbe06bad4" ] == ModelElement(;name=:Form0, val=nothing)
    
#end

#we are trying to index `soln.u[t]` by `Ċ `, but only `C` is present. I think this is because we generating initial conditions based on what was specified to the `initial_conditions` parameter, whereas in the past we were using `infer_state_names` to obtain that.
#
## @testset "Simulation - Diffusion with Two Variables" begin

##     json_string = read(joinpath(@__DIR__, "test_jsons", "diffusion_data_twovars.json"), String);
##     @test Set(keys(JSON3.read(json_string))) == KEYS

##     system = PodeSystem(json_string);

##     simulator = evalsim(system.pode)
##     f = simulator(system.geometry.dualmesh, system.generate, DiagonalHodge())

##     soln = run_sim(f, system.init, 50.0, ComponentArray(k=0.5,)); 

##     @test soln.retcode == ReturnCode.Success
  
##     result = SimResult(soln, system);

##     @test typeof(result.state) == Dict{String, Vector{AbstractArray{SVector{3, Float64}}}}

##     jvs = JsonValue(result);

## end

#@testset "Parsing the Model JSON Object - Diffusion Long Trip" begin

#    data = open(JSON3.read, joinpath(@__DIR__, "test_jsons", "diffusion_long_trip.json"), "r")
#    jsondiagram = data[:diagram]
#    jsonmodel = data[:model]
#    @test Set(keys(data)) == KEYS

#    @test @match jsonmodel[1] begin
#        IsObject(_) => true
#        _ => false
#    end
    
#    @test @match jsonmodel[6] begin
#        IsMorphism(_) => true
#        _ => false
#    end

#    model = Model(ThDecapode())
#    @match jsonmodel[1] begin
#        IsObject(content) => add_to_model!(model, content, ObTag())
#        _ => nothing
#    end

#    @test model.data["01936ac6-d1c1-7db1-a3ca-b8678a75299c"] == ModelElement(;name=:Form0, val=nothing)
    
#end

## # GOOD
#@testset "Simulation - Diffusion Long Trip" begin

#    json_string = read(joinpath(@__DIR__, "test_jsons", "diffusion_long_trip.json"), String)
#    @test Set(keys(JSON3.read(json_string))) == KEYS

#    system = PodeSystem(json_string)

#    simulator = evalsim(system.pode)
#    f = simulator(system.geometry.dualmesh, default_dec_matrix_generate, DiagonalHodge())

#    # time
#    soln = run_sim(f, system.init, 50.0, ComponentArray(k=0.5,))

#    @test soln.retcode == ReturnCode.Success
  
#    result = SimResult(soln, system)

#    @test typeof(result.state) == Dict{String, Vector{AbstractArray{SVector{3, Float64}}}}

#    jv = JsonValue(result)

#end

model = Model(ThDecapode(), joinpath(@__DIR__, "test", "test_jsons", "model_dec.json"))

@testset "Simulation - Diffusivity Constant" begin

    json_string = read(joinpath(@__DIR__, "test_jsons", "diagram_diffusivity_constant.json"), String)
    system = PodeSystem(json_string)
    @info system

    simulator = evalsim(system.pode)
        
    f = simulator(system.geometry.dualmesh, system.generate, DiagonalHodge())

    soln = run_sim(f, system.init, 50.0, ComponentArray(k=0.5,))

    @test soln.retcode == ReturnCode.Success
 
    result = SimResult(soln, system)

    @test typeof(result.state) == Dict{String, Vector{AbstractArray{SVector{3, Float64}}}}

    jv = JsonValue(result)

end

# GOOD
@testset "Simulation - Navier-Stokes Vorticity" begin

    json_string = read(joinpath(@__DIR__, "test_jsons", "ns_vorticity.json"), String)
    @test Set(keys(JSON3.read(json_string))) == KEYS

    system = PodeSystem(json_string)

    simulator = evalsim(system.pode)
    
    f = simulator(system.geometry.dualmesh, system.generate, DiagonalHodge())

    soln = run_sim(f, system.init, 50.0, ComponentArray(k=0.5,))

    @test soln.retcode == ReturnCode.Success
 
    result = SimResult(soln, system);

    @test typeof(result.state) == Dict{String, Vector{AbstractArray{SVector{3, Float64}}}}

    jv = JsonValue(result)

end
