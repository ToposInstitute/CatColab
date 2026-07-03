using InteractiveUtils: subtypes
import SymbolicUtils

spec(::Type{T}) where T = Dict(string.(fieldnames(T)) .=> string.(nameof.(fieldtypes(T))))

"""
Name of an initial condition and its default parameter values. `defaults` maps each
parameter name to a numeric vector, matching the frontend's vector-valued fields.
`params` is retained for the frontend schema but is always empty now that IC specs
are no longer type-parameterized.
"""
@struct_hash_equal struct IC
    ic::String
    params::NamedTuple
    defaults::Dict
end

# ---- flatten a default value into the frontend's `number[]` shape ----
as_vector(v::AbstractVector)       = collect(float.(v))
as_vector(v::Diagonal)             = collect(float.(diag(v)))
as_vector(v::Number)               = Float64[v]
as_vector(p::AbstractVortexParams) = Float64[getfield(p, f) for f in fieldnames(typeof(p))]

"""
    Example:
    ```julia
        # IC(GaussianIC, Rectangle) =
        IC("GaussianIC", (), Dict("mean" => [0.0], "var" => Diagonal([1.0])))
        # IC(GaussianIC, Circle) =
        IC("GaussianIC", (), Dict("mean" => [0.0, 0.0], "var" => Diagonal([1.0, 1.0]))) 
    ```
"""
function IC(::Type{T}, dimension::Int) where T
    d = default_values(T, dimension)
    IC(string(nameof(T)), NamedTuple(), Dict(string(k) => as_vector(v) for (k, v) in pairs(d)))
end

function unwrap_sym(T)
    U = Base.unwrap_unionall(T)
    U isa DataType && nameof(U) === :BasicSymbolic || begin
        @info "RETURNING FIRST: $U"
        return nothing
    end
    form = U.parameters[1]
    form isa DataType && length(form.parameters) >= 3 || begin
        # THIS RETURNS BECAUSE <:DECQuantity
        return nothing
    end
    form.parameters[3]
end

# Walk `initial_condition` methods once, yielding (ic_spec_type, mesh_or_nothing).
# Signature layout: Tuple{typeof(initial_condition), var, ic, geometry}.
function ic_method_sigs()
    sigs = Tuple{DataType,Any}[]
    for m in methods(initial_condition)
        fname, vartype, ic, geometry = Base.unwrap_unionall(m.sig).parameters
        push!(sigs, (ic, unwrap_sym(vartype)))
    end
    sigs
end

struct MeshInfo{Mesh <: AbstractMeshSpec}
    specs::Dict{String,String}      # field name => type name
    defaults::Dict{Symbol,Number}   # mesh field => default value
    ics::Vector{IC}                 # ICs valid on this mesh
end

function MeshInfo(::Type{Mesh}) where Mesh <: AbstractMeshSpec
    specs = spec(Mesh)
    defaults = default_values(Mesh)
    ics = IC[]
    for (ic_type, mesh) in ic_method_sigs()
        (mesh === nothing || mesh === Mesh) || continue
        ic = IC(ic_type, dimension(Mesh))
        push!(ics, ic)
    end
    MeshInfo{Mesh}(specs, defaults, unique(ics))
end


function supported_options()
    mesh_types = subtypes(AbstractMeshSpec)
    mesh_info  = Dict(string(nameof(m)) => MeshInfo(m) for m in mesh_types)
    Dict(:meshes => string.(nameof.(mesh_types)), :mesh_info => mesh_info)
end
