@testset "Simulation - ..." begin
    simulation = DecapodeSimulation("test/test_jsons/_payload.json")
    sim = evalsim(simulation[:pode]) 
    f = sim(simulation[:geometry].dualmesh, simulation[:generate], DiagonalHodge())
    soln = run(f, simulation, ComponentArray(k=0.5,))
    @test soln.retcode == ReturnCode.Success
    result = SimResult(soln, simulation)
end

# TODO not specifying initial boundary conditions for `B` on the front-end
# means that it will be automatically specified
@testset "Simulation - Navier-Stokes Vorticity" begin

    simulation = DecapodeSimulation("test/test_jsons/_navier_stokes_vorticity.json")
    sim = evalsim(simulation[:pode])
    f = sim(simulation[:geometry].dualmesh, simulation[:generate], DiagonalHodge())
    soln = run(f, simulation, ComponentArray(k=0.5,))
    @test soln.retcode == ReturnCode.Success
    result = SimResult(soln, system)
    @test typeof(result.state) == Dict{String, Vector{AbstractArray{SVector{3, Float64}}}}
    jv = JsonValue(result)
end
