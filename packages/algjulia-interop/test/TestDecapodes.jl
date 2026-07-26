# module TestDecapodes

using CatColabInterop
using ComponentArrays: ComponentArray

D = CatColabInterop.DecapodesInterop

using ComponentArrays
using HTTP, Test, Oxygen, JSON3



# Meshes
dvs = D.default_values(D.Circle)
@test dvs.n == 9
@test dvs.c == 500
circle = D.Circle(dvs...)
geometry = D.Geometry(circle)

dvs = D.default_values(D.Icosphere)
@test dvs.order == 6
@test dvs.radius == 1.0
ico = D.Icosphere(dvs...)
geometry = D.Geometry(ico)

# Initial Conditions


# include("plotting.jl")

# body = read((@__DIR__)*"/data/diagrams/heat-eq.json", String)
# analysis = JSON3.read(body, Analysis)
# system = D.DecapodesSystem(analysis);
# res = run(system)
# D.SimulationResult(res)

# TODO derive plot variable from system
# record_gif(HeatEquation, "build/heat_eq.gif", res, Symbol("u"))

# Parse the JSON
#---------------
# @testset "Analysis - Simple Wedge" begin

# body = read((@__DIR__)*"/data/diagrams/ns-vorticity.json", String)
# analysis = JSON3.read(body, Analysis)
# system = D.DecapodesSystem(analysis);
# res = run(system)
# D.SimulationResult(res)

# record_gif(VorticityFc, "build/taylor.gif", res, Symbol("dv"))

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


d = Dict{String, Any}("duration" => 50, "constants" => Dict{String, Any}("Phytodynamics_m" => 0.45, "Hydrodynamics_k" => 182.5, "Hydrodynamics_a" => 0.94), "meshParams" => Dict{String, Any}("c" => 500, "n" => 9), "mesh" => "Circle", "pode" => "\tn::DualForm0\n\tw::DualForm0\n\tHydrodynamics_a::Constant\n\tHydrodynamics_k::Constant\n\tHydrodynamics_dX::Form1\n\tPhytodynamics_m::Constant\n\n\tHydrodynamics_x0 == -(Hydrodynamics_a, w)\n\tHydrodynamics_x1 == square_dual0(n)\n\tHydrodynamics_x2 == *(w, Hydrodynamics_x1)\n\tHydrodynamics_x3 == -(Hydrodynamics_x0, Hydrodynamics_x2)\n\tHydrodynamics_x4 == L(Hydrodynamics_dX, w)\n\tHydrodynamics_x5 == *(Hydrodynamics_k, Hydrodynamics_x4)\n\tHydrodynamics_x6 == +(Hydrodynamics_x3, Hydrodynamics_x5)\n\tHydrodynamics_x6 == ∂ₜ(w)\n\tPhytodynamics_y0 == square_dual0(n)\n\tPhytodynamics_y1 == *(w, Phytodynamics_y0)\n\tPhytodynamics_y2 == *(Phytodynamics_m, n)\n\tPhytodynamics_y3 == -(Phytodynamics_y1, Phytodynamics_y2)\n\tPhytodynamics_y4 == Δ(n)\n\tPhytodynamics_y5 == +(Phytodynamics_y3, Phytodynamics_y4)\n\tPhytodynamics_y5 == ∂ₜ(n)", "initialConditions" => Dict{String, Any}("Hydrodynamics_dX" => Dict{String, Any}("ic" => "GaussianIC", "params" => Dict{String, Any}()), "w" => Dict{String, Any}("ic" => "GaussianIC", "params" => Dict{String, Any}()), "n" => Dict{String, Any}("ic" => "GaussianIC", "params" => Dict{String, Any}())))

res = D.DecapodesSystem(d)
@info res


# end
