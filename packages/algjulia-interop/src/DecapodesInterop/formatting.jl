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

# FORMATTER -----------------------------------------------------------------------------------

symvar_of(system, name::Symbol) = system.statevars[findfirst(v -> nameof(v) == name, system.statevars)]

"""
    Formats the result as simulated on an EmbeddedDeltaDualComplex1D
"""
function format(sd::EmbeddedDeltaDualComplex1D, result::SolutionResult)
    lengths = sd[:length]
    xcoords = cumsum(lengths) .- lengths
    nx = length(xcoords)
 
    plottable = [:n]

    # every variable has a vector of states indexed by time
    # each state is a vector parameterized by points on the simulation mesh
    state = Dict{String, Vector}()
    for var in plottable
        frames = map(result.soln.u) do u
            vals = getproperty(u, var)
            @assert length(vals) == nx "state :$var has length $(length(vals)), expected $nx (ne); is it a DualForm0 on this 1D mesh?"
            # (xIndex 0-based, yIndex, value)
            [(i - 1, 0, vals[i]) for i in 1:nx]
        end
        state[string(var)] = frames
    end
 
    Dict("time" => result.soln.t, "x" => xcoords, "y" => [0.0], "state" => state)
end
