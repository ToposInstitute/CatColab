# - parameterize by the theory. this is currently fixed to decapodes
# - switch to different meshes
# - use enum instead of val

# NOTES:
#   TODO "anonymous objects" are •n

# algebraicjulia dependencies
using ACSets
using Decapodes
using DiagrammaticEquations
using CombinatorialSpaces

# dependencies
import JSON3
using StaticArrays
using MLStyle
using LinearAlgebra
using ComponentArrays
using Distributions # for initial conditions
using GeometryBasics: Point2, Point3
using OrdinaryDiffEq

export infer_types!, evalsim, default_dec_generate, default_dec_matrix_generate, DiagonalHodge, ComponentArray

struct ImplError <: Exception
    name::String
end

Base.showerror(io::IO, e::ImplError) = print(io, "$(e.name) not implemented")

## THEORY BUILDING

function to_pode end
export to_pode

""" Helper function to convert CatColab values (Obs) in Decapodes """
function to_pode(::Val{:Ob}, name::String)
    @match lowercase(name) begin
        "0-form" => :Form0
        "1-form" => :Form1
        "2-form" => :Form2
        "dual 0-form" => :DualForm0
        "dual 1-form" => :DualForm1
        "dual 2-form" => :DualForm2
        x => throw(ImplError(x))
    end
end

""" Helper function to convert CatColab values (Homs) in Decapodes """
function to_pode(::Val{:Hom}, name::String)
    @match name begin
        "∂t" => :∂ₜ
        "∂ₜ" => :∂ₜ
        "Δ" => :Δ
        "d" => :d₀
        "d*" => :dual_d₁
        # \star on LHS
        "⋆" => :⋆₁
        "⋆⁻¹" => :⋆₀⁻¹
        # \bigstar on LHS
        "★" => :⋆₁
        "★⁻¹" => :⋆₀⁻¹
        "diffusivity" => :diffusivity
        x => throw(ImplError(x))
    end
end

# Build the theory

# @active patterns are MLStyle-implementations of F# active patterns that forces us to work in the Maybe/Option design pattern. They make @match statements cleaner.
@active IsObject(x) begin
    x[:tag] == "object" ? Some(x) : nothing
end

@active IsMorphism(x) begin
    x[:tag] == "morphism" ? Some(x) : nothing
end

export IsObject, IsMorphism

""" Obs, Homs """
abstract type ElementData end

""" Struct capturing the name of the object and its relevant information. ElementData may be objects or homs, each of which has different data.
"""
struct TheoryElement
    name::Union{Symbol, Nothing}
    val::Union{ElementData, Nothing}
    function TheoryElement(;name::Symbol=nothing,val::Any=nothing)
        new(name, val)
    end
end
export TheoryElement

Base.nameof(t::TheoryElement) = t.name

struct HomData <: ElementData
    dom::Any
    cod::Any
    function HomData(;dom::Any,cod::Any)
        new(dom,cod)
    end
end
export HomData

struct Theory
    data::Dict{String, TheoryElement}
    function Theory()
        new(Dict{String, TheoryElement}())
    end
end
export Theory

# TODO engooden
Base.show(io::IO, theory::Theory) = println(io, theory.data)

Base.values(theory::Theory) = values(theory.data)

function add_to_theory! end
export add_to_theory!

function add_to_theory!(theory::Theory, content::Any, type::Val{:Ob})
    push!(theory.data, content[:id] => TheoryElement(;name=to_pode(type, content[:name])))
end

function add_to_theory!(theory::Theory, content::Any, type::Val{:Hom})
    push!(theory.data, content[:id] => 
          TheoryElement(;name=to_pode(type, content[:name]),
                        val=HomData(dom=content[:dom][:content], 
                                    cod=content[:cod][:content])))
end

# for each cell, if it is...
#   ...an object, we convert its type to a symbol and add it to the theorydict
#   ...a morphism, we add it to the theorydict with a field for the ids of its
#       domain and codomain to its
function Theory(model::AbstractVector{JSON3.Object})
    theory = Theory();
    foreach(model) do cell
        @match cell begin
            IsObject(content) => add_to_theory!(theory, content, Val(:Ob))
            IsMorphism(content) => add_to_theory!(theory, content, Val(:Hom))
            x => throw(ImplError(x))
        end
    end
    return theory
end
export Theory

## MODEL BUILDING

function add_to_pode! end
export add_to_pode!

function add_to_pode!(d::SummationDecapode, 
        vars::Dict{String, Int}, # mapping between UUID and ACSet ID
        theory::Theory, 
        content::JSON3.Object,
        nc::Vector{Int},
        ::Val{:Ob})
    theory_elem = theory.data[content[:over][:content]] # indexes the theory by UUID
    name = if isempty(content[:name])
        nc[1] += 1
        Symbol("•$(nc[1])")
    else
        Symbol(content[:name])
    end 
    id = add_part!(d, :Var, name=name, type=nameof(theory_elem))
    push!(vars, content[:id] => id)
    return d
end

# TODO we are restricted to Op1
function add_to_pode!(d::SummationDecapode,
        vars::Dict{String, Int}, # mapping between UUID and ACSet ID
        theory::Theory,
        content::JSON3.Object,
        scalars::Any,
        anons::Dict{Symbol, Any},
        ::Val{:Hom})
    dom = content[:dom][:content]
    cod = content[:cod][:content]
    if haskey(vars, dom) && haskey(vars, cod)
        op1 = Symbol(theory.data[content[:over][:content]].name)
        add_part!(d, :Op1, src=vars[dom], tgt=vars[cod], op1=op1)
        # we need to add an inclusion to the TVar table
        if op1 == :∂ₜ
            add_part!(d, :TVar, incl=vars[cod])
        end
        # if the dom is anonymous, we treat it as a something which will receive x -> k * x.
        # we store its value in another array
        if !isempty(scalars) && haskey(scalars, Symbol(content[:over][:content]))
            scalar = scalars[Symbol(content[:over][:content])]
            push!(anons, op1 => x -> scalar * x)
        end
        # TODO if scalars were typed correctly, we could probably do away with the !isempty check
    end
    d
end

"""  Decapode(jsondiagram::JSON3.Object, theory::Theory) => SummationDecapode

This returns a Decapode given a jsondiagram and a theory.
"""
function Decapode(diagram::AbstractVector{JSON3.Object}, theory::Theory; scalars=[])
    # initiatize decapode and its mapping between UUIDs and ACSet IDs
    pode = SummationDecapode(parse_decapode(quote end));
    vars = Dict{String, Int}();
    nc = [0]; # array is a mutable container
    anons = Dict{Symbol, Any}();

    # for each cell in the notebook, add it to the diagram 
    foreach(diagram) do cell
        @match cell begin
            # TODO merge nameless_count into vars
            IsObject(content) => add_to_pode!(pode, vars, theory, content, nc, Val(:Ob))
            IsMorphism(content) => add_to_pode!(pode, vars, theory, content, scalars, anons, Val(:Hom))
            _ => throw(ImplError(cell[:content][:tag]))
        end
    end
    pode, anons
end
export Decapode
# the proper name for this constructor should be "SummationDecapode"

# TODO we need to make this dynamic
function create_mesh(statevar::Symbol)
  s = triangulated_grid(100,100,2,2,Point2{Float64})
  sd = EmbeddedDeltaDualComplex2D{Bool, Float64, Point2{Float64}}(s)
  subdivide_duals!(sd, Circumcenter())

  c_dist = MvNormal([50, 50], LinearAlgebra.Diagonal(map(abs2, [7.5, 7.5])))
  c = [pdf(c_dist, [p[1], p[2]]) for p in sd[:point]]
  u0 = ComponentArray(; Dict(statevar=>c)...)

  return (s, sd, u0, ())
end
export create_mesh


struct System
    pode::SummationDecapode
    statevar::Symbol
    scalars::Dict{Symbol, Any} # closures # TODO rename scalars => anons
    mesh::HasDeltaSet
    dualmesh::HasDeltaSet
    init::Any # TODO specify. Is it always ComponentVector?
    generate::Any
end
export System

function System(json_string::String)
    json_object = JSON3.read(json_string);

    # converts the JSON of (the fragment of) the theory
    # into theory of the DEC, valued in Julia
    theory = Theory(json_object[:model]);

    # this is a diagram in the model of the DEC. it wants to be a decapode!
    diagram = json_object[:diagram];

    # any scalars?
    scalars = haskey(json_object, :scalars) ? json_object[:scalars] : [];

    # pode, anons, and statevar
    decapode, anons = Decapode(diagram, theory; scalars=scalars);
    statevars = infer_state_names(decapode);
    statevar = length(statevars) == 1 ? first(statevars) : error("$statevars must be length one")

    # mesh and initial conditions
    s, sd, u0, _ = create_mesh(statevar);

    # generate
    function sys_generate(s, my_symbol; hodge=GeometricHodge())
	    op = @match my_symbol begin
		    sym && if sym ∈ keys(anons) end => anons[sym]
		    _ => default_dec_matrix_generate(s, my_symbol, hodge)
	    end
	    return (args...) -> op(args...)
    end

    return System(decapode, statevar, anons, s, sd, u0, sys_generate)
end


function run_sim(fm, u0, t0, constparam)
    prob = ODEProblem(fm, u0, (0, t0), constparam)
    soln = solve(prob, Tsit5(), saveat=0.1)
end
export run_sim

struct SimResult
    time::Vector{Float64}
    state::Vector{Matrix{SVector{3, Float64}}}
    x::Vector{Float64} # axis
    y::Vector{Float64}
end
export SimResult

function SimResult(sol::ODESolution, system::System)

    points = collect(values(system.mesh.subparts.point.m));

    xlen = 51; ylen = 51;

    function at_time(sol::ODESolution, timeidx::Int)
        [SVector(i, j, getproperty(sol.u[timeidx], system.statevar)[xlen*(i-1) + j]) for i in 1:xlen, j in 1:ylen]
    end

    state_vals = map(1:length(sol.t)) do i
        at_time(sol, i)
    end

    # TODO engooden
    SimResult(sol.t, state_vals, 0:xlen-1, 0:ylen-1)
end
# TODO generalize to HasDeltaSet

## PLOTTING CODE

abstract type AbstractPlotType end

struct Heatmap <: AbstractPlotType end

# TODO make length a conditional value so we can pass it in if we want
function Base.reshape(::Heatmap, data)
    l = floor(Int64, sqrt(length(data)))
    reshape(data, l, l)
end

