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

using StructEquality

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
export Geometry

# code specific to NS equations
include("ns_helper.jl")

# for specifying the initial conditions
include("initial_conditions.jl")
using .InitialConditions

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

    mesh_type = typeof(mesh)
    valid_ics = MeshInfo(mesh_type).ics

    function resolve_ic(name::String)
        hit = findfirst(ic -> ic.ic == name, valid_ics)
        isnothing(hit) && error("IC $name not valid for mesh $(nameof(mesh_type))")
        base = getproperty(DecapodesInterop, Symbol(name))
        p = valid_ics[hit].params
        isempty(p) ? base : base{p}
    end

    ics = map(params) do (k,v)
        m = match(r"initialConditions.(.+)", k)
        if isnothing(m)
            nothing
        else
            var = only(m.captures)
            Symbol(var) => resolve_ic(v)
        end
    end
    ics = Dict(filter(!isnothing, ics))
    
    pode = SummationDecapode(parse_decapode(Meta.parse("begin\n$pode\nend")))
    infer_types!(pode)
    DecapodesSystem(pode; duration=duration, constants=constants, ics=ics, mesh=mesh)
end


"""
    This contains the name of the initial conditions as well 
"""
@struct_hash_equal struct IC
    ic::String
    params::NamedTuple
    defaults::Dict
end

function IC(::Type{T}) where T
    params = T.parameters
    if isempty(params)
        IC(string(nameof(T)), (;params...), default_values(T))
    else
        IC(string(nameof(T)), (;only(params)...), default_values(T))
    end
end

struct MeshInfo{Mesh <: AbstractMeshSpec}
    # field names and their types
    specs::Dict{String, String}

    # mapping between geometry fields and their defaults
    # TODO embiggen to an Enum, later
    defaults::Dict{String, Number}

    # valid initial conditions
    ics::Vector{IC}
end

spec(::Type{T}) where T = Dict(string.(fieldnames(T)) .=> string.(nameof.(fieldtypes(T))))

# Walk `initial_condition` methods once. Each is (::IC, ::Geometry{Mesh}).
# Yield (ic_type, mesh_param) where mesh_param is a Type or a TypeVar.
function ic_method_sigs()
    sigs = Tuple{Any,Any}[]
    for m in methods(initial_condition, InitialConditions)
        params = Base.unwrap_unionall(m.sig).parameters
        length(params) >= 3 || continue
        geom = params[3]
        geom isa DataType && nameof(geom) === :Geometry || continue
        push!(sigs, (params[2], geom.parameters[1]))
    end
    sigs
end

# "GaussianIC" => [ (params=(dim=1,), defaults=…), (params=(dim=2,), defaults=…) ]
function ic_info()
    info = Dict{String, Vector{@NamedTuple{params::NamedTuple, defaults::Any}}}()
    for (ic_type, _) in ic_method_sigs()
        ic_type isa DataType || continue
        ps = ic_type.parameters
        key = if isempty(ps)
            NamedTuple()
        elseif length(ps) == 1 && only(ps) isa NamedTuple
            only(ps)
        else
            continue
        end
        base = string(nameof(ic_type))
        push!(get!(() -> valtype(info)[], info, base),
              (params = key, defaults = default_values(ic_type)))
    end
    info
end

function MeshInfo(mesh_type::Type{Mesh}) where Mesh <: AbstractMeshSpec
    specs = spec(mesh_type)
    defaults = Dict(string(k) => v for (k,v) in pairs(default_values(mesh_type)))
    ics = IC[]
    for (ic_type, meshparam) in ic_method_sigs()
        (meshparam isa TypeVar || meshparam === mesh_type) || continue
        push!(ics, IC(ic_type))
    end
    MeshInfo{Mesh}(specs, defaults, unique(ics))
end
     
using InteractiveUtils: subtypes
using .InitialConditions: default_values

function supported_options()
    mesh_types = subtypes(AbstractMeshSpec)

    mesh_info = Dict(map(mesh_types) do mesh
        string(nameof(mesh)) => MeshInfo(mesh)
    end)

    ic_types = subtypes(AbstractInitialConditionSpec)
    ics = string.(nameof.(initial_conditions))

    meshes = string.(nameof.(mesh_types))
    Dict(:meshes => meshes, :mesh_info => mesh_info, :ic_info => ic_info())
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
