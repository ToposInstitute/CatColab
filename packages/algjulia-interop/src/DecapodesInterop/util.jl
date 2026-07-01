using InteractiveUtils: subtypes

spec(::Type{T}) where T = Dict(string.(fieldnames(T)) .=> string.(nameof.(fieldtypes(T))))

"""
    This contains the name of the initial conditions, its parameters, and a dictionary of defaults 
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
"""
    Iterates over the signatures of `initial_condition` methods.
"""
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
        haskey(info, base) || (info[base] = valtype(info)[])
        push!(info[base], (params = key, defaults = default_values(ic_type)))
    end
    info
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

function supported_options()
    mesh_types = subtypes(AbstractMeshSpec)

    mesh_info = Dict(map(mesh_types) do mesh
        string(nameof(mesh)) => MeshInfo(mesh)
    end)

    meshes = string.(nameof.(mesh_types))
    Dict(:meshes => meshes, :mesh_info => mesh_info, :ic_info => ic_info())
end
