"""
    This module defines structs which specify initial conditions. The available initial conditions are dependent on the mesh, which we track as a methods of the `initial_condition` function.

    Initial conditions dispatch on...

    1. a symbolic variable typed by its place in the DEC
    2. an initial condition spec,
    3. the underlying geometry

    Since the symbolic variable also stores the type of the geometry it lives on, we do not need to expose the AbstractMeshSpec type also stored by the Geometry struct. 
"""
module InitialConditions

using SymbolicUtils: BasicSymbolic

using ComponentArrays: ComponentArray
using Distributions
using LinearAlgebra
using SymbolicUtils

using ACSets
using Catlab
using CombinatorialSpaces
using DiagrammaticEquations.ThDEC
using DiagrammaticEquations: ThDEC as DEC

import ..DecapodesInterop: AbstractMeshSpec, Geometry, Circle, Rectangle, Icosphere
import ..DecapodesInterop: AbstractVortexParams, TaylorVortexParams, dimension, embedding_dimension

const GAUSS_NORM = sqrt(2*pi)

# count of dual 0-cells (= primal top-cells)
ndual0(sd::EmbeddedDeltaDualComplex1D) = ne(sd)
ndual0(sd::EmbeddedDeltaDualComplex2D) = ntriangles(sd)

# coordinates of those dual 0-cells (centers of primal top-cells)
dual0_points(sd::EmbeddedDeltaDualComplex1D) = sd[sd[:edge_center], :dual_point]
dual0_points(sd::EmbeddedDeltaDualComplex2D) = sd[sd[:tri_center],  :dual_point]

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
struct ConstantIC <: AbstractInitialConditionSpec
    value::Float64
end
export ConstantIC

default_values(::Type{ConstantIC}, ::Type{<:AbstractMeshSpec}) = (value=1.0,)

# The type of state variable is relevant. If it is a Form1, then we want to fill an array by edges 
function initial_condition(var::BasicSymbolic{<:DECQuantity}, c::ConstantIC, geometry::Geometry; f::Function=identity)
    fill(c.value, nparts(geometry.dualmesh, :V))
end

"""
The `dim` type parameter allows us to control dispatch on `initial_conditions`
"""
struct GaussianIC <: AbstractInitialConditionSpec
    mean::Vector{Float64}
    var::Diagonal{Float64, Vector{Float64}}
end
export GaussianIC

function default_values(::Type{GaussianIC}, ::Type{M}) where {M<:AbstractMeshSpec}
    d = dimension(M)
    (mean=zeros(d), var=Diagonal(ones(d)))
end

"""
    Gaussian initial conditions for a dual form over a circle
"""
function initial_condition(var::BasicSymbolic{DEC.DualForm{idx, Circle, spacedim}}, g::GaussianIC, geometry::Geometry; f::Function=identity) where {idx, spacedim}
    # dist = Normal(pi)
    dist = Normal(only(g.mean), sqrt(only(g.var.diag)))
    # 7.2 multiplier allows the bands to develop above the soil line
    m(t) = Distributions.pdf(dist, t) * 7.2 * GAUSS_NORM |> f
    [m(t) for t in range(0, 2*pi; length=ne(geometry.dualmesh))]
end

"""
    Gaussian initial conditions for a dual 0-form over a rectangle
"""
function initial_condition(::BasicSymbolic{DEC.DualForm{0, Rectangle, dim}}, g::GaussianIC, geometry::Geometry; f::Function=identity) where dim
    pts = dual0_points(geometry.dualmesh)
    dist = MvNormal(g.mean, g.var)
    m(p) = Distributions.pdf(dist, [p[1], p[2]]) |> f
    [m(p) for p in pts]
end

"""
    Gaussian initial conditions for a 1-form over a circle
"""
function initial_condition(::BasicSymbolic{DEC.PrimalForm{1, Circle, dim}}, ::GaussianIC, geometry::Geometry; f::Function=identity) where dim
    dist = Normal(pi)
    m(t) = Distributions.pdf(dist, t) * 7.2 * GAUSS_NORM |> f
    [m(t) for t in range(0, 2pi; length=ne(geometry.dualmesh))]
end

using LinearAlgebra: ⋅
# α length = embedding dimfunction
function constant_primal_1form(sd, v::AbstractVector)
    map(edges(sd)) do e
        v ⋅ (sd[tgt(sd, e), :point] - sd[src(sd, e), :point])
    end
end

"""
    Constant initial conditions for a 1-form over a rectangle
"""
function initial_condition(::BasicSymbolic{DEC.PrimalForm{1, Rectangle, dim}}, ic::ConstantIC, geometry::Geometry) where dim
    constant_primal_1form(geometry.dualmesh, [1.0, 0.0])
end

"""
    Constant initial conditions for a dual 0-form over a rectangle
"""
function initial_condition(::BasicSymbolic{DEC.DualForm{0, Rectangle, dim}}, c::ConstantIC, geometry::Geometry) where dim
    fill(c.value, ndual0(geometry.dualmesh))
end

"""  Taylor Vortices
"""
struct TaylorVortexIC <: AbstractInitialConditionSpec
    lat::Float64
    vortices::Int
    p::AbstractVortexParams
end
export TaylorVortexIC

default_values(::Type{TaylorVortexIC}, ::Type{Icosphere}) =
    (lat=0.2, vortices=2, p=TaylorVortexParams(0.5, 0.1))

function initial_condition(::BasicSymbolic{DEC.DualForm{0, Icosphere, dim}},
                           tv::TaylorVortexIC, geometry::Geometry;
                           division=GeometricHodge()) where {dim}
    s0 = dec_hodge_star(0, geometry.dualmesh, division)
    X  = vort_ring(geometry.domain, tv.lat, tv.vortices, tv.p,
                   geometry.dualmesh, taylor_vortex)
    s0 * X
end


"""    Associates the values in a dictionary to their initial condition flags, and passes the output to initial_conditions
"""
function initial_conditions(ics::AbstractDict{<:BasicSymbolic, <:AbstractInitialConditionSpec}, geometry::Geometry)
    ComponentArray(; (nameof(var) => initial_condition(var, spec, geometry) for (var, spec) in ics)...)
end
export initial_conditions

instantiate(::Type{T}, nt::NamedTuple) where {T<:AbstractInitialConditionSpec} = T(values(nt)...)
export instantiate


end  # module
