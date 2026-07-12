# SIMULATION

const MAX_FRAMES = 1000

using SymbolicUtils: BasicSymbolic
using Distributions

using CombinatorialSpaces
using DiagrammaticEquations.ThDEC

function uuid_to_symb(decapode::SummationDecapode, vars::Dict{String, Int})
    Dict{String, Symbol}(key => (subpart(decapode, vars[key], :name)) for key ∈ keys(vars))
end

mutable struct DecapodesSystem
    const pode::SummationDecapode
    const statevars::Vector{BasicSymbolic}
    const geometry::Geometry
    const init::ComponentArray
    const duration::Int
    const generate::Any
    const plotVariables::Dict{String, Any}
    params::ComponentArray
end

mutable struct Operators
    operators::Dict{Symbol, Any}
    function Operators()
        new(Dict())
    end
end

Base.getindex(the::Operators, var::Symbol) = the.operators[var]

# TODO HasDeltaSet
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

const DEFAULT_DURATION = 10
const DEFAULT_CONSTANTS = ComponentArray()
const DEFAULT_ICS = Dict()


function symvar(pode::SummationDecapode, geometry::Geometry, var::Int)
    M = meshtype(geometry)
    t = SymbolicUtils.symtype(DECQuantity, pode[var, :type], M, dimension(M))
    SymbolicUtils.Sym{t}(subpart(pode, var, :name))
end

symvar(pode::SummationDecapode, geometry::Geometry, name::Symbol) =
    symvar(pode, geometry, only(incident(pode, name, :name)))

statevars(pode, geometry) = BasicSymbolic[symvar(pode, geometry, v) for v in parts(pode, :Var)]

function DecapodesSystem(pode::SummationDecapode; duration=DEFAULT_DURATION, mesh=nothing, constants=DEFAULT_CONSTANTS, ics=DEFAULT_ICS)
    
    geometry = Geometry(mesh)
    # TODO mesh params are not being consumed
    d = dimension(geometry)

    vars = statevars(pode, geometry)
    u0 = initial_conditions(ics, geometry)

    ops = Operators()
    ops.operators[:square_dual0] = x -> x.^2
    
    plotVariables = Dict("n" => true, "w" => false, "Hydrodynamics_dX" => false)

    return DecapodesSystem(pode, vars, geometry, u0, duration, ops, plotVariables, constants)
end

function Base.show(io::IO, d::DecapodesSystem)
	show(io, "$(d.pode)")
end

dimension(system::DecapodesSystem) = dimension(system.geometry)
points(system::DecapodesSystem) = system.geometry.dualmesh[:point]

""" This stores the result of the simulation. """
struct SolutionResult
    soln::ODESolution  
    system::DecapodesSystem
end

function Base.run(system::DecapodesSystem; callback=nothing)::SolutionResult
    simulator = evalsim(system.pode; dimension=dimension(system))
    f = Base.invokelatest(simulator, system.geometry.dualmesh, system.generate, GeometricHodge())
    prob = ODEProblem(f, system.init, system.duration, system.params)
    # dt = max(0.01, system.duration / MAX_FRAMES)
    soln = solve(prob, Tsit5(), saveat=0.01; callback=callback)
    # soln
    SolutionResult(soln, system)
end

function Base.getindex(result::SolutionResult, state_var::Symbol, t::Int, nth=nothing)
    out = getproperty(result.soln.u[t], state_var)
    isnothing(nth) ? out : out[nth]
end

# function DecapodesSystem(a::Types.Analysis; hodge=GeometricHodge())
#     pode, vars = diagram_to_pode(a.model, a.diagram)
#     analysis = a.analysis
#     # @assert Set([:duration, :plotVariables, :domain, :mesh, :initialConditions, :scalars]) == keys(analysis)
  
#     duration = analysis["duration"]
#     plotVariables = Dict(key => key ∈ keys(vars) for key in analysis["plotVariables"])
#     geometry = Geometry(analysis)

#     # define the generate function
#     ops = Operators()
#     ops.operators[:♭♯_m] = ♭♯_mat(geometry.dualmesh)
#     ops.operators[:Δ0] = Δ(0,geometry.dualmesh)
#     # TODO we are fixing the hodge here
#     ops.operators[:s0inv] = dec_inv_hodge_star(0, geometry.dualmesh, GeometricHodge())

#     # dot_rename!(pode)
#     uuid2symb = uuid_to_symb(pode, vars)

#     # initial conditions
#     u0 = initial_conditions(analysis["initialConditions"], geometry, uuid2symb)
    
#     # return the system
#     return DecapodesSystem(pode, geometry, u0, duration, ops, plotVariables) 
# end

# TODO this method exists until we send an Analysis JSON over
function DecapodesSystem(analysis::Types.Analysis)
    payload = analysis.analysis
    pode_src = payload["pode"]
    duration = Int(payload["duration"])

    tonum(v::Integer) = v
    tonum(v::Real) = isinteger(v) ? Int(v) : Float64(v)

    meshdata = Dict(Symbol(k) => tonum(v) for (k, v) in get(payload, "meshParams", Dict()))
    mesh = getproperty(DecapodesInterop, Symbol(payload["mesh"]))(; meshdata...)

    constants = ComponentArray(;
        (Symbol(k) => Float64(v) for (k, v) in get(payload, "constants", Dict()))...)

    mesh_type = typeof(mesh)
    valid_ics = MeshInfo(mesh_type).ics

    # this should be pode, vars = diagram_to_pode(analysis["pode"])
    pode = SummationDecapode(parse_decapode(Meta.parse("begin\n$pode_src\nend")))
    infer_types!(pode)

    geometry = Geometry(mesh)

    ic_entry(e::AbstractString) = (String(e), Dict{String,Any}())
    ic_entry(e::AbstractDict)   = (String(e["ic"]), get(e, "params", Dict{String,Any}()))
    
    # in DecapodesSystem(payload::AbstractDict), after `geometry = Geometry(mesh)`:
    ics = Dict{BasicSymbolic, AbstractInitialConditionSpec}()
    for (var, entry) in get(payload, "initialConditions", Dict())
        name, params = ic_entry(entry)
        ics[symvar(pode, geometry, Symbol(var))] = build_ic(name, params, mesh_type)
    end
        

    DecapodesSystem(pode; duration=duration, constants=constants, ics=ics, mesh=mesh)
end
