# SIMULATION

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
        _ => default_dec_matrix_generate(mesh, symbol, hodge)
    end
    return (args...) -> op(args...)
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

function Base.run(system::DecapodesSystem)::SolutionResult
    simulator = evalsim(system.pode)
    f = Base.invokelatest(simulator, system.geometry.dualmesh, system.generate, DiagonalHodge())
    # TODO remove ComponentArray
    prob = ODEProblem(f, system.init, system.duration, ComponentArray(k=0.5,))
    soln = solve(prob, Tsit5(), saveat=0.01)
    # soln
    SolutionResult(soln, system)
end

function Base.getindex(result::SolutionResult, state_var::Symbol, t::Int, nth=nothing)
    out = getproperty(result.soln.u[t], state_var)
    isnothing(nth) ? out : out[nth]
end
