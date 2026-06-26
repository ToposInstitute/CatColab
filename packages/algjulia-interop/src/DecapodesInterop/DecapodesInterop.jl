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

using ..Defaults
using CatColabInterop, Oxygen, HTTP, JSON3, URIs
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

function make_progress_callback(stream::HTTP.Stream, tspan)
    t0, tf = tspan
    last_write = Ref(time())
    DiscreteCallback(
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
end

function endpoint(::Val{:DecapodesString})
    @stream "/decapodes-string" function(stream::HTTP.Stream)
        req = stream.message
        uri = HTTP.URI(req.target)

        system, params = DecapodesSystem(uri)

        @info "Starting"
        HTTP.setheader(stream, "Content-Type" => "application/x-ndjson")
        HTTP.setheader(stream, "Access-Control-Allow-Origin" => "*")
        
        startwrite(stream)

        write(stream, JSON3.write(Dict("status" => "initializing")) * "\n")
        flush(stream)

        callback = make_progress_callback(stream, (0, system.duration))

        result = run(system, params; callback=callback)
        formatted = format(system.geometry.dualmesh, result)
        write(stream, JSON3.write(Dict("progress" => 1.0, "data" => formatted)) * "\n")
        closewrite(stream)
    end
end

# TODO this is just here until we can elaborate a diagram fully.
function DecapodesSystem(uri::URIs.URI)
    params = HTTP.queryparams(uri)
    pode = pop!(params, "pode")
    duration = parse(Int, pop!(params, "duration"))
    mesh = pop!(params, "mesh")
    params = collect(params)

    meshdata = map(params) do (k, v)
        m = match(r"mesh.(.+)", k)
        if isnothing(m)
            nothing
        else
            Symbol(only(m.captures)) => try
                parse(Int64, v)
            catch
                parse(Float64, v)
            end
        end
    end
    meshdata = filter(!isnothing, meshdata)
    mesh = getproperty(DecapodesInterop, Symbol(mesh))
    mesh = mesh(;meshdata...)
    
    constants = map(enumerate(params)) do (i, (k,v))
        m = match(r"constants\.(.+)", k)
        if isnothing(m)
            nothing
        else
            Symbol(only(m.captures)) => parse(Float64, v)
        end
    end
    constants = ComponentArray(; filter(!isnothing, constants)...)

    ics = map(params) do (k,v)
        m = match(r"initialConditions.(.+)", k)
        if isnothing(m)
            nothing
        else
            var = only(m.captures)
            Symbol(var) => getproperty(DecapodesInterop, Symbol(v))
        end
    end
    ics = Dict(filter(!isnothing, ics))
    
    pode = SummationDecapode(parse_decapode(Meta.parse("begin\n$pode\nend")))
    infer_types!(pode)
    DecapodesSystem(pode; duration=duration, constants=constants, ics=ics, mesh=mesh)
end

struct MeshInfo{Mesh <: AbstractMeshSpec}
    # field names and their types
    specs::Dict{String, String}

    # mapping between geometry fields and their defaults
    # TODO embiggen to an Enum, later
    defaults::Dict{String, Number}

    # valid initial conditions
    ics::Vector{String}
end

function spec(::Type{T}) where T
    Dict(string.(fieldnames(T)) .=> string.(nameof.(fieldtypes(T))))
end

struct IC
    ic::String
    params::Vector{Any}
end

function IC(::Type{T}) where T
    name = string(nameof(T))
    IC(name, [T.parameters...])
end

function MeshInfo(mesh_type::Type{Mesh}) where Mesh <: AbstractMeshSpec
    specs = spec(mesh_type)
    defaults = Dict(string(k) => v for (k,v) in pairs(default_values(mesh_type)))

    # Initial Conditions
    ic_methods = methods(initial_condition)
    names = String[]
    for m in ic_methods
        params = Base.unwrap_unionall(m.sig).parameters
        length(params) >= 3 || continue

        ic = IC(params[2])
        @info default_values(params[2])

        # parse the signature for Geometric data
        geom = params[3]
        geom isa DataType && nameof(geom) === :Geometry || continue
        meshparam = geom.parameters[1]
        if meshparam isa TypeVar || meshparam === mesh_type
            push!(names, string(nameof(params[2])))
        end
    end
    ics = unique(names)
    
    MeshInfo{Mesh}(specs, defaults, ics)
end
     
using InteractiveUtils: subtypes

function supported_options()
    mesh_types = subtypes(AbstractMeshSpec)
    meshes = string.(nameof.(mesh_types))

    mesh_info = Dict(map(mesh_types) do mesh
        string(nameof(mesh)) => MeshInfo(mesh)
    end)

    ic_types = subtypes(AbstractInitialConditionSpec)
    ics = string.(nameof.(initial_conditions))
    


    # TS should receive a string which it knows how to interpret into a component. So
    # "AbstractVortexParams" should be interpereted into a table
    # ic_info = Dict(map(ic_types) do ic
    #     string(nameof(ic)) => typeof(ic) == UnionAll ? default_values(ic{1}) : default_values(ic)
    # end)

    Dict(:meshes => meshes, :mesh_info => mesh_info)
end

function endpoint(::Val{:DecapodesOptions})
    @get "/decapodes-options" function (req::HTTP.Request)
        supported_options()
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
