"""
    This module defines structs which specify initial conditions. The available initial conditions are dependent on the mesh, which we track as a methods of the `initial_condition` function.

    The motivation behind this design is to compile initial condition "specs" into dictionaries which contain the information a frontend component needs to construct the appropriate component.

    IC specs may have type parameters. The motivation for this is parameterizing over the dimension of the mesh.

    Specs implement `@default`, which is just fancy code-gen for a `default_values(::T)::NamedTuple` which returns the default values for that struct.
"""
module InitialConditions

using ComponentArrays: ComponentArray
using Distributions
using LinearAlgebra

using ACSets
using Catlab
using CombinatorialSpaces

import ..DecapodesInterop: AbstractMeshSpec, Geometry, Circle, Rectangle, Icosphere
import ..DecapodesInterop: AbstractVortexParams, TaylorVortexParams, dimension
import ..Defaults: @default, default_values

const GAUSS_NORM = sqrt(2*pi)

"""
    The concrete type associated to `AbstractInitialConditionSpec` stores information pertinent to building the initial conditions for a variable on a given geometry.

    This concrete type is passed into a method of the form `initial_conditions(::AbstractInitialCondtionSpec, ::Geometry)`, which returns a numerical array. This function is called in the `decapodes-options` endpoint initialization, which will be sent over to the frontend as a JSON object.
"""
abstract type AbstractInitialConditionSpec end
export AbstractInitialConditionSpec

function initial_condition end
export initial_condition

"""
"""
@default struct ConstantIC <: AbstractInitialConditionSpec
    value::Float64 = 1.0
end
export ConstantIC

# The type of state variable is relevant. If it is a Form1, then we want to fill an array by edges 
function initial_condition(c::ConstantIC, geometry::Geometry{D}; f::Function=identity) where D
    fill(c.value, nparts(geometry.dualmesh, :V))
end

"""
The `dim` type parameter allows us to control dispatch on `initial_conditions`
"""
@default struct GaussianIC{params} <: AbstractInitialConditionSpec
    mean::Vector{Float64} = params isa @NamedTuple{dim::Int} ? zeros(params.dim) : [0.0]
    var::Diagonal{Float64, Vector{Float64}} = params isa @NamedTuple{dim::Int} ? Diagonal(ones(params.dim)) : Diagonal([1.0])
end
export GaussianIC

function dimension(::GaussianIC{params}) where params
    params isa @NamedTuple{dim::Int} ? params.dim : error("")
end

function initial_condition(g::GaussianIC{(dim=1,)}, geometry::Geometry{Circle}; f::Function=identity)
    @assert dimension(g) == dimension(geometry) || error("!")
    dist = Normal(pi)
    m(t) = Distributions.pdf(dist, t) * GAUSS_NORM |> f
    [m(t) for t in range(0, 2*pi; length=ne(geometry.dualmesh))]
end

function initial_condition(g::GaussianIC{(dim=2,)}, geometry::Geometry{Rectangle})
    c_dist = MvNormal(g.mean, g.var)
    c = [Distributions.pdf(c_dist, [p[1], p[2]]) for p ∈ geometry.dualmesh[:point]]
    return c
end

"""  Taylor Vortices    
"""
@default struct TaylorVortexIC <: AbstractInitialConditionSpec
    lat::Float64 = 0.2
    vortices::Int = 2
    p::AbstractVortexParams = TaylorVortexParams(0.5, 0.1)
end
export TaylorVortexIC

function initial_condition(tv::TaylorVortexIC, geometry::Geometry{Icosphere}; f::Function=identity, division=GeometricHodge())
    s0 = dec_hodge_star(0, geometry.dualmesh, division)
    X = vort_ring(ics, geometry)
    du = s0 * X
    du
end

vort_ring(tv::TaylorVortexIC, geometry::Geometry) = vort_ring(tv.d, tv.ξ.lat, tv.ξ.vortices, tv.ξ.p, geometry.dualmesh, taylor_vortex)

"""    Associates the values in a dictionary to their initial condition flags, and passes the output to initial_conditions
"""
function initial_conditions(ics::Dict{Symbol, <:Union{UnionAll, Type}}, geometry::Geometry) 
    # Now we have a mapping between variables and their initial condition specs.
    ic(var) = begin
        x = ics[var]
        if x isa UnionAll
            # if the IC is a UnionAll, then we assume its dimension is
            x{(dim=dimension(geometry),)}()
        else
            x()
        end
    end
    vals = Dict(var => initial_condition(ic(var), geometry) for var ∈ keys(ics))
    u0 = ComponentArray(; vals...)
    return u0
end
export initial_conditions

end  # module
