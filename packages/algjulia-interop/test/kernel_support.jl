using Test

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

# ## load diagram
# modeljson = open(JSON3.read, joinpath(@__DIR__, "test_jsons", "models", "model_dec.json"), "r")
# model_dec = Model(ThDecapode(), modeljson)
# diagram_json = open(JSON3.read, joinpath(@__DIR__,  "test_jsons", "diagrams", "inverse_laplacian_longtrip", "diagram.json"), "r")
# diagram = Diagram(diagram_json[:notebook], model_dec)
# infer_types!(diagram.pode)
# @testset "Compression - Inverse Laplacian - Longtrip" begin
#     analysis_json = open(JSON3.read, joinpath(@__DIR__,  "test_jsons", "diagrams", "inverse_laplacian_longtrip", "analysis.json"), "r")
#     system = Analysis(analysis_json, diagram)
#     simulator = evalsim(system.pode)
#     f = simulator(system.geometry.dualmesh, system.generate, DiagonalHodge())
#     soln = run_sim(f, system.init, 50.0, ComponentArray(k=0.5,))
#     @test soln.retcode == ReturnCode.Success
#     result = SimResult(soln, system)
#     @test typeof(result.state) == Dict{String, Vector{AbstractArray{SVector{3, Float64}}}}
#     jv = JsonValue(result)

#     io = IOBuffer()
#     show(io, MIME("application/gzip"), jv)
#     b = take!(io)
#     @info length(b) / length(JSON3.write(jv))
# end



payloadjson = open(JSON3.read, joinpath(@__DIR__, "test_jsons", "payload.json"))
model = Model(ThDecapode(), payloadjson.model)
diagram = Diagram(payloadjson.diagram, model)
infer_types!(diagram.pode)
@testset "Compression - Diffusivity Constant" begin
    system = Analysis(ThDecapode(), payloadjson)
    # simulator = evalsim(system.pode)
    path = joinpath(@__DIR__, "testsim.jl")
    open(path, "w") do f
        write(f, string(gensim(system.pode)))
    end
    simulator = include(path)
    f = simulator(system.geometry.dualmesh, system.generate, DiagonalHodge())
    soln = run_sim(f, system.init, system.duration, ComponentArray(k=0.5,))
    @test soln.retcode == ReturnCode.Success
    result = SimResult(soln, system)
    @test typeof(result.state) == Dict{String, Vector{AbstractArray{SVector{3, Float64}}}}
    jv = JsonValue(result)

    io = IOBuffer()
    show(io, MIME("application/gzip"), jv)
    b = String(take!(io))
    # b = take!(io)
    @info length(b) / length(JSON3.write(jv))
end
