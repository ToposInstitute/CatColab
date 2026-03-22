module DecapodesExt

using ComponentArrays
using Distributions
using MLStyle
using StaticArrays
using LinearAlgebra
using OrdinaryDiffEq

using CombinatorialSpaces
using DiagrammaticEquations
import DiagrammaticEquations: SummationDecapode
using Decapodes
using ACSets

using CatColabInterop, Oxygen, HTTP
import CatColabInterop: endpoint

struct ImplError <: Exception
    name::String
end
export ImplError
Base.showerror(io::IO, e::ImplError) = print(io, "$(e.name) not implemented")

include("geometry.jl")
include("ns_helper.jl")
include("initial_conditions.jl")

""" Helper function to convert CatColab values (Obs) in Decapodes """
function ob_type(name::String)
    @match lowercase(name) begin
        "form0" => :Form0
        "form1" => :Form1
        "form2" => :Form2
        "dualform0" => :DualForm0
        "dualform1" => :DualForm1
        "dualform2" => :DualForm2
        x => throw(ImplError(x))
    end
end

""" Helper function to convert CatColab values (Homs) in Decapodes """
function mor_name(name::String)
    @match replace(name," " => "") begin
        "partial" || "∂t" || "∂ₜ" => :∂ₜ
        "Δ" => :Δ
        "Δ⁻¹" => :Δ⁻¹
        "d*" || "d̃₁" => :dual_d₁
        "⋆" || "⋆₁" || "★₁" || "★1" => :⋆₁
        "⋆⁻¹" || "⋆₀⁻¹" => :⋆₀⁻¹
        "★" || "★⁻¹" => :⋆₁
        "d" || "d₀" || "d01" => :d₀
        "d12" => :d₁
        "⋆2" => :⋆₂
        "♭♯" => :♭♯
        "-" => :neg
        "wedge00" => :∧₀₀
        x => throw(ImplError(x))
    end
end

function Base.getindex(names::Dict{String, T}, modality::CatColabInterop.Types.Modality) where T
    [names[ob.content] for ob in modality.objects]
end

function dec_model(m::Types.Model)
    obs, mors = [], []
    names = Dict{String, String}()
    for stmt in m.obGenerators
        names[stmt.id] = only(stmt.label)
        if stmt.obType.content == "Object"
            push!(obs, names[stmt.id])
        end
    end
    for stmt in m.morGenerators
        mor = only(stmt.label)
        # Modality("List", [ObType("Basic", "..id")])
        dom = names[stmt.dom.content]
        cod = names[stmt.cod.content]
        names[stmt.id] = mor
        if stmt.morType.content == "Nonscalar"
            push!(mors, (mor, dom, cod))
        end
    end
    (names, obs, mors)
end

function diagram_to_pode(m::Types.Model, d::Types.Diagram)
    # TODO would be nice to just index the model
    names, obs, mors = dec_model(m) 

    vars = Dict{String, Int}()
    pode = SummationDecapode(parse_decapode(quote end))
    diagram_names = Dict{String, Symbol}()
    for stmt in d.obGenerators
        if stmt.obType.content == "Object"
            # TODO label can be a vector
            name = only(stmt.label) # TODO may be integer
            type = ob_type(names[stmt.over.content])
            id = add_part!(pode, :Var, name=Symbol(name), type=type)
            push!(vars, stmt.id => id)
            diagram_names[stmt.id] = Symbol(name)
        end
    end
    for stmt in d.morGenerators
        if stmt.morType.content == "Multihom"
            dom = incident(pode, diagram_names[stmt.dom.content], :name)
            cod = incident(pode, diagram_names[stmt.cod.content], :name)
            name = names[stmt.over.content] |> mor_name
            if length(dom) == 1
                # TODO cursed
                id = add_part!(pode, :Op1, src=only(only(dom)), tgt=only(cod), op1=name)
            end
            if length(dom) == 2
                id = add_part!(pode, :Op2, proj1=only(dom[1]), proj2=only(dom[2]), res=only(cod), op2=Symbol(name))
            end
            # TODO sum
            if name == :∂ₜ
                add_part!(pode, :TVar, incl=only(cod))
            end
        end
    end
    infer_types!(pode)
    return pode, vars 
end
export diagram_to_pode

diagram_to_pode(md::Types.ModelDiagram) = diagram_to_pode(md.model, md.diagram)

struct DecapodesSystem
    pode::SummationDecapode
    geometry::Geometry
    init::ComponentArray
    duration::Int
    generate::Any
    scalars::Dict{Symbol, Any}
    plotVariables::Vector{String}
    uuiddict::Dict{Symbol, String}
end

function DecapodesSystem(a::Types.Analysis; hodge=GeometricHodge())
    pode, vars = diagram_to_pode(a.model, a.diagram)
    analysis = a.analysis
    # @assert Set([:duration, :plotVariables, :domain, :mesh, :initialConditions, :scalars]) == keys(analysis)
  
    duration = analysis["duration"]
    plotVariables = analysis["plotVariables"]
    geometry = Geometry(analysis)

    # define the generate function
    ♭♯_m = ♭♯_mat(geometry.dualmesh)
    Δ0 = Δ(0,geometry.dualmesh)
    function sys_generate(s, my_symbol)
        op = @match my_symbol begin
            # sym && if haskey(diagram.scalars, sym) end => x -> begin
            #     k = scalars[diagram.scalars[sym]]
            #     k * x
            # end
            :♭♯ => x -> ♭♯_m * x
            :Δ⁻¹ => x -> begin
                y = Δ0 \ x
                y .- minimum(y)
            end
            :wedge00 => (x,y) -> ∧₀₀(x,y)
            _ => default_dec_matrix_generate(s, my_symbol, hodge)
        end
        return (args...) -> op(args...)
    end

    # uuid2symb
    function uuid_to_symb(decapode::SummationDecapode, vars::Dict{String, Int})
        Dict{String, Symbol}([key => (subpart(decapode, vars[key], :name)) for key ∈ keys(vars)])
    end

    # dot_rename!(pode)
    uuid2symb = uuid_to_symb(pode, vars)

    # initial conditions
    @info analysis["initialConditions"]
    u0 = initial_conditions(analysis["initialConditions"], geometry, uuid2symb)

    symb2uuid = Dict([ v => k for (k, v) in pairs(uuid2symb)])
    
    # return the system
    return DecapodesSystem(pode, geometry, u0, duration, sys_generate, Dict(), plotVariables, symb2uuid) 
end

# SIMULATION

function run_sim(fm, u0, t0, constparam)
    prob = ODEProblem(fm, u0, (0, t0), constparam)
    soln = solve(prob, Tsit5(), saveat=0.01)
end

struct SimulationResult
    time::Vector{Float64}
    state::Dict{String, Vector{AbstractArray{SVector{3, Float64}}}}
    x::Vector{Float64}
    y::Vector{Float64}
end

function SimulationResult(soln::ODESolution, system::DecapodesSystem)
    idx_bounds = indexing_bounds(system.geometry.domain)
    state_val_dict = variables_state(soln, system) # Dict("UUID1" => VectorMatrixSVectr...)
    SimulationResult(soln.t, state_val_dict, 0:idx_bounds.x, 0:idx_bounds.y)
end

""" for the variables in a system, associate them to their state values over the duration of the simulation """
function variables_state(soln::ODESolution, system::DecapodesSystem)
    # plottedVars = [ k for (k, v) in system.plotVariables if v == true ] # TODO we just pass a list of variables that we're plotting
    uuid2symb = Dict([ v => k for (k, v) in system.uuiddict]) # TODO why reverse again?
    Dict([ String(uuid2symb[var]) => state_entire_sim(soln, system, uuid2symb[var]) for var ∈ system.plotVariables ])
end


""" given a simulation, a domain, and a variable, gets the state values over the duration of a simulation. 
Called by `variables_state`[@ref] """
state_entire_sim(soln::ODESolution, system::DecapodesSystem, var::Symbol) = [state_at_time(soln, system, var, i) for i in 1:length(soln.t)]

# TODO type `points`
function state_at_time(soln::ODESolution, system::DecapodesSystem, plotvar::Symbol, t::Int)
    @match system.geometry.domain begin
        # TODO check time indexing here
        domain::Rectangle => state_at_time(soln, domain, plotvar, t) 
        domain::Sphere => state_at_time(soln, domain, plotvar, t, points(system)) 
        _ => throw(ImplError("state_at_time function for domain $domain"))
    end
end

function state_at_time(soln::ODESolution, domain::Rectangle, var::Symbol, t::Int)
    (x, y) = indexing_bounds(domain)
    [SVector(i, j, getproperty(soln.u[t], var)[(x+1)*(i-1) + j]) for i in 1:x+1, j in 1:y+1]
end

# TODO just separated this from the SimResult function and added type parameters, but need to generalize
function grid(pt3::Point3, grid_size::Vector{Int})
    pt2 = [(pt3[1]+1)/2, (pt3[2]+1)/2]
    [round(Int, pt2[1]*grid_size[1]), round(Int, pt2[2]*grid_size[2])]
end

function state_at_time(soln::ODESolution, domain::Sphere, var::Symbol, t::Int, points)
    l , _ = indexing_bounds(domain) # TODO this is hardcoded to return 100, 100
    northern_indices = filter(i -> points[i][3] > 0, keys(points)) 
    map(northern_indices) do n
        i, j = grid(points[n], [l, l]) # TODO
        SVector(i, j, getproperty(soln.u[t], var)[n])
    end
end

function endpoint(::Val{:Decapodes})
    @post "/decapodes" function (req::HTTP.Request)
        analysis = json(req, Analysis)
        system = DecapodesSystem(analysis)
        simulator = evalsim(system.pode)
        f = Base.invokelatest(simulator, system.geometry.dualmesh, system.generate, DiagonalHodge())
        soln = run_sim(f, system.init, system.duration, ComponentArray(k=0.5,))
        SimulationResult(soln, system)
    end
end

function endpoint(::Val{:DecapodesOptions})
    @get "/decapodes-options" function (req::HTTP.Request)
        supported_decapodes_geometries()
    end
end

end # module
