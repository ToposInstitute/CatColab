# SIMULATION

using Distributions
using CombinatorialSpaces

function uuid_to_symb(decapode::SummationDecapode, vars::Dict{String, Int})
    Dict{String, Symbol}(key => (subpart(decapode, vars[key], :name)) for key ∈ keys(vars))
end

struct DecapodesSystem
    pode::SummationDecapode
    geometry::Geometry
    init::ComponentArray
    duration::Int
    generate::Any
    plotVariables::Dict{String, Any}
    uuiddict::Dict{Symbol, String}
end

mutable struct Operators
    operators::Dict{Symbol, Any}
    function Operators()
        new(Dict())
    end
end

Base.getindex(the::Operators, var::Symbol) = the.operators[var]

function (ops::Operators)(mesh::Any, symbol::Symbol; hodge=GeometricHodge())
    op = @match symbol begin
        :♭♯ => x -> ops[:♭♯_m] * x
        :Δ⁻¹ => x -> begin
            y = ops[:Δ0] \ x
            y .- minimum(y)
        end
        :wedge00 => (x,y) -> ops[:∧₀₀](x,y)
        op && if haskey(ops.operators, op) end => ops[op]
        _ => default_dec_matrix_generate(mesh, symbol, hodge)
    end
    return (args...) -> op(args...)
end

function default_initial_conditions(pode::SummationDecapode, sd)
    states = infer_states(pode)
    pairs = map(states) do v
        name = pode[v, :name]
        type = pode[v, :type]
        n = @match type begin
            :Form0     => nparts(sd, :V)
            :Form1     => nparts(sd, :E)
            :Form2     => nparts(sd, :Tri)
            :DualForm0 => nparts(sd, :Tri)
            :DualForm1 => nparts(sd, :E)
            :DualForm2 => nparts(sd, :V)
            :Literal   => 1
            :Constant  => 1
            _          => error("Unknown type $type for variable $name")
        end
        name => randn(Float64, n)  # random instead of zeros
    end
    ComponentArray(; pairs...)
end

# Luke Morris
function circle(n, c)
    mesh = EmbeddedDeltaSet1D{Bool, Point2D}()
    map(range(0, 2pi - (pi/(2^(n-1))); step=pi/(2^(n-1)))) do t
      add_vertex!(mesh, point=Point2D(cos(t),sin(t))*(c/2pi))
    end
    add_edges!(mesh, 1:(nv(mesh)-1), 2:nv(mesh))
    add_edge!(mesh, nv(mesh), 1)
    dualmesh = EmbeddedDeltaDualComplex1D{Bool, Float64, Point2D}(mesh)
    subdivide_duals!(dualmesh, Circumcenter())
    mesh,dualmesh
end

function klausmeier_initial_conditions(pode::SummationDecapode, dualmesh)
    n_dist = Normal(pi)
    n = [Distributions.pdf(n_dist, t)*(√(2pi))*7.2 + 0.08 - 5e-2 for t in range(0,2pi; length=ne(dualmesh))]
    
    w_dist = Normal(pi, 20)
    w = [Distributions.pdf(w_dist, t) for t in range(0,2pi; length=ne(dualmesh))]
    
    dX = dualmesh[:length]

    ComponentArray(n = n, w = w, Hydrodynamics_dX = dX)
end

function DecapodesSystem(pode::SummationDecapode)
    duration = 300
    # geometry = Geometry(PREDEFINED_MESHES[:Rectangle])

    s,sd = circle(9,500)
    geometry = Geometry(Constant,s,sd)    

    u0 = klausmeier_initial_conditions(pode, geometry.dualmesh)

    ops = Operators()
    ops.operators[:square_dual0] = x -> x.^2
    
    plotVariables = Dict("n" => true, "w" => false, "Hydrodynamics_dX" => false)

    return DecapodesSystem(pode, geometry, u0, duration, ops, plotVariables, Dict())
end

function DecapodesSystem(a::Types.Analysis; hodge=GeometricHodge())
    pode, vars = diagram_to_pode(a.model, a.diagram)
    analysis = a.analysis
    # @assert Set([:duration, :plotVariables, :domain, :mesh, :initialConditions, :scalars]) == keys(analysis)
  
    duration = analysis["duration"]
    plotVariables = Dict(key => key ∈ keys(vars) for key in analysis["plotVariables"])
    geometry = Geometry(analysis)

    # define the generate function
    ops = Operators()
    ops.operators[:♭♯_m] = ♭♯_mat(geometry.dualmesh)
    ops.operators[:Δ0] = Δ(0,geometry.dualmesh)
    # TODO we are fixing the hodge here
    ops.operators[:s0inv] = dec_inv_hodge_star(0, geometry.dualmesh, GeometricHodge())

    # dot_rename!(pode)
    uuid2symb = uuid_to_symb(pode, vars)

    # initial conditions
    u0 = initial_conditions(analysis["initialConditions"], geometry, uuid2symb)

    symb2uuid = Dict(v => k for (k, v) in pairs(uuid2symb))
    
    # return the system
    return DecapodesSystem(pode, geometry, u0, duration, ops, plotVariables, symb2uuid) 
end

function Base.show(io::IO, d::DecapodesSystem)
	show(io, "$(d.pode)")
end

points(system::DecapodesSystem) = system.geometry.dualmesh[:point]

""" This stores the result of the simulation. 
"""
struct SolutionResult
    soln::ODESolution    
    system::DecapodesSystem
end

function Base.run(system::DecapodesSystem; callback=nothing)::SolutionResult
    simulator = evalsim(system.pode; dimension=1)
    f = Base.invokelatest(simulator, system.geometry.dualmesh, system.generate, DiagonalHodge())
    # TODO remove ComponentArray
    prob = ODEProblem(f, system.init, system.duration, ComponentArray(Hydrodynamics_a=0.94,Hydrodynamics_k=182.5,Phytodynamics_m=0.45,))
    soln = solve(prob, Tsit5(), saveat=0.01; callback=callback)
    # soln
    SolutionResult(soln, system)
end

function Base.getindex(result::SolutionResult, state_var::Symbol, t::Int, nth=nothing)
    out = getproperty(result.soln.u[t], state_var)
    isnothing(nth) ? out : out[nth]
end
