## INITIAL CONDITIONS

const GAUSS_NORM = sqrt(2*pi)

"""
"""
abstract type AbstractInitialConditionSpec end

"""
"""
@default struct ConstantIC <: AbstractInitialConditionSpec
    value::Float64 = 1.0
end

function initial_condition(c::ConstantIC, geometry::Geometry{D}; f::Function=identity) where D
    fill(c.value, nparts(geometry.dualmesh, :V))
end

"""
"""
@default struct GaussianIC{dim} <: AbstractInitialConditionSpec
    mean::Vector{Float64} = [0.0 for _ in 1:dim]
    var::Diagonal{Float64, Vector{Float64}} = Diagonal{Float64, Vector{Float64}}([1.0 for _ in 1:dim])
end

dimension(::GaussianIC{d}) where d = d

function initial_condition(g::GaussianIC, geometry::Geometry{Circle}; f::Function=identity)
    @assert dimension(g) == dimension(geometry) || error("!")
    dist = Normal(pi)
    m(t) = Distributions.pdf(dist, t) * GAUSS_NORM |> f
    [m(t) for t in range(0, 2*pi; length=ne(geometry.dualmesh))]
end

function initial_condition(g::GaussianIC, geometry::Geometry{Rectangle})
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

function initial_condition(tv::TaylorVortexIC, geometry::Geometry{Icosphere}; f::Function=identity, division=GeometricHodge())
    s0 = dec_hodge_star(0, geometry.dualmesh, division)
    X = vort_ring(ics, geometry)
    du = s0 * X
    du
end

vort_ring(tv::TaylorVortexIC, geometry::Geometry) = vort_ring(tv.d, tv.ξ.lat, tv.ξ.vortices, tv.ξ.p, geometry.dualmesh, taylor_vortex)

""" associates the values in a dictionary to their initial condition flags, and passes the output to initial_conditions
"""
function initial_conditions(ics::Dict{Symbol, <:Union{DataType, UnionAll}}, geometry::Geometry) 
    # Now we have a mapping between variables and their initial condition specs.
    ic(var) = begin
        x = ics[var]
        if x isa UnionAll
            x{dimension(geometry)}()
        else
            x()
        end
    end
    vals = Dict(var => initial_condition(ic(var), geometry) for var ∈ keys(ics))
    u0 = ComponentArray(; vals...)
    return u0
end
