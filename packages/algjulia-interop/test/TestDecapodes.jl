module TestDecapodes

using CatColabInterop
using DiagrammaticEquations, Decapodes, ACSets, CombinatorialSpaces, ComponentArrays, StaticArrays, LinearAlgebra, Distributions

using HTTP, Test, Oxygen, JSON3

const DecapodesExt = Base.get_extension(CatColabInterop, :DecapodesExt)

body = read((@__DIR__)*"/data/diagrams/simple-wedge.json", String)

# Parse the JSON
#---------------
@testset "Analysis - Simple Wedge" begin
    body = read((@__DIR__)*"/data/diagrams/simple-wedge.json", String)
    analysis = JSON3.read(body, Analysis)
    system = DecapodesExt.DecapodesSystem(analysis)
    simulator = evalsim(system.pode)
    f = simulator(system.geometry.dualmesh, system.generate, DiagonalHodge())
    soln = DecapodesExt.run_sim(f, system.init, system.duration, ComponentArray(k=0.5,))
    result = DecapodesExt.SimulationResult(soln, system)
end

# Optinally test the endpoint if running endpoint.jl
resp = HTTP.post("http://127.0.0.1:8080/decapodes"; body)
@test resp.status == 200

end
