# TODO UUID => :Gaussian w default method

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
@data Spherical <: Domain begin
    Sphere(dim::Int, radius::Float64)
    UV(minlat::Int, maxlat::Int, dlat::Float64, minlong::Int, maxlong::Int, dlong::Float64, radius::Float64)
end

Sphere(dim) = Sphere(dim, 1.0)
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

# function create_mesh(r::Periodic, division::SimplexCenter=Circumcenter())
# end

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
    # TODO
    # :UV => UV
)

## INITIAL CONDITIONS

# TODO we want a mapping between symbols and their initial conditions, which may vary.
# i.e. Dict{Symbol, InitialCondition}. This first pass assumes the inverse; InitialConditions carry a reference to their variables. This is a little inflexible.

@data InitialConditionsData begin
    GaussianData(μ::Vector{Float64}, Σ::Diagonal{Float64, Vector{Float64}})
end

function GaussianData(μ::Vector{Float64}, Σ::Vector{Float64})
    GaussianData(μ, LinearAlgebra.Diagonal(abs.(Σ)))
end

# DEFAULT METHOD. A Moshi-like Default impl. would be nice!
function GaussianData(r::Rectangle)
    μ = middle(r)
    GaussianData(μ, μ/10)
end

Distributions.MvNormal(ξ::GaussianData) = MvNormal(ξ.μ, ξ.Σ)

abstract type InitialConditionData end

@data PlanarIC <: InitialConditionData begin
    GaussianIC(r::Rectangle, ξ::GaussianData)
end

# DEFAULT METHOD
GaussianIC(r::Rectangle) = GaussianIC(r, GaussianData(r))

@data SphericalIC <: InitialConditionData begin
    TaylorVortexIC(m::Sphere, data::Any)
    SixVortexIC(m::Sphere, data::Any)
end

function initial_conditions end; export initial_conditions

# TODO aspirational method
function initial_conditions(initial_conditions::Dict{String, Symbol}, uuid2symb::Dict{String, Symbol}, sd::HasDeltaSet)
    # convert to Dict
end

function initial_conditions(ics::Dict{Symbol, InitialConditionData}, sd::HasDeltaSet)
    u0 = ComponentArray(; Dict([
            var => initial_conditions(ics[var], sd) for var ∈ keys(ics)
         ])...)
    return u0
end

function initial_conditions(x::InitialConditionData, args...)
    throw(ImplError("These initial conditions ($(x)) are"))
end

function initial_conditions(ics::GaussianIC, sd::HasDeltaSet)
    c_dist = MvNormal(ics)
    c = [pdf(c_dist, [p[1], p[2]]) for p ∈ sd[:point]]
    return c
end

function initial_conditions(ics::TaylorVortexIC, sd::HasDeltaSet) end

function initial_conditions(ics::SixVortexIC, sd::HasDeltaSet) end



# XXX
# function init_conditions(vars::Vector{Symbol}, sd::HasDeltaSet)
#     c_dist = MvNormal([50, 50], LinearAlgebra.Diagonal(map(abs2, [7.5, 7.5])))
#     c = [pdf(c_dist, [p[1], p[2]]) for p in sd[:point]]
#     u0 = ComponentArray(; Dict([var=>c for var in vars])...)
#     return u0
# end
