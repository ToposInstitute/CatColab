"""
This is what is converted to JSON. 
"""
struct SimulationResult
    time::Vector{Float64}
    state::Dict{Symbol, Vector{AbstractArray{SVector{3, Float64}}}}
    x::Vector{Float64}
    y::Vector{Float64}
end

function Base.show(io::IO, res::SimulationResult)
  println(io, "Duration: $(length(res.time))")
  println(io, "State variables: $(keys(res.state))")
end

# """ Given a simulation, a domain, and a variable, gets the state values over the duration of a simulation. 
# Called by `var_to_state`[@ref] 

# ## Usage:

# result[:u] # = [result[i][:u] for i in 1:length(result.soln.t)]

# """
# function Base.getproperty(result::SolutionResult, var::Symbol)
#     [result.soln[i][var] for i in 1:length(result.soln.t)]
# end

# FORMATTER -----------------------------------------------------------------------------------

struct Projector{S<:Domain,T<:Domain}
    src::S # simulated on
    tgt::T # displayed on
end

function project(p::Projector, result::SolutionResult, var::Symbol)
    [project(p, result, var, t) for t in 1:length(result.soln.t)]
end

# TODO need a method for projecting without specifying time. this will substitute out the method above
    
function project(::Projector{Rectangle, Rectangle}, result::SolutionResult, var::Symbol, t::Int)
    (x, y) = indexing_bounds(result.system.geometry.domain)
    coord(i, j) = (x+1)*(i-1) + j
    # TODO scale
    [SVector(i, j, result[var, t, coord(i,j)]) for i in 1:x+1, j in 1:y+1]
end

indexing_bounds(p::Projector{Rectangle, Rectangle}) = indexing_bounds(p.tgt)

function project(p::Projector{Sphere, Rectangle}, result::SolutionResult, var::Symbol, t::Int)
    function grid(pt3::Point3, grid_size::Vector{Int})
        pt2 = [(pt3[1]+1)/2, (pt3[2]+1)/2]
        [round(Int, pt2[1]*grid_size[1]), round(Int, pt2[2]*grid_size[2])]
    end   
    pts = points(result.system)
    l , _ = indexing_bounds(p.tgt)
    northern_indices = filter(i -> pts[i][3] > 0, keys(pts))
    map(northern_indices) do n
        i, j = grid(pts[n], [l, l]) # TODO
        SVector(i, j, result[var, t, n])
    end
end

indexing_bounds(p::Projector{Sphere, Rectangle}) = indexing_bounds(p.tgt)

# -----

# TODO in the simple wedge case, we might want to simulate \dot{u} of \dot{u} = [u, v]
""" For the variables in a system, associate them to their state values over the duration of the simulation 
"""
function var_to_state(p::Projector, result::SolutionResult)
	Dict(var => project(p, result, var) for var in keys(result.system.init))
end

function SimulationResult(result::SolutionResult)
    p = Projector(result.system.geometry.domain, PREDEFINED_MESHES[:Rectangle]) # TODO frontend should let us choose
    idx_bounds = indexing_bounds(p.tgt)
    var_to_formatted_state = var_to_state(p, result) # Dict("UUID1" => VectorMatrixSVectr...)
    SimulationResult(result.soln.t, var_to_formatted_state, 0:idx_bounds.x, 0:idx_bounds.y)
end
