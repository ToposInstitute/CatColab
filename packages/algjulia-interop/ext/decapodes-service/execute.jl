""" """
function Base.run(fm, sim::DecapodeSimulation, constparam)
    prob = ODEProblem(fm, sim.init, sim.duration, constparam)
    soln = solve(prob, Tsit5(), saveat=0.01)
    SimResult(soln, sim)
end

abstract type AbstractResult end

struct SimResult <: AbstractResult
    retcode::Enum{Int32} # ReturnCode
    time::Vector{Float64}
    state::Dict{String, Vector{AbstractArray{SVector{3, Float64}}}}
    x::Vector{Float64} # axis
    y::Vector{Float64}
end
export SimResult

function SimResult(soln::ODESolution, system::DecapodeSimulation)
    idx_bounds = indexing_bounds(system)
    state_val_dict = variables_state(soln, system) # Dict("UUID1" => VectorMatrixSVectr...)
    SimResult(soln.retcode, soln.t, state_val_dict, 0:idx_bounds.x, 0:idx_bounds.y)
end
# TODO generalize to HasDeltaSet

points(system::DecapodeSimulation) = collect(values(system.geometry.dualmesh.subparts.point.m))
indexing_bounds(system::DecapodeSimulation) = indexing_bounds(system.geometry.domain)

""" for the variables in a system, associate them to their state values over the duration of the simulation """
function variables_state(soln::ODESolution, system::DecapodeSimulation)
    plottedVars = [ k for (k, v) in system.plotVariables if v == true ]
    uuid2symb = Dict([ v => k for (k, v) in system.uuiddict]) # TODO why reverse again?
    Dict([ String(uuid2symb[var]) => state_entire_sim(soln, system, uuid2symb[var]) for var ∈ plottedVars ])
end

""" given a simulation, a domain, and a variable, gets the state values over the duration of a simulation. 
Called by `variables_state`[@ref] """
function state_entire_sim(soln::ODESolution, system::DecapodeSimulation, var::Symbol)
    map(1:length(soln.t)) do i
        state_at_time(soln, system, var, i)
    end
end

# TODO type `points`
function state_at_time(soln::ODESolution, system::DecapodeSimulation, plotvar::Symbol, t::Int)
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

