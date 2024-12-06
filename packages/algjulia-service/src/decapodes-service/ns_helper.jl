### 
#This code was lifted from the Navier-Stokes simulation `ns.jl` in the Decapodes docs page, originally authored by Luke Morris
###
abstract type AbstractVortexParams end

struct TaylorVortexParams <: AbstractVortexParams
  G::Real
  a::Real
end

struct PointVortexParams <: AbstractVortexParams
  τ::Real
  a::Real
end

"""    function ring_centers(lat, n)

Find n equispaced points at the given latitude.
"""
function ring_centers(lat, n, radius=1.0)
  ϕs = range(0.0, 2π; length=n+1)[1:n]
  map(ϕs) do ϕ
    v_sph = Spherical(radius, lat, ϕ)
    v_crt = convert(Cartesian, v_sph)
    Point3D(v_crt.x.val, v_crt.y.val, v_crt.z.val)
  end
end

"""    function great_circle_dist(pnt,G,a,cntr)

Compute the length of the shortest path along a sphere, given Cartesian coordinates.
"""
function great_circle_dist(radius::Float64, pnt1::Point3D, pnt2::Point3D)
  radius * acos(dot(pnt1,pnt2))
end

function taylor_vortex(sd::HasDeltaSet, radius::Float64, cntr::Point3D, p::TaylorVortexParams)
    map(x -> taylor_vortex(x, radius, cntr, p), point(sd))
end

"""    function taylor_vortex(pnt::Point3D, cntr::Point3D, p::TaylorVortexParams)

Compute the value of a Taylor vortex at the given point.
"""
function taylor_vortex(pnt::Point3D, radius::Float64, cntr::Point3D, p::TaylorVortexParams)
    gcd = great_circle_dist(radius, pnt, cntr)
    (p.G/p.a) * (2 - (gcd/p.a)^2) * exp(0.5 * (1 - (gcd/p.a)^2))
end

"""    function vort_ring(lat, n_vorts, p::T, formula) where {T<:AbstractVortexParams}

Compute vorticity as primal 0-forms for a ring of vortices.

Specify the latitude, number of vortices, and a formula for computing vortex strength centered at a point.
"""
function vort_ring(d::Sphere, lat, n_vorts, p::T, sd, formula) where {T<:AbstractVortexParams}
  sum(map(x -> formula(sd, d.radius, x, p), ring_centers(lat, n_vorts, d.radius)))
end

"""    function vort_ring(lat, n_vorts, p::PointVortexParams, formula)

Compute vorticity as primal 0-forms for a ring of vortices.

Specify the latitude, number of vortices, and a formula for computing vortex strength centered at a point.

Additionally, place a counter-balance vortex at the South Pole such that the integral of vorticity is 0.
"""
function vort_ring(radius, lat, n_vorts, p::PointVortexParams, formula)
    Xs = sum(map(x -> formula(radius, sd, x, p), ring_centers(lat, n_vorts)))
    Xsp = point_vortex(sd, Point3D(0.0, 0.0, -1.0), PointVortexParams(-1*n_vorts*p.τ, p.a))
    Xs + Xsp
end






"""    function point_vortex(pnt::Point3D, cntr::Point3D, p::PointVortexParams)

Compute the value of a smoothed point vortex at the given point.
"""
function point_vortex(pnt::Point3D, cntr::Point3D, p::PointVortexParams)
  gcd = great_circle_dist(pnt,cntr)
  p.τ / (cosh(3gcd/p.a)^2)
end

