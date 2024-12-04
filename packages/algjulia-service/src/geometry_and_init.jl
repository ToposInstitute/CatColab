## INTEROP

""" Supported domains. """
const domain_names = [:Plane, :Sphere]

""" Mapping from supported domains to meshes for the domain. """
const mesh_names = Dict(
    :Plane => [:Rectangle, :Periodic],
    :Sphere => [:Icosphere6, :Icosphere7, :Icosphere8, :UV],
)

""" Mapping from supported domains to initial/boundary conditions. """
const initial_condition_names = Dict(
    :Plane => [:Gaussian],
    :Sphere => [:TaylorVortex, :SixVortex],
)

""" Supported geometries, in the JSON format expected by the frontend. """
function supported_decapodes_geometries()
    domains = map(domain_names) do domain
        Dict(
            :name => domain,
            :meshes => mesh_names[domain],
            :initialConditions => initial_condition_names[domain],
        )
    end
    Dict(:domains => domains)
end
export supported_decapodes_geometries

## GEOMETRY

abstract type Domain end

# meshes associated with Planes
@data Planar <: Domain begin
    Rectangle(max_x::Int, max_y::Int, dx::Float64, dy::Float64)
    Periodic # TODO
end

Rectangle() = Rectangle(500, 5000, 1, 1);

middle(r::Rectangle) = [r.max_x/2, r.max_y/2]

# meshes associated with Spheres
@data Spheric <: Domain begin
    Sphere(dim::Int, radius::Float64)
    UV(minlat::Int, maxlat::Int, dlat::Float64, minlong::Int, maxlong::Int, dlong::Float64, radius::Float64)
end

Sphere(dim) = Sphere(dim, 1.0)
UV() = UV(0, 180, 2.5, 0, 360, 2.5, 1.0)
# TODO need default method for UV

""" helper function for UV """
function makeSphere(m::UV)
    makeSphere(m.minlat, m.maxlat, m.dlat, m.minlong, m.maxlong, m.dlong, m.radius)
end

function create_mesh end; export create_mesh

function create_mesh(d::Domain, args...)
    throw(ImplError("The mesh ($(d)) is"))
end

function create_mesh(r::Rectangle, division::SimplexCenter=Circumcenter())
    s = triangulated_grid(r.max_x, r.max_y, r.dx, r.dy, Point2{Float64})
    sd = EmbeddedDeltaDualComplex2D{Bool, Float64, Point2{Float64}}(s)
    subdivide_duals!(sd, division)
    return (s, sd)
end

# function create_mesh(r::Periodic, division::SimplexCenter=Circumcenter()) end

function create_mesh(m::Sphere, division::SimplexCenter=Circumcenter())
    s = loadmesh(Icosphere(m.dim, m.radius));
    sd = EmbeddedDeltaDualComplex2D{Bool, Float64, Point3{Float64}}(s)
    subdivide_duals!(sd, division)
    return (s, sd)
end

function create_mesh(m::UV, division::SimplexCenter=Circumcenter())
    s, _, _ = makeSphere(m);
    sd = EmbeddedDeltaDualComplex2D{Bool, Float64, Point3{Float64}}(s)
    subdivide_duals!(sd, division)
    return (s, sd)
end

## Prefined meshes

const predefined_meshes = Dict(
    :Rectangle => Rectangle(100, 100, 2, 2),
    :Icosphere6 => Sphere(6, 1.0),
    :Icosphere7 => Sphere(7, 1.0),
    :Icosphere8 => Sphere(8, 1.0),
    :UV => UV()
)

## INITIAL CONDITIONS

# TAYLOR VORTEX CODE
include("ns_helper.jl")
####

@data InitialConditionsData begin
    GaussianData(μ::Vector{Float64}, Σ::Diagonal{Float64, Vector{Float64}})
    TaylorVortexData(lat::Float64, vortices::Int, p::AbstractVortexParams)
end

function GaussianData(μ::Vector{Float64}, Σ::Vector{Float64})
    GaussianData(μ, LinearAlgebra.Diagonal(abs.(Σ)))
end

# DEFAULT METHOD. A Moshi-like Default impl. would be nice!
function GaussianData(r::Rectangle)
    μ = middle(r)
    GaussianData(μ, μ/10)
end

""" Normal distribution should understand GaussianData """
Distributions.MvNormal(ξ::GaussianData) = MvNormal(ξ.μ, ξ.Σ)

TaylorVortexData() = TaylorVortexData(0.2, 2, TaylorVortexParams(0.5, 0.1))

@data InitialConditions begin
    # planar
    GaussianIC(r::Rectangle, ξ::GaussianData)
    # spherical
    TaylorVortexIC(d::Sphere, ξ::TaylorVortexData)
    SixVortexIC(m::Sphere, data::Any)
end

# DEFAULT METHOD
GaussianIC(r::Rectangle) = GaussianIC(r, GaussianData(r))
TaylorVortexIC(d::Sphere) = TaylorVortexIC(d, TaylorVortexData())

""" Takes a string, a domain, and a mesh and returns the initial conditios object associated to it.

Example:
```
associate("TaylorVortex", Sphere(6, 1.0), sd) == TaylorVortexIC(Sphere(6, 1.0), sd)
```
"""
function associate(str::String, d::Domain, sd::HasDeltaSet)
   @match str begin
       "Gaussian" => GaussianIC(d)
       "TaylorVortex" => TaylorVortexIC(d)
       _ => error("$str is not implemented")
   end
end

""" default method """
function initial_conditions end; export initial_conditions

""" associates the values in a dictionary to their initial condition flags, and passes the output to initial_conditions
"""
function initial_conditions(ics::Dict{Symbol, String}, d::Domain, sd::HasDeltaSet) 
    ic_dict = Dict([
        var => associate(ics[var], d, sd) for var in keys(ics)
    ]...)
    # Now we have a mapping between variables and their initial condition specs.
    initial_conditions(ic_dict, sd)
end

function initial_conditions(ics::Dict{Symbol,<:InitialConditions}, sd::HasDeltaSet)
    # XXX ComponentArray(duu = init0, ψ = init1)
    u0 = ComponentArray(; Dict([
            var => initial_conditions(ics[var], sd) for var ∈ keys(ics)
         ])...)
    return u0
end

function initial_conditions(x::InitialConditions, args...)
    throw(ImplError("These initial conditions ($(x)) are"))
end

function initial_conditions(ics::GaussianIC, sd::HasDeltaSet)
    c_dist = MvNormal(ics.ξ)
    c = [pdf(c_dist, [p[1], p[2]]) for p ∈ sd[:point]]
    return c
end

function initial_conditions(ics::SixVortexIC, sd::HasDeltaSet) 
    X = vort_ring(0.4, 6, PointVortexParams(3.0, 0.15), point_vortex) 
end

function vort_ring(ics::TaylorVortexIC, sd::HasDeltaSet)
    vort_ring(ics.d, ics.ξ.lat, ics.ξ.vortices, ics.ξ.p, sd, taylor_vortex)
end

function initial_conditions(ics::TaylorVortexIC, sd::HasDeltaSet)
    # TODO prefer not to load `s0` here but che sara sara
    s0 = dec_hodge_star(0, sd, GeometricHodge());
    X = vort_ring(ics, sd)
    du = s0 * X
    return du
end

# XXX
# function init_conditions(vars::Vector{Symbol}, sd::HasDeltaSet)
#     c_dist = MvNormal([50, 50], LinearAlgebra.Diagonal(map(abs2, [7.5, 7.5])))
#     c = [pdf(c_dist, [p[1], p[2]]) for p in sd[:point]]
#     u0 = ComponentArray(; Dict([var=>c for var in vars])...)
#     return u0
# end
