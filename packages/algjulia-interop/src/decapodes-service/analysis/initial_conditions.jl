## INITIAL CONDITIONS

# This ADT defines the parameters for initial conditions data.
@data InitialConditionsData begin
    GaussianData(μ::Vector{Float64}, Σ::Diagonal{Float64, Vector{Float64}})
    TaylorVortexData(lat::Float64, vortices::Int, p::AbstractVortexParams)
end

function GaussianData(μ::Vector{Float64}, Σ::Vector{Float64})
    GaussianData(μ, LinearAlgebra.Diagonal(abs.(Σ)))
end

# default method
function GaussianData(r::Rectangle)
    μ = middle(r)
    GaussianData(μ, μ/10)
end

""" Normal distribution should understand GaussianData """
Distributions.MvNormal(ξ::GaussianData) = MvNormal(ξ.μ, ξ.Σ)

TaylorVortexData() = TaylorVortexData(0.2, 2, TaylorVortexParams(0.5, 0.1))

#=
This IC contains the domain and the initial conditions data. 

While these are currently tightly-interlinked with InitialConditionsData, they are formally separated to distinguish between the initial conditions schema and the data it might be parameterized over. 
=#
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

function initial_conditions(ic_specs::AbstractDict, geometry::Geometry, uuid2symb::Dict{String, Symbol})
    dict = Dict([uuid2symb[string(uuid)] => ic_specs[string(uuid)] for uuid ∈ keys(ic_specs)]...)
    initial_conditions(dict, geometry) # the resulting sim will only have (C,) as initial conditions
end

""" Takes a string, a domain, and a mesh and returns the initial conditios object associated to it.

Example:
```
associate("TaylorVortex", Sphere(6, 1.0), sd) == TaylorVortexIC(Sphere(6, 1.0), sd)
```
"""
function associate(str::String, geometry::Geometry)
   @match str begin
       "Gaussian" => GaussianIC(geometry.domain)
       "TaylorVortex" => TaylorVortexIC(geometry.domain)
       _ => error("$str is not implemented")
   end
end

""" Methods for this function implement initial conditions for their given schema. There are also helper functions."""
function initial_conditions end
export initial_conditions

""" associates the values in a dictionary to their initial condition flags, and passes the output to initial_conditions
"""
function initial_conditions(ics::Dict{Symbol, String}, geometry::Geometry) 
    ic_dict = Dict([var => associate(ics[var], geometry) for var in keys(ics)]...)
    # Now we have a mapping between variables and their initial condition specs.
    initial_conditions(ic_dict, geometry)
end

""" builds a mapping between symbols and their initial conditions """
function initial_conditions(ics::Dict{Symbol,<:InitialConditions}, geometry::Geometry)
    u0 = ComponentArray(; Dict([
            var => initial_conditions(ics[var], geometry) for var ∈ keys(ics)
         ])...)
    return u0
end

function initial_conditions(x::InitialConditions, args...)
    throw(ImplError("These initial conditions ($(x)) are")) # TODO
end

function initial_conditions(ics::GaussianIC, geometry::Geometry)
    c_dist = MvNormal(ics.ξ)
    c = [pdf(c_dist, [p[1], p[2]]) for p ∈ geometry.dualmesh[:point]]
    return c
end

function vort_ring(ics::TaylorVortexIC, geometry::Geometry)
    vort_ring(ics.d, ics.ξ.lat, ics.ξ.vortices, ics.ξ.p, geometry.dualmesh, taylor_vortex)
end

function initial_conditions(ics::TaylorVortexIC, geometry::Geometry)
    # TODO prefer not to load `s0` here but che sara sara
    s0 = dec_hodge_star(0, geometry.dualmesh, GeometricHodge())
    X = vort_ring(ics, geometry)
    du = s0 * X
    return du
end

function initial_conditions(ics::SixVortexIC, geometry::Geometry) 
    X = vort_ring(0.4, 6, PointVortexParams(3.0, 0.15), point_vortex) 
end
