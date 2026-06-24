module DecapodesInterop

using ComponentArrays
using Distributions
using MLStyle
using StaticArrays
using LinearAlgebra
using OrdinaryDiffEq
using CoordRefSystems
using DiffEqCallbacks

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

const progress_channel = Channel{Dict{String,Any}}(64)

function make_progress_callback(channel::Channel, tspan)
    t0, tf = tspan
    DiscreteCallback(
        (u, t, integrator) -> true,  # fire every step
        (integrator) -> begin
            frac = (integrator.t - t0) / (tf - t0)
            try
                push!(channel, Dict("t" => integrator.t, "progress" => frac))
            catch end  # channel closed
        end;
        save_positions = (false, false)
    )
end


# function endpoint(::Val{:DecapodesString})
#     @post "/decapodes-string" function (req::HTTP.Request)
#         j = JSON3.read(req.body)
#         pode = j["pode"]
#         pode = SummationDecapode(parse_decapode(Meta.parse("begin\n$pode\nend")))
#         infer_types!(pode)
#         system = DecapodesSystem(pode)

#         cb = make_progress_callback(progress_channel, system.tspan)
#         result = run(system; callback=cb)

#         # Signal completion
#         push!(progress_channel, Dict("progress" => 1.0, "done" => true))
        
#         format(system.geometry.dualmesh, result)
#     end
# end

function endpoint(::Val{:DecapodesString})
    @stream "/decapodes-string" function(stream::HTTP.Stream)
        req = stream.message
        uri = HTTP.URI(req.target)
        params = HTTP.queryparams(uri)

        pode = pop!(params, "pode")
        duration = parse(Int, pop!(params, "duration"))
        constants = ComponentArray(; (Symbol(k) => parse(Float64, v) for (k, v) in params)...)
        
        pode = SummationDecapode(parse_decapode(Meta.parse("begin\n$pode\nend")))
        infer_types!(pode)
        system = DecapodesSystem(pode; duration=duration)

        @info "Starting"
        HTTP.setheader(stream, "Content-Type" => "application/x-ndjson")
        HTTP.setheader(stream, "Access-Control-Allow-Origin" => "*")
        
        startwrite(stream)

        t0, tf = 0, system.duration
        @info "Duration set to $tf"
        last_write = Ref(time())

        write(stream, JSON3.write(Dict("status" => "initializing")) * "\n")
        flush(stream)

        cb = DiscreteCallback(
            (u, t, integrator) -> true,
            (integrator) -> begin
                now = time()
                if last_write[] == 0.0
                    write(stream, JSON3.write(Dict("status" => "running")) * "\n")
                end
                if now - last_write[] > 0.1
                    frac = clamp((integrator.t - t0) / (tf - t0), 0.0, 1.0)
                    @info "Writing progress" frac
                    write(stream, JSON3.write(Dict("progress" => frac)) * "\n")
                    if frac == 1.0
                        write(stream, JSON3.write(Dict("status" => "finalizing")) * "\n")
                    end  
                    flush(stream)
                    last_write[] = now
                end
            end;
            save_positions = (false, false)
        )

        result = run(system, constants; callback=cb)
        formatted = format(system.geometry.dualmesh, result)
        write(stream, JSON3.write(Dict("progress" => 1.0, "data" => formatted)) * "\n")
        closewrite(stream)
    end
end



using InteractiveUtils

""" Supported geometries, in the JSON format expected by the frontend. """
# function supported_decapodes_geometries()
#     mesh_tys = InteractiveUtils.subtypes(AbstractMeshSpec)
#     meshes = string.(nameof.(mesh_tys))
#     ms = methods(initial_condition)
#     @info ms
#     mesh_to_ics = Dict(map(mesh_tys) do mesh
#         @info methodswith(Geometry{mesh})
#         ics = map(intersect(methodswith(Geometry{mesh}), ms)) do m
#             ic = m.sig.parameters[2]
#             string(nameof(ic))
#         end
#         mesh = string(nameof(mesh))
#         mesh => ics
#     end)
#     @info mesh_to_ics
#     Dict(:meshes => meshes, :ics => mesh_to_ics)    
# end
# export supported_decapodes_geometries

function supported_decapodes_geometries()
    mesh_tys = subtypes(AbstractMeshSpec)
    meshes   = string.(nameof.(mesh_tys))
    ms       = methods(initial_condition)

    ics = Dict(map(mesh_tys) do mesh
        names = String[]
        for m in ms
            params = Base.unwrap_unionall(m.sig).parameters
            length(params) >= 3 || continue
            geom = params[3]
            geom isa DataType && nameof(geom) === :Geometry || continue
            meshparam = geom.parameters[1]
            if meshparam isa TypeVar || meshparam === mesh
                push!(names, string(nameof(params[2])))
            end
        end
        string(nameof(mesh)) => unique(names)
    end)

    Dict(:meshes => meshes, :ics => ics)
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
