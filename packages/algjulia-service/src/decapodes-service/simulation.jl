struct PodeSystem
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

function PodeSystem(json_string::String, args...)
    json_object = JSON3.read(json_string)
    PodeSystem(json_object, args...)
end

"""
Construct a `PodeSystem` object from a JSON string.
"""
function PodeSystem(json_object::AbstractDict, hodge=GeometricHodge())
    # make a model of the DEC, valued in Julia
    model = Model(ThDecapode(), json_object[:model])

    # this is a diagram in the model of the DEC. it wants to be a decapode!
    jsondiagram = json_object[:diagram]

    # any scalars?
    scalars = haskey(json_object, :scalars) ? json_object[:scalars] : []

    # pode, anons, and vars (UUID => ACSetId)
    decapode, anons, vars = Decapode(jsondiagram, model; scalars=scalars)
    dot_rename!(decapode)
    uuid2symb = uuid_to_symb(decapode, vars)

    # plotting variables
    plotvars = [uuid2symb[uuid] for uuid in json_object[:plotVariables]]
    
    # extract the domain in order to create the mesh, dualmesh
    geometry = Geometry(json_object)

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
    u0 = initial_conditions(json_object, geometry, uuid2symb)

    # symbol => uuid. we need this to reassociate the var 
    symb2uuid = Dict([v => k for (k,v) in pairs(uuid2symb)])

    # duration
    duration = json_object[:duration]

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

# getting something at a point, (x+1)*(i-1) + j
function to_idx(p::Tuple{Int,Int}, domain::Rectangle)
    (a, b) = p; (x, _) = indexing_bounds(domain) # TODO we can use `y` to check bounds
    a + b*x
end

# use Point2D
function to_point(idx::Int64, domain::Rectangle)
    (x, y) = indexing_bounds(domain)
    # first component is column, second component is row
    (idx % x, max(floor(idx/x), 0)) # TODO check for low indices
end

# TODO just separated this from the SimResult function and added type parameters, but need to generalize
function grid(pt3::Point3, grid_size::Vector{Int})
    pt2 = [(pt3[1]+1)/2, (pt3[2]+1)/2]
    [round(Int, pt2[1]*grid_size[1]), round(Int, pt2[2]*grid_size[2])]
end

function state_at_time(solution::ODESolution, domain::Sphere, var::Symbol, t::Int, points)
    l , _ = indexing_bounds(domain) # TODO this is hardcoded to return 100, 100
    northern_indices = filter(idx -> points[idx][3] > 0 && !isnothing(downsample(grid(points[idx], [l,l]))), keys(points))
    map(northern_indices) do idx
        x, y = grid(points[idx], [l, l]) # TODO
        SVector(x, y, getproperty(solution.u[t], var)[idx]) # TODO downsample if n ...
    end
end

function downsample(point::Vector{Int})
    m, n = 50, 50
    radius = 35; rate = 3;
    @match point begin
        [x, y] && if sqrt((x-m)^2 + (y-n)^2) ≤ radius end => point
        [x, y] && if sqrt((x-m)^2 + (y-n)^2) > radius && ((x % rate == 0) || (y % rate == 0)) end => point
        _ => nothing
    end
end
