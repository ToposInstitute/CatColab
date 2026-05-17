module DecapodesInterop

using ComponentArrays
using Distributions
using MLStyle
using StaticArrays
using LinearAlgebra
using OrdinaryDiffEq
using CoordRefSystems

using CombinatorialSpaces
using DiagrammaticEquations
import DiagrammaticEquations: SummationDecapode
using Decapodes
using ACSets

using CatColabInterop, Oxygen, HTTP, JSON3
import CatColabInterop: endpoint

struct ImplError <: Exception
    name::String
end
export ImplError
Base.showerror(io::IO, e::ImplError) = print(io, "$(e.name) not implemented")

# specifies the mesh
include("geometry.jl")

# code specific to NS equations
include("ns_helper.jl")

# for specifying the initial conditions
include("initial_conditions.jl")

# build the decapode
include("model_diagram.jl")

# for running the simulation
include("simulation.jl")

# for formatting the data into the correct return type
include("formatting.jl")

function endpoint(::Val{:Decapodes})
    @post "/decapodes" function (req::HTTP.Request)
        analysis = json(req, Analysis)
        system = DecapodesSystem(analysis)
        result = run(system)
    end
end

function endpoint(::Val{:DecapodesString})
    @post "/decapodes-string" function (req::HTTP.Request)
        j = JSON3.read(req.body)
        pode = j["pode"]
        pode = SummationDecapode(parse_decapode(Meta.parse("begin\n$pode\nend")))
        infer_types!(pode)
        system = DecapodesSystem(pode)
        result = run(system)
        # @info format(result)
        format(system.geometry.dualmesh, result)
    end
end

function endpoint(::Val{:DecapodesOptions})
    @get "/decapodes-options" function (req::HTTP.Request)
        supported_decapodes_geometries()
    end
end

function format(result::SolutionResult)
    sd = result.system.geometry.dualmesh
    points = sd[:point]

    xs = sort(unique(p[1] for p in points))
    ys = sort(unique(p[2] for p in points))
    xi = Dict(x => i-1 for (i, x) in enumerate(xs))  # 0-indexed for JS
    yi = Dict(y => i-1 for (i, y) in enumerate(ys))

    nv = nparts(sd, :V)
    plottable = [:n]
    # filter(keys(result.system.init)) do var
    #     length(getproperty(result.system.init, var)) == nv
    # end

    state = Dict{String, Vector}()
    for var in plottable
        frames = map(result.soln.u) do u
            vals = getproperty(u, var)
            [[xi[points[i][1]], yi[points[i][2]], vals[i]] for i in 1:nv]
        end
        state[string(var)] = frames
    end

    Dict(
        "time"  => result.soln.t,
        "x"     => xs,
        "y"     => ys,
        "state" => state,
    )
end

function format(sd::EmbeddedDeltaDualComplex1D, result::SolutionResult)
    lengths = sd[:length]                  # per-edge length, length == ne
    xcoords = cumsum(lengths) .- lengths   # arc length: [0, l1, l1+l2, ...]
    nx = length(xcoords)
 
    plottable = [:n]                       # exactly one: pde_plot asserts a single key
 
    state = Dict{String, Vector}()
    for var in plottable
        frames = map(result.soln.u) do u
            vals = getproperty(u, var)
            @assert length(vals) == nx "state :$var has length $(length(vals)), expected $nx (ne); is it a DualForm0 on this 1D mesh?"
            # (xIndex 0-based, yIndex, value); tuple keeps indices as integers in JSON
            [(i - 1, 0, vals[i]) for i in 1:nx]
        end
        state[string(var)] = frames
    end
 
    Dict(
        "time"  => result.soln.t,
        "x"     => xcoords,
        "y"     => [0.0],                  # single dummy row; space is 1D
        "state" => state,
    )
end




end # module
