# - parameterize by the theory. this is currently fixed to decapodes
# - switch to different meshes
# - use enum instead of val

# NOTES:
#   TODO "anonymous objects" are •n

# algebraicjulia dependencies
using ACSets
using DiagrammaticEquations
using Decapodes
using Decapodes: dec_mat_dual_differential, dec_mat_inverse_hodge
using CombinatorialSpaces

# dependencies
import JSON3
using StaticArrays
using MLStyle
using LinearAlgebra
using ComponentArrays
using Distributions # for initial conditions

# meshing
using CoordRefSystems
using GeometryBasics: Point2, Point3
Point3D = Point3{Float64};

using OrdinaryDiffEq

export infer_types!, evalsim, default_dec_generate, default_dec_matrix_generate,
    DiagonalHodge, ComponentArray

struct ImplError <: Exception
    name::String
end

Base.showerror(io::IO, e::ImplError) = print(io, "$(e.name) not implemented")

# funcitons for geometry and initial conditions
include("geometry_and_init.jl")

## THEORY BUILDING

""" Functions to build a dictionary associating ids in the theory to elements in the model"""
function to_decapode_theory end
export to_decapode_theory

""" Helper function to convert CatColab values (Obs) in Decapodes """
function to_decapode_theory(::Val{:Ob}, name::String)
    @match lowercase(name) begin
        "0-form" => :Form0
        "1-form" => :Form1
        "2-form" => :Form2
        "primal 0-form" => :Form0
        "primal 1-form" => :Form1
        "primal 2-form" => :Form2
        "dual 0-form" => :DualForm0
        "dual 1-form" => :DualForm1
        "dual 2-form" => :DualForm2
        x => throw(ImplError(x))
    end
end

""" Helper function to convert CatColab values (Homs) in Decapodes """
function to_decapode_theory(::Val{:Hom}, name::String)
    @match replace(name," " => "") begin
        "∂t" => :∂ₜ
        "∂ₜ" => :∂ₜ
        "Δ" => :Δ
        "Δ⁻¹" => :Δ⁻¹
        "d" => :d₀
        "d*" => :dual_d₁
        "d̃₁" => :dual_d₁
        # \star on LHS
        "⋆" => :⋆₁
        "⋆⁻¹" => :⋆₀⁻¹
        "⋆₀⁻¹" => :⋆₀⁻¹
        # \bigstar on LHS
        "★" => :⋆₁
        "★⁻¹" => :⋆₀⁻¹
        "diffusivity" => :diffusivity
        # new
        "d01" => :d₀
        "d12" => :d₁
        "⋆1" => :⋆₁
        "⋆2" => :⋆₂
        "♭♯" => :♭♯
        "∧ᵈᵖ₁₀(-,⋆d(-))" => :dpsw # dual-primal self-wedge
        "-" => :neg
        x => throw(ImplError(x))
    end
end

# Build the theory

#=
@active patterns are MLStyle-implementations of F# active patterns that forces us to work in the Maybe/Option pattern. 
Practically, yet while a matter of opinion, they make @match statements cleaner; a statement amounts to a helpful pattern
name and the variables we intend to capture.
=# 
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

struct ObData <: ElementData end
# TODO not being used right now but added for completeness.

struct HomData <: ElementData
    dom::Any
    cod::Any
    function HomData(;dom::Any,cod::Any)
        new(dom,cod)
    end
end
export HomData
# TODO type dom/cod

"""Struct wrapping a dictionary"""
struct Theory
    data::Dict{String, TheoryElement}
    function Theory()
        new(Dict{String, TheoryElement}())
    end
end
export Theory

# TODO engooden
Base.show(io::IO, theory::Theory) = show(io, theory.data)

Base.values(theory::Theory) = values(theory.data)

function add_to_theory! end
export add_to_theory!

function add_to_theory!(theory::Theory, content::Any, type::Val{:Ob})
    push!(theory.data, 
          content[:id] => TheoryElement(;name=to_decapode_theory(type, content[:name])))
end

function add_to_theory!(theory::Theory, content::Any, type::Val{:Hom})
    push!(theory.data, content[:id] => 
          TheoryElement(;name=to_decapode_theory(type, content[:name]),
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
    # checks if the cell is an anonymous (intermediate) variable.
    # if so, we increment the intermediate variable counter and make an intermediate variable name. 
    # otherwise we use the existing name of the given content.
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

function op1_name(theory::Theory, content::JSON3.Object)
    Symbol(theory.data[content[:over][:content]].name)
end

# TODO we are restricted to Op1
function add_to_pode!(d::SummationDecapode,
        vars::Dict{String, Int}, # mapping between UUID and ACSet ID
        theory::Theory,
        content::JSON3.Object,
        scalars::Any,
        anons::Dict{Symbol, Any},
        ::Val{:Hom})
    dom = content[:dom][:content]; cod = content[:cod][:content]
    # TODO we need a safe way to fail this
    if haskey(vars, dom) && haskey(vars, cod)
        # get the name of the Op1 and add it to the theory
        op1 = op1_name(theory, content)
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
    vars = Dict{String, Int}(); # UUID => ACSetID
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
    return pode, anons, vars
end
export Decapode
# the proper name for this constructor should be "SummationDecapode"

function init_conditions(vars::Vector{Symbol}, sd::HasDeltaSet)
    c_dist = MvNormal([50, 50], LinearAlgebra.Diagonal(map(abs2, [7.5, 7.5])))
    c = [pdf(c_dist, [p[1], p[2]]) for p in sd[:point]]
    u0 = ComponentArray(; Dict([var=>c for var in vars])...)
    return u0
end

struct PodeSystem
    pode::SummationDecapode
    plotvar::Vector{Symbol}
    scalars::Dict{Symbol, Any} # closures # TODO rename scalars => anons
    mesh::HasDeltaSet
    dualmesh::HasDeltaSet
    init::ComponentArray # TODO Is it always ComponentVector?
    generate::Any
    uuiddict::Dict{Symbol, String}
end
export PodeSystem

"""
Construct a `PodeSystem` object from a JSON string.
"""
function PodeSystem(json_string::String,hodge=GeometricHodge())
    json_object = JSON3.read(json_string);

    # converts the JSON of (the fragment of) the theory
    # into theory of the DEC, valued in Julia
    theory = Theory(json_object[:model]);

    # this is a diagram in the model of the DEC. it wants to be a decapode!
    diagram = json_object[:diagram];

    # any scalars?
    scalars = haskey(json_object, :scalars) ? json_object[:scalars] : [];

    # pode, anons, and vars (UUID => ACSetId)
    decapode, anons, vars = Decapode(diagram, theory; scalars=scalars);
    dot_rename!(decapode)
    uuid2symb = Dict(
        [key => (subpart(decapode, vars[key], :name)) for key ∈ keys(vars)]
    );
    # plotting variables
    plotvars = [uuid2symb[uuid] for uuid in json_object[:plotVariables]];
    
    # create the mesh
    mesh_name = Symbol(json_object[:mesh])
    mesh_builder = predefined_meshes[mesh_name]
    s, sd = create_mesh(mesh_builder)

    # initialize operators
    ♭♯_m = ♭♯_mat(sd);
    wedge_dp10 = dec_wedge_product_dp(Tuple{1,0}, sd);
    dual_d1_m = dec_mat_dual_differential(1, sd);
    star0_inv_m = dec_mat_inverse_hodge(0, sd, hodge)
    Δ0 = Δ(0,sd);
    #fΔ0 = factorize(Δ0);
    # end initialize

    # initial conditions
    ic_specs = json_object[:initialConditions];
    # Dict(:duu => "TaylorVortex")
    dict = Dict([uuid2symb[string(uuid)] => ic_specs[string(uuid)] for uuid ∈ keys(ic_specs)]...)
    u0 = initial_conditions(dict, mesh_builder, sd) 

    function sys_generate(s, my_symbol,hodge=hodge)
        op = @match my_symbol begin
            sym && if sym ∈ keys(anons) end => anons[sym]
                :♭♯ => x -> ♭♯_m * x # [1]
                :dpsw => x -> wedge_dp10(x, star0_inv_m[1]*(dual_d1_m[1]*x))
                :Δ⁻¹ => x -> begin
                y = Δ0 \ x
                y .- minimum(y)
              end 
                _ => default_dec_matrix_generate(s, my_symbol, hodge)
            end
        return (args...) -> op(args...)
    end

    # symbol => uuid. we need this to reassociate the var 
    symb2uuid = Dict([v => k for (k,v) in pairs(uuid2symb)])

    return PodeSystem(decapode, plotvars, anons, s, sd, u0, sys_generate, symb2uuid)
end
export PodeSystem

function run_sim(fm, u0, t0, constparam)
    prob = ODEProblem(fm, u0, (0, t0), constparam)
    soln = solve(prob, Tsit5(), saveat=0.1)
end
export run_sim

struct SimResult
    time::Vector{Float64}
    state::Dict{String, Vector{AbstractArray{SVector{3, Float64}}}}
    x::Vector{Float64} # axis
    y::Vector{Float64}
end
export SimResult

function SimResult(sol::ODESolution, system::PodeSystem)

    points = collect(values(system.mesh.subparts.point.m));
    geometry = length(points[1]) == 2 ? :Rect : :Sphere

    function grid(pt3,grid_size)
        pt2 = [(pt3[1]+1)/2,(pt3[2]+1)/2]
        [round(Int,pt2[1]*grid_size[1]),round(Int,pt2[2]*grid_size[2])]
    end
    l = 0
    function at_time(sol::ODESolution, plotvar::Symbol, timeidx::Int)
        if geometry == :Rect 
            l = 51
            return [SVector(i, j, getproperty(sol.u[timeidx], plotvar)[l*(i-1) + j]) for i in 1:l, j in 1:l]
        else 
            northern_indices = filter(i -> points[i][3]>0,keys(points))
            l = 100
            return map(northern_indices) do n
                i,j = grid(points[n], [l,l])
                SVector(i, j, getproperty(sol.u[timeidx], plotvar)[n])
            end
        end
    end

    function state_vals(plotvar::Symbol)
        map(1:length(sol.t)) do i
            at_time(sol, plotvar, i)
        end
    end
    state_val_dict = Dict([(system.uuiddict[plotvar] => state_vals(plotvar)) for plotvar in system.plotvar])

    # TODO engooden
    # Dict("UUID1" => VectorMatrixSVectr...)
    SimResult(sol.t, state_val_dict, 0:l-1, 0:l-1)
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
