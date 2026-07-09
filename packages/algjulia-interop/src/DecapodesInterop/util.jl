using InteractiveUtils: subtypes
import SymbolicUtils


const IC_REGISTRY = Dict{Type{<:AbstractMeshSpec}, Vector{Type{<:AbstractInitialConditionSpec}}}(
    Circle    => [ConstantIC, GaussianIC],
    Rectangle => [ConstantIC, GaussianIC],
    Icosphere => [ConstantIC, TaylorVortexIC],
)

function __validate_ic_registry()
    for (M, ics) in IC_REGISTRY, T in ics
        hasmethod(default_values, Tuple{Type{T}, Type{M}}) ||
            error("IC_REGISTRY declares $(nameof(T)) on $(nameof(M)) with no default_values")
    end
end


spec(::Type{T}) where T = Dict(string.(fieldnames(T)) .=> string.(nameof.(fieldtypes(T))))

@struct_hash_equal struct IC
    ic::String
    params::NamedTuple
    defaults::Dict
end

as_vector(v::AbstractVector)       = collect(float.(v))
as_vector(v::Diagonal)             = collect(float.(diag(v)))
as_vector(v::Number)               = Float64[v]
as_vector(p::AbstractVortexParams) = Float64[getfield(p, f) for f in fieldnames(typeof(p))]

from_vector(::AbstractVector, xs) = collect(Float64, xs)
from_vector(::Diagonal, xs)       = Diagonal(collect(Float64, xs))
from_vector(::Float64, xs)        = Float64(only(xs))
from_vector(::Int, xs)            = Int(only(xs))
from_vector(p::AbstractVortexParams, xs) = typeof(p)(xs...)

function ic_type(name::AbstractString, ::Type{M}) where {M<:AbstractMeshSpec}
    for T in get(IC_REGISTRY, M, Type[])
        string(nameof(T)) == name && return T
    end
    error("IC $name not valid for mesh $(nameof(M))")
end

function build_ic(name::AbstractString, params::AbstractDict, ::Type{M}) where {M<:AbstractMeshSpec}
    T = ic_type(name, M)
    default = default_values(T, M)
    filled = map(keys(default)) do k
        haskey(params, string(k)) ? from_vector(default[k], params[string(k)]) : default[k]
    end
    instantiate(T, NamedTuple{keys(default)}(filled))
end

function IC(::Type{T}, ::Type{M}) where {T<:AbstractInitialConditionSpec, M<:AbstractMeshSpec}
    d = default_values(T, M)
    IC(string(nameof(T)), NamedTuple(), Dict(string(k) => as_vector(v) for (k, v) in pairs(d)))
end

struct MeshInfo{Mesh <: AbstractMeshSpec}
    specs::Dict{String, String}
    defaults::Dict{String, Number}
    ics::Vector{IC}
end

function MeshInfo(::Type{Mesh}) where Mesh <: AbstractMeshSpec
    specs = spec(Mesh)
    defaults = Dict(string(k) => v for (k, v) in pairs(default_values(Mesh)))
    dim = dimension(Mesh)
    ics = [IC(T, Mesh) for T in get(IC_REGISTRY, Mesh, Type[])]
    MeshInfo{Mesh}(specs, defaults, ics)
end

function supported_options()
    mesh_types = subtypes(AbstractMeshSpec)
    mesh_info  = Dict(string(nameof(m)) => MeshInfo(m) for m in mesh_types)
    Dict(:mesh_info => mesh_info)
end

# """
#     Example:
#     ```julia
#         # IC(GaussianIC, Rectangle) =
#         IC("GaussianIC", (), Dict("mean" => [0.0], "var" => Diagonal([1.0])))
#         # IC(GaussianIC, Circle) =
#         IC("GaussianIC", (), Dict("mean" => [0.0, 0.0], "var" => Diagonal([1.0, 1.0]))) 
#     ```
# """
# ##
