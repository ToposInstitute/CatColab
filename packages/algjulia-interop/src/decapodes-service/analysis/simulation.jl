struct PodeSystem <: AbstractAnalysis{ThDecapode}
    pode::SummationDecapode
    plotvar::Vector{Symbol}
    scalars::Dict{Symbol, Any} # closures
    geometry::Geometry
    init::ComponentArray
    generate::Any
    uuiddict::Dict{Symbol, String}
    duration::Int
end
export PodeSystem

""" Constructs an analysis from the diagram of a Decapode Model"""
function Analysis(analysis::JSON3.Object, diagram::DecapodeDiagram, hodge=GeometricHodge())
  
    # TODO want a safer way to get this information
    content = analysis[:notebook][:cells][1][:content][:content]

    domain = content[:domain]
    duration = content[:duration]
    initialConditions = content[:initialConditions]
    mesh = content[:mesh]
    plotVars = content[:plotVariables]
    scalars = content[:scalars]

    dot_rename!(diagram.pode)
    uuid2symb = uuid_to_symb(diagram.pode, diagram.vars)
    
    geometry = Geometry(content)

    ♭♯_m = ♭♯_mat(geometry.dualmesh)
    wedge_dp10 = dec_wedge_product_dp(Tuple{1,0}, geometry.dualmesh)
    dual_d1_m = dec_mat_dual_differential(1, geometry.dualmesh)
    star0_inv_m = dec_mat_inverse_hodge(0, geometry.dualmesh, hodge)
    Δ0 = Δ(0,geometry.dualmesh)
    #fΔ0 = factorize(Δ0);
    function sys_generate(s, my_symbol, hodge=hodge)
        op = @match my_symbol begin
            sym && if sym ∈ keys(anons) end => anons[sym]
            :♭♯ => x -> ♭♯_m * x # [1]
            :dpsw => x -> wedge_dp10(x, star0_inv_m[1]*(dual_d1_m[1]*x))
            :Δ⁻¹ => x -> begin
                y = Δ0 \ x
                y .- minimum(y)
            end 
            _ => default_dec_matrix_generate(s, my_symbol, hodge)
        end
        return (args...) -> op(args...)
    end

    @info uuid2symb
    u0 = initial_conditions(initialConditions, geometry, uuid2symb)

    # reversing `uuid2symb` into `symbol => uuid.` we need this to reassociate the var to its UUID 
    symb2uuid = Dict([v => k for (k,v) in pairs(uuid2symb)])

    return PodeSystem(decapode, plotvars, anons, geometry, u0, sys_generate, symb2uuid, duration)
end
export Analysis

function PodeSystem(json_string::String, args...)
    analysis = JSON3.read(json_string)
    PodeSystem(analysis[:notebook], args...)
end

"""
Construct a `PodeSystem` object from a JSON string.
"""
function PodeSystem(analysis::JSON3.Object, model::Model{ThDecapode}, hodge=GeometricHodge())

    # any scalars?
    scalars = []
    # scalars = haskey(analysis[:notebook], :scalars) ? analysis[:scalars] : []

    # this is a diagram in the model of the DEC. it wants to be a decapode!
    # pode, anons, and vars (UUID => ACSetId)
    decapode, anons, vars = Diagram(analysis, model; scalars=scalars)
    dot_rename!(decapode)
    uuid2symb = uuid_to_symb(decapode, vars)

    # plotting variables
    plotvars = []
    # plotvars = [uuid2symb[uuid] for uuid in analysis[:plotVariables]]
    
    # extract the domain in order to create the mesh, dualmesh
    geometry = Geometry(analysis)

    # initialize operators
    ♭♯_m = ♭♯_mat(geometry.dualmesh)
    wedge_dp10 = dec_wedge_product_dp(Tuple{1,0}, geometry.dualmesh)
    dual_d1_m = dec_mat_dual_differential(1, geometry.dualmesh)
    star0_inv_m = dec_mat_inverse_hodge(0, geometry.dualmesh, hodge)
    Δ0 = Δ(0,geometry.dualmesh)
    #fΔ0 = factorize(Δ0);
    function sys_generate(s, my_symbol, hodge=hodge)
        op = @match my_symbol begin
            sym && if sym ∈ keys(anons) end => anons[sym]
            :♭♯ => x -> ♭♯_m * x # [1]
            :dpsw => x -> wedge_dp10(x, star0_inv_m[1]*(dual_d1_m[1]*x))
            :Δ⁻¹ => x -> begin
                y = Δ0 \ x
                y .- minimum(y)
            end 
            _ => default_dec_matrix_generate(s, my_symbol, hodge)
        end
        return (args...) -> op(args...)
    end
    # end initialize

    # initial conditions
    u0 = initial_conditions(analysis, geometry, uuid2symb)

    # symbol => uuid. we need this to reassociate the var 
    symb2uuid = Dict([v => k for (k,v) in pairs(uuid2symb)])

    # duration
    duration = analysis[:duration]

    return PodeSystem(decapode, plotvars, anons, geometry, u0, sys_generate, symb2uuid, duration)
end
export PodeSystem

points(system::PodeSystem) = collect(values(system.geometry.dualmesh.subparts.point.m))
indexing_bounds(system::PodeSystem) = indexing_bounds(system.geometry.domain)

function run_sim(fm, u0, t0, constparam)
    prob = ODEProblem(fm, u0, (0, t0), constparam)
    soln = solve(prob, Tsit5(), saveat=0.01)
end
export run_sim

struct SimResult
    time::Vector{Float64}
    state::Dict{String, Vector{AbstractArray{SVector{3, Float64}}}}
    x::Vector{Float64} # axis
    y::Vector{Float64}
end
export SimResult

function SimResult(soln::ODESolution, system::PodeSystem)
    idx_bounds = indexing_bounds(system)
    state_val_dict = variables_state(soln, system) # Dict("UUID1" => VectorMatrixSVectr...)
    SimResult(soln.t, state_val_dict, 0:idx_bounds.x, 0:idx_bounds.y)
end
# TODO generalize to HasDeltaSet

""" for the variables in a system, associate them to their state values over the duration of the simulation """
function variables_state(soln::ODESolution, system::PodeSystem)
    Dict([ system.uuiddict[var] => state_entire_sim(soln, system, var) for var ∈ system.plotvar ])
end

""" given a simulation, a domain, and a variable, gets the state values over the duration of a simulation. 
Called by `variables_state`[@ref] """
function state_entire_sim(soln::ODESolution, system::PodeSystem, var::Symbol)
    map(1:length(soln.t)) do i
        state_at_time(soln, system, var, i)
    end
end

# TODO type `points`
function state_at_time(soln::ODESolution, system::PodeSystem, plotvar::Symbol, t::Int)
    @match system.geometry.domain begin
        # TODO check time indexing here
        domain::Rectangle => state_at_time(soln, domain, plotvar, t) 
        domain::Sphere => state_at_time(soln, domain, plotvar, t, points(system)) 
        _ => throw(ImplError("state_at_time function for domain $domain"))
    end
end

function state_at_time(soln::ODESolution, domain::Rectangle, var::Symbol, t::Int)
    (x, y) = indexing_bounds(domain)
    [SVector(i, j, getproperty(soln.u[t], var)[(x+1)*(i-1) + j]) for i in 1:x+1, j in 1:y+1]
end

# TODO just separated this from the SimResult function and added type parameters, but need to generalize
function grid(pt3::Point3, grid_size::Vector{Int})
    pt2 = [(pt3[1]+1)/2, (pt3[2]+1)/2]
    [round(Int, pt2[1]*grid_size[1]), round(Int, pt2[2]*grid_size[2])]
end

function state_at_time(soln::ODESolution, domain::Sphere, var::Symbol, t::Int, points)
    l , _ = indexing_bounds(domain) # TODO this is hardcoded to return 100, 100
    northern_indices = filter(i -> points[i][3] > 0, keys(points)) 
    map(northern_indices) do n
        i, j = grid(points[n], [l, l]) # TODO
        SVector(i, j, getproperty(soln.u[t], var)[n])
    end
end

