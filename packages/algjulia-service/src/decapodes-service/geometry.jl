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

# rectangle methods

# TODO it is semantically better to case to Point2?
middle(r::Rectangle) = [r.max_x/2, r.max_y/2]

function indexing_bounds(r::Rectangle)
    (x=floor(Int, r.max_x/r.dx), y=floor(Int, r.max_y/r.dy))
end

# meshes associated with Spheres
@data Spheric <: Domain begin
    Sphere(dim::Int, radius::Float64)
    UV(minlat::Int, maxlat::Int, dlat::Float64, minlong::Int, maxlong::Int, dlong::Float64, radius::Float64)
end

# default
Sphere(dim) = Sphere(dim, 1.0)

# TODO
function indexing_bounds(m::Sphere)
    (x=100, y=100)
end

""" helper function for UV """
function makeSphere(m::UV)
    makeSphere(m.minlat, m.maxlat, m.dlat, m.minlong, m.maxlong, m.dlong, m.radius)
end

function create_mesh end; export create_mesh

function create_mesh(jo::JSON3.Object)
    mesh_name = Symbol(jo[:mesh])
    domain = PREDEFINED_MESHES[mesh_name]
    return create_mesh(domain)
end

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

const PREDEFINED_MESHES = Dict(
    :Rectangle => Rectangle(100, 100, 2, 2),
    :Icosphere6 => Sphere(6, 1.0),
    :Icosphere7 => Sphere(7, 1.0),
    :Icosphere8 => Sphere(8, 1.0),
    :UV => UV(0, 180, 2.5, 0, 360, 2.5, 1.0))
