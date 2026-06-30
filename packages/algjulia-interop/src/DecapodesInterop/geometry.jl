using .Defaults: @default, default_values


function dimension end
export dimension

abstract type AbstractMeshSpec end

name(::AbstractMeshSpec) = "No name provided"

struct Geometry{D<:AbstractMeshSpec}
    domain::D
    mesh::HasDeltaSet
    dualmesh::HasDeltaSet
end

dimension(g::Geometry) = dimension(g.domain)

Geometry(domain, args...) = Geometry{typeof(domain)}(domain, args...)

function Geometry(dict::AbstractDict)
    mesh = Symbol(dict["mesh"])
    domain = PREDEFINED_MESHES[mesh]
    Geometry(domain)
end

"""    
"""
@default struct Circle <: AbstractMeshSpec
    n::Int = 9
    c::Float64 = 500
end

dimension(::Circle) = 1

function Geometry(c::Circle; division::SimplexCenter=Circumcenter())
    mesh = EmbeddedDeltaSet1D{Bool, Point2D}()
    map(range(0, 2pi - (pi/(2^(c.n-1))); step=pi/(2^(c.n-1)))) do t
        add_vertex!(mesh, point=Point2D(cos(t),sin(t))*(c.c/2pi))
    end
    add_edges!(mesh, 1:(nv(mesh)-1), 2:nv(mesh))
    add_edge!(mesh, nv(mesh), 1)
    dualmesh = EmbeddedDeltaDualComplex1D{Bool, Float64, Point2D}(mesh)
    subdivide_duals!(dualmesh, division)
    Geometry(c, mesh, dualmesh)
end

@default struct Icosphere <: AbstractMeshSpec
    order::Int = 6
    radius::Float64 = 1.0
end

dimension(::Icosphere) = 2

function Geometry(m::Icosphere; division::SimplexCenter=Circumcenter())
    s = loadmesh(Icosphere(m.order, m.radius))
    sd = EmbeddedDeltaDualComplex2D{Bool, Float64, Point3{Float64}}(s)
    subdivide_duals!(sd, division)
    Geometry(m, s, sd)
end

# function Geometry(m::UV; division::SimplexCenter=Circumcenter())
#     s, _, _ = makeSphere(m)
#     sd = EmbeddedDeltaDualComplex2D{Bool, Float64, Point3{Float64}}(s)
#     subdivide_duals!(sd, division)
#     Geometry(m, s, sd)
# end

@default struct Rectangle <: AbstractMeshSpec
    max_x::Int = 100
    max_y::Int = 100
    dx::Float64 = 0.1
    dy::Float64 = 0.1
end

dimension(::Rectangle) = 2

function Geometry(r::Rectangle; division::SimplexCenter=Circumcenter())
    s = triangulated_grid(r.max_x, r.max_y, r.dx, r.dy, Point2{Float64})
    sd = EmbeddedDeltaDualComplex2D{Bool, Float64, Point2{Float64}}(s)
    subdivide_duals!(sd, division)
    Geometry(r, s, sd)
end

# TODO it is semantically better to case to Point2?
middle(r::Rectangle) = [r.max_x/2, r.max_y/2]

function indexing_bounds(r::Rectangle)
    (x=floor(Int, r.max_x/r.dx), y=floor(Int, r.max_y/r.dy))
end

# TODO XXX hardcoded alert!
indexing_bounds(m::Icosphere) = (x=100, y=100)

# """ helper function for UV """
# makeSphere(m::UV) = makeSphere(m.minlat, m.maxlat, m.dlat, m.minlong, m.maxlong, m.dlong, m.radius)

const PREDEFINED_MESHES = Dict(
    :Rectangle => Rectangle(100, 100, 2, 2),
    :Icosphere6 => Icosphere(6, 1.0),
    :Icosphere7 => Icosphere(7, 1.0),
    :Icosphere8 => Icosphere(8, 1.0))
    # :UV => UV(0, 180, 2.5, 0, 360, 2.5, 1.0))
