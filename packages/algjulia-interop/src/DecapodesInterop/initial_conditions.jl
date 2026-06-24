## INITIAL CONDITIONS

const GAUSS_NORM = sqrt(2*pi)

"""
"""
abstract type AbstractInitialConditionSpec end

"""
"""
struct ConstantIC <: AbstractInitialConditionSpec
    value::Float64
end

function initial_condition(c::ConstantIC, geometry::Geometry{D}; f::Function=identity) where D
    fill(c.value, nparts(geometry.dualmesh, :V))
end

"""
"""
struct GaussianIC <: AbstractInitialConditionSpec
    mean::Vector{Float64}
    var::Diagonal{Float64, Vector{Float64}}
end

function initial_condition(g::GaussianIC, geometry::Geometry{Circle}; f::Function=identity)
    dist = Normal(pi)
    m(t) = Distribution.pdf(dist, t) * GAUSS_NORM |> f
    [m(t) for t in range(0, 2*pi; length=ne(geometry.dualmesh))]
end

function initial_condition(g::GaussianIC, geometry::Geometry{Rectangle}) end

"""  Taylor Vortices    
"""
@kwdef struct TaylorVortexIC <: AbstractInitialConditionSpec
    lat::Float64 = 0.2
    vortices::Int = 2
    p::AbstractVortexParams = TaylorVortexParams(0.5, 0.1)
end

function initial_condition(tv::TaylorVortexIC, geometry::Geometry{Sphere}; f::Function=identity, division=GeometricHodge())
    s0 = dec_hodge_star(0, geometry.dualmesh, division)
    X = vort_ring(ics, geometry)
    du = s0 * X
    du
end

vort_ring(tv::TaylorVortexIC, geometry::Geometry) = vort_ring(tv.d, tv.ξ.lat, tv.ξ.vortices, tv.ξ.p, geometry.dualmesh, taylor_vortex)

""" Takes a string, a domain, and a mesh and returns the initial conditios object associated to it.

Example:
```
associate("TaylorVortex", Sphere(6, 1.0), sd) == TaylorVortexIC(Sphere(6, 1.0), sd)
```
"""
function associate(str::String, geometry::Geometry)
   @match str begin
       "Constant" => ConstantIC()
       "Gaussian" => GaussianIC(geometry.domain)
       "TaylorVortex" => TaylorVortexIC(geometry.domain)
       _ => error("$str is not implemented")
   end
end

""" associates the values in a dictionary to their initial condition flags, and passes the output to initial_conditions
"""
function initial_conditions(ics::Dict{Symbol, String}, geometry::Geometry, uuid2symb::Dict{String, Symbol}) 
    dict = Dict(uuid2symb[string(uuid)] => associate(ic_specs[uuid], geometry) for uuid ∈ keys(uuid2symb) if uuid ∈ keys(ic_specs) )
    ic_dict = Dict(var => associate(ics[var], geometry) for var in keys(ics))
    # Now we have a mapping between variables and their initial condition specs.
    u0 = ComponentArray(; Dict(var => initial_condition(ic_dict[var], geometry) for var ∈ keys(ics))...)
    return u0
end
