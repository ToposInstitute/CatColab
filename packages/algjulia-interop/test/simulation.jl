@testset "Simulation - ..." begin
    payload = read("test/test_jsons/_payload.json", String)
    simulation = DecapodeSimulation(payload)
    sim = evalsim(simulation.pode) 
    f = sim(simulation.geometry.dualmesh, simulation.generate, DiagonalHodge())
    result = run(f, simulation, ComponentArray(k=0.5,))
    @test result.retcode == ReturnCode.Success
end

@testset "Simulation - Inverse Laplacian Longtrip" begin
    payload = read("test/test_jsons/inverse_laplacian_longtrip/diagram_analysis.json")
    simulation = DecapodeSimulation(payload)
    sim = evalsim(simulation.pode) 
    f = sim(simulation.geometry.dualmesh, simulation.generate, DiagonalHodge())
    result = run(f, simulation, ComponentArray(k=0.5,))
    @test result.retcode == ReturnCode.Success
end

# TODO not specifying initial boundary conditions for `B` on the front-end
# means that it will be automatically specified
@testset "Simulation - Navier-Stokes Vorticity" begin
    payload = read("test/test_jsons/diagrams/ns_vort/analysis.json", String)
    simulation = DecapodeSimulation(payload)
    sim = evalsim(simulation.pode)
    f = sim(simulation.geometry.dualmesh, simulation.generate, DiagonalHodge())
    result = run(f, simulation, ComponentArray(k=0.5,))
    @test result.retcode == ReturnCode.Success
    @test typeof(result.state) == Dict{String, Vector{AbstractArray{SVector{3, Float64}}}}
end
