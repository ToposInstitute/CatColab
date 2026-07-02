"""
    This module defines structs which specify initial conditions. The available initial conditions are dependent on the mesh, which we track as a methods of the `initial_condition` function.

    The motivation behind this design is to compile initial condition "specs" into dictionaries which contain the information a frontend component needs to construct the appropriate component.

    IC specs may have type parameters. The motivation for this is parameterizing over the dimension of the mesh.

    Specs implement `@default`, which is just fancy code-gen for a `default_values(::T)::NamedTuple` which returns the default values for that struct.
"""
module InitialConditions

using SymbolicUtils: BasicSymbolic

using ComponentArrays: ComponentArray
using Distributions
using LinearAlgebra
using SymbolicUtils

using TraitInterfaces: TraitInterfaces as TI

using ACSets
using Catlab
using CombinatorialSpaces
using DiagrammaticEquations.ThDEC
using DiagrammaticEquations: ThDEC as DEC

import ..DecapodesInterop: AbstractMeshSpec, Geometry, Circle, Rectangle, Icosphere
import ..DecapodesInterop: AbstractVortexParams, TaylorVortexParams, dimension
import ..Defaults: @default, default_values

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

function default_values(c::ConstantIC, ::Geometry)
    (value=1.0,)
end

# The type of state variable is relevant. If it is a Form1, then we want to fill an array by edges 
function initial_condition(var::BasicSymbolic{<:DECQuantity}, c::ConstantIC, geometry::Geometry; f::Function=identity) where D
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

function default_values(g::GaussianIC, geometry::Geometry)
    (mean=zeros(dim(geometry)), variance=Diagonal(ones(dim(geometry))))
end

function initial_condition(var::BasicSymbolic{DEC.DualForm{dim, Circle, spacedim}}, g::GaussianIC, geometry::Geometry; f::Function=identity)
    @assert dim(var) == dimension(geometry) || error("!")
    dist = Normal(pi)
    # 7.2 multiplier allows the bands to develop above the soil line
    m(t) = Distributions.pdf(dist, t) * 7.2 * GAUSS_NORM |> f
    [m(t) for t in range(0, 2*pi; length=ne(geometry.dualmesh))]
end

function initial_condition(::BasicSymbolic{DEC.DualForm{0, Rectangle, dim}}, g::GaussianIC, geometry::Geometry; f::Function=identity) where dim
    pts  = dual0_points(geometry.dualmesh)
    dist = MvNormal(g.mean, g.var)
    m(p) = Distributions.pdf(dist, [p[1], p[2]]) |> f
    [m(p) for p in pts]
end

using LinearAlgebra: ⋅
function constant_primal_1form(sd, α::AbstractVector)   # α length = embedding dim
    map(edges(sd)) do e
        α ⋅ (sd[tgt(sd, e), :point] - sd[src(sd, e), :point])
    end
end

function initial_condition(::BasicSymbolic{DEC.PrimalForm{1, Rectangle, dim}}, ic, g)
    constant_primal_1form(geom.dualmesh, [1.0, 0.0])
end

# w: near-uniform; ConstantIC is a clean stand-in for the docs' very broad Normal
function initial_condition(::BasicSymbolic{DualForm{0, Rectangle, dim}}, c::ConstantIC, geom::Geometry) where dim
    fill(c.value, ndual0(geom.dualmesh))
end



"""  Taylor Vortices    
"""
struct TaylorVortexIC <: AbstractInitialConditionSpec
    lat::Float64
    vortices::Int
    p::AbstractVortexParams
end
export TaylorVortexIC

function default_values(tv::TaylorVortexIC, geometry)
    (lat=0.2, vortices=2, p=TaylorVortexParams(0.5, 0.1))
end

function initial_condition(::BasicSymbolic{DEC.DualForm{0, Icosphere, dim}}, tv::TaylorVortexIC, geometry::Geometry; f::Function=identity, division=GeometricHodge()) where dim
    s0 = dec_hodge_star(0, geometry.dualmesh, division)
    vort_ring(tv::TaylorVortexIC, geometry::Geometry) = vort_ring(tv.d, tv.ξ.lat, tv.ξ.vortices, tv.ξ.p, geometry.dualmesh, taylor_vortex)
    X = vort_ring(ics, geometry)
    du = s0 * X
    du
end

"""    Associates the values in a dictionary to their initial condition flags, and passes the output to initial_conditions
"""
function initial_conditions(ics::Dict{BasicSymbolic{<:DECQuantity}, <:AbstractInitialConditionSpec}, geometry::Geometry) 
    vals = Dict(var => initial_condition(var, ic[var], geometry) for var ∈ keys(ics))
    u0 = ComponentArray(; vals...)
    return u0
end
export initial_conditions

end  # module
