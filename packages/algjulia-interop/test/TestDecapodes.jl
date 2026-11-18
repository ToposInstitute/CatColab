# module TestDecapodes

using CatColabInterop
using ComponentArrays: ComponentArray

D = CatColabInterop.DecapodesInterop

using ComponentArrays
using HTTP, Test, Oxygen, JSON3

include("plotting.jl")

body = read((@__DIR__)*"/data/diagrams/heat-eq.json", String)
analysis = JSON3.read(body, Analysis)
system = D.DecapodesSystem(analysis);
res = run(system)
D.SimulationResult(res)

# TODO derive plot variable from system
record_gif(HeatEquation, "build/heat_eq.gif", res, Symbol("u"))

# Parse the JSON
#---------------
# @testset "Analysis - Simple Wedge" begin

body = read((@__DIR__)*"/data/diagrams/ns-vorticity.json", String)
analysis = JSON3.read(body, Analysis)
system = D.DecapodesSystem(analysis);
res = run(system)
D.SimulationResult(res)

record_gif(VorticityFc, "build/taylor.gif", res, Symbol("dv"))

# end

# Optinally test the endpoint if running endpoint.jl
# resp = HTTP.post("http://127.0.0.1:8080/decapodes"; body)
# @test resp.status == 200

# it does not infer 5
# @testset "Analysis - Navier-Stokes Vorticity" begin

#     body = read((@__DIR__)*"/data/diagrams/ns-vorticity.json", String)
#     analysis = JSON3.read(body, Analysis)
#     system = D.DecapodesSystem(analysis)
#     simulator = D.evalsim(system.pode)
#     f = simulator(system.geometry.dualmesh, system.generate, D.DiagonalHodge())
#     soln = D.run_sim(f, system.init, system.duration, ComponentArray(k=0.5,))
    
#     result = D.SimulationResult(soln, system);

# end




# end
