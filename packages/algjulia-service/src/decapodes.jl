# - parameterize by the theory. this is currently fixed to decapodes
# - switch to different meshes
# - use enum instead of val

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
using GeometryBasics: Point2, Point3
using OrdinaryDiffEq

export simulate_decapode

struct ImplError <: Exception
    name::String
end

Base.showerror(io::IO, e::ImplError) = print("$(e.name) not implemented")

""" Helper function to convert CatColab values (Obs) in Decapodes """
function to_pode(::Val{:Ob}, name::String)
    @match name begin
        "0-form" => :Form0
        "1-form" => :Form1
        "2-form" => :Form2
        x => throw(ImplError(x))
    end
end

""" Helper function to convert CatColab values (Homs) in Decapodes """
function to_pode(::Val{:Hom}, name::String)
    @match name begin
        "∂t" => :∂ₜ
        "Δ" => :Δ
        x => throw(ImplError(x))
    end
end

# Build the theory

# @active patterns are MLStyle-implementations of F# active patterns that forces us to work in the Maybe/Option design pattern. They make @match statements cleaner.
@active IsObject(x) begin
    x[:content][:tag] == "object" ? Some(x[:content]) : nothing
end

@active IsMorphism(x) begin
    x[:content][:tag] == "morphism" ? Some(x[:content]) : nothing
end

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

Base.nameof(t::TheoryElement) = t.name

struct HomData <: ElementData
    dom::Any
    cod::Any
    function HomData(;dom::Any,cod::Any)
        new(dom,cod)
    end
end

struct Theory
    data::Dict{String, TheoryElement}
    function Theory()
        new(Dict{String, TheoryElement}())
    end
end

# TODO engooden
Base.show(io::IO, theory::Theory) = println(io, theory.data)

Base.values(theory::Theory) = values(theory.data)

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
function Theory(jsontheory::JSON3.Object)
    theory = Theory();
    foreach(jsontheory[:notebook][:cells]) do cell
        @match cell begin
            IsObject(content) => add_to_theory!(theory, content, Val(:Ob))
            IsMorphism(content) => add_to_theory!(theory, content, Val(:Hom))
            x => throw(ImplError(x))
        end
    end
    return theory
end

function add_to_pode!(d::SummationDecapode, 
        vars::Dict{String, Int}, # mapping between UUID and ACSet ID
        theory::Theory, 
        content::JSON3.Object, 
        ::Val{:Ob})
    theory_elem = theory.data[content[:over][:content]] # indexes the theory by UUID
    id = add_part!(d, :Var, name=Symbol(content[:name]), type=nameof(theory_elem))
    push!(vars, content[:id] => id)
    d
end

# TODO we are restricted to Op1
function add_to_pode!(d::SummationDecapode,
        vars::Dict{String, Int}, # mapping between UUID and ACSet ID
        theory::Theory,
        content::JSON3.Object,
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
    end
    d
end

"""  Decapode(jsondiagram::JSON3.Object, theory::Theory) => SummationDecapode

This returns a Decapode given a jsondiagram and a theory.
"""
function Decapode(dict::AbstractDict{Symbol, Any}, theory::Theory)
    # initiatize decapode and its mapping between UUIDs and ACSet IDs
    pode = SummationDecapode(parse_decapode(quote end))
    vars = Dict{String, Int}();
    # for each cell in the notebook, add it to the diagram 
    foreach(dict[:notebook][:cells]) do cell
        @match cell begin
            IsObject(content) => add_to_pode!(pode, vars, theory, content, Val(:Ob))
            IsMorphism(content) => add_to_pode!(pode, vars, theory, content, Val(:Hom))
            _ => throw(ImplError(cell[:content][:tag]))
        end
    end
    pode
end
# the proper name for this constructor should be "SummationDecapode"

function create_mesh()
  s = triangulated_grid(100,100,2,2,Point2{Float64})
  sd = EmbeddedDeltaDualComplex2D{Bool, Float64, Point2{Float64}}(s)
  subdivide_duals!(sd, Circumcenter())

  C = map(sd[:point]) do (x, _); return x end;
  u0 = ComponentArray(C=C)

  return (sd, u0, ())
end

function run_sim(fm, u0, t0, constparam)
    prob = ODEProblem(fm, u0, (0, t0), constparam)
    soln = solve(prob, Tsit5(), saveat=0.1)
end

abstract type AbstractPlotType end

struct Heatmap <: AbstractPlotType end

# TODO make length a conditional value so we can pass it in if we want
function Base.reshape(::Heatmap, data)
    l = floor(Int64, sqrt(length(data)))
    reshape(data, l, l)
end

struct SimResult
    times::Vector{Float64}
    state::Vector{Matrix{SVector{3, Float64}}}
    x::Vector{Float64} # axis
    y::Vector{Float64}
end
# TODO serialize to JSON
# TODO Any is actually Tuple{Axis{(C = 1:2601,)}}

function SimResult(sol::ODESolution, mesh::EmbeddedDeltaDualComplex2D)

    points = collect(values(mesh.subparts.point.m));

    function at_time(sol::ODESolution, timeidx::Int)
        [SVector(i, j, sol.u[timeidx].C[51*(i-1) + j]) for i in 1:51, j in 1:51]
    end
    # TODO indexing by "C", more principled way of indexing (not hardcoding 51)

    state_vals = map(1:length(sol.t)) do i
        at_time(sol, i)
    end

    # TODO engooden
    SimResult(sol.t, state_vals, 0:50, 0:50)
end
# TODO generalize to HasDeltaSet

function Base.show(io::IO, result::SimResult)
    println(io, "Time:\n", result.times)
    println(io, "X-coordinates\n", result.x)
    println(io, "Y-coordinates\n", result.y)
    println(io, "States\n", result.states)
end

function simulate_decapode(json_string::String)
  jsonobj = JSON3.read(json_string)

  # converts the JSON of (the fragment of) the theory
  # into theory of the DEC, valued in Julia
  theory = Theory(jsonobj[:model])

  # this is a diagram in the model of the DEC. it wants to be a decapode!
  diagram = jsonobj[:diagram]

  # pode
  decapode = Decapode(diagram, theory);

  # mesh
  sd, u0, _ = create_mesh();
  # TODO enhancement: generalize this

  # build simulation
  simulator = eval(gensim(decapode));
  f = simulator(sd, default_dec_generate, DiagonalHodge());
  # TODO enhancement: default_dec_generate could be generalized, maybe from the frontend

  # time
  t0 = 10.0;

  out = run_sim(f, u0, t0, ComponentArray(k=0.5,));
  # returns ::ODESolution
  #     - retcode
  #     - interpolation
  #     - t
  #     - u::Vector{ComponentVector}
  
  result = SimResult(out, sd);

  JsonValue(result)

end
