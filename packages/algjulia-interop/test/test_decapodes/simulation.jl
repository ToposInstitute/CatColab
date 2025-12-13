const KEYS = Set([:mesh, :plotVariables, :initialConditions, :domain, :diagram, :model, :scalars, :duration])

@testset "Simulation - ..." begin
    simulation = DecapodesExt.DecapodeSimulation((@__DIR__)*"/data/diagrams/diffusivity_constant/diagram.json")
    sim = DecapodesExt.evalsim(simulation.pode) 
    f = sim(simulation.geometry.dualmesh, simulation.generate, DiagonalHodge())
    result = run(f, simulation, ComponentArray(k=0.5,))
    @test result.retcode == ReturnCode.Success
end

@testset "Simulation - Inverse Laplacian Longtrip" begin
    simulation = DecapodeSimulation(@__DIR__ * "data/inverse_laplacian_longtrip/diagram_analysis.json")
    sim = evalsim(simulation.pode) 
    f = sim(simulation.geometry.dualmesh, simulation.generate, DiagonalHodge())
    result = run(f, simulation, ComponentArray(k=0.5,))
    @test result.retcode == ReturnCode.Success
end

# TODO not specifying initial boundary conditions for `B` on the front-end
# means that it will be automatically specified
# @testset "Simulation - Navier-Stokes Vorticity" begin
#     payload = read("data/diagrams/ns_vort/analysis.json", String)
#     simulation = DecapodeSimulation(payload)
#     sim = evalsim(simulation.pode)
#     f = sim(simulation.geometry.dualmesh, simulation.generate, DiagonalHodge())
#     result = run(f, simulation, ComponentArray(k=0.5,))
#     @test result.retcode == ReturnCode.Success
#     @test typeof(result.state) == Dict{String, Vector{AbstractArray{SVector{3, Float64}}}}
# end
