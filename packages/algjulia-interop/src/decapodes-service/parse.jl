"""    DecapodeSimulation

This analysis contains the data necessary to execute a simulation.
"""
struct DecapodeSimulation <: AbstractAnalysis{ThDecapode}
    pode::SummationDecapode
    plotVariables::Dict{String, Bool}
    scalars::Dict{Symbol, Any} # closures
    geometry::Geometry
    init::ComponentArray
    generate::Any
    uuiddict::Dict{Symbol, String}
    duration::Int
end
export DecapodeSimulation

function DecapodeSimulation(path::String; kwargs...)
    payload = DiagramPayload(ThDecapode(), path)
    DecapodeSimulation(payload; kwargs...)
end

function DecapodeSimulation(json::AbstractDict; kwargs...)
    payload = DiagramPayload(ThDecapode(), json)
    DecapodeSimulation(payload; kwargs...)
end

function DecapodeSimulation(payload::DiagramPayload{ThDecapode}; hodge=GeometricHodge())
    wrapped = DecapodeDiagram(payload)
    plotVars = @match payload[:plotVariables] begin
        vars::AbstractArray => Dict{String, Bool}(key => key ∈ vars for key ∈ keys(wrapped.vars))
        vars => Dict{String, Bool}( "$key" => var for (key, var) in vars) # TODO
    end
    dot_rename!(wrapped.pode)
    uuid2symb = uuid_to_symb(wrapped.pode, wrapped.vars)
    geometry = Geometry(payload) # TODO
    ♭♯_m = ♭♯_mat(geometry.dualmesh)
    wedge_dp10 = dec_wedge_product_dp(Tuple{1,0}, geometry.dualmesh)
    dual_d1_m = dec_dual_derivative(1, geometry.dualmesh)
    star0_inv_m = dec_inv_hodge_star(0, geometry.dualmesh, hodge)
    Δ0 = Δ(0,geometry.dualmesh)
    #fΔ0 = factorize(Δ0);
    function sys_generate(s, my_symbol)
        op = @match my_symbol begin
            sym && if haskey(wrapped.scalars, sym) end => x -> begin
                k = scalars[wrapped.scalars[sym]]
                k * x
            end
            :♭♯ => x -> ♭♯_m * x
            # TODO are we indexing right?
            :dpsw => x -> wedge_dp10(x, star0_inv_m*(dual_d1_m*x))
            :Δ⁻¹ => x -> begin
                y = Δ0 \ x
                y .- minimum(y)
            end
            _ => default_dec_matrix_generate(s, my_symbol, hodge)
        end
        return (args...) -> op(args...)
    end
    #
    u0 = initial_conditions(payload[:initialConditions], geometry, uuid2symb)

    # reversing `uuid2symb` into `symbol => uuid.` we need this to reassociate the var to its UUID 
    symb2uuid = Dict([v => k for (k,v) in pairs(uuid2symb)])

    # TODO what is anons doing here?
    anons = Dict{Symbol, Any}()
    DecapodeSimulation(wrapped.pode, plotVars, wrapped.scalars, geometry, u0, sys_generate, symb2uuid, payload[:duration])
end

Base.show(io::IO, system::DecapodeSimulation) = println(io, system.pode)

# =======================================================================================

#=
We produce a ModelDiagramPresentation and Analysis data from the CCL payload.
The Simulation analysis constructs the actual simulation data
=#
@kwdef mutable struct DecapodeDiagram
    pode::SummationDecapode = SummationDecapode(parse_decapode(quote end))
    scalars::Dict{Symbol, String} = Dict{Symbol, String}()
    vars::Dict{String, Int} = Dict{String, Int}()
    nc::Dict{Int, String} = Dict{Int, String}()
end

function Base.push!(diagram::DecapodeDiagram, payload::DiagramPayload{ThDecapode}, ob::DiagramObGenerator)
    model_element = only(filter(x -> x.id == ob.over.content, payload.model.ob_generators))
    name = if isempty(ob.label)
        id = isempty(keys(diagram.nc)) ? 1 : maximum(keys(diagram.nc)) + 1
        push!(diagram.nc, id => "")
        Symbol("•$id")
    else
        Symbol(ob.label)
    end
    id = add_part!(diagram.pode, :Var, name=name, type=nameof(model_element))
    push!(diagram.vars, ob.id => id)
    diagram
end

function Base.push!(diagram::DecapodeDiagram, payload::DiagramPayload{ThDecapode}, mor::DiagramMorGenerator)
    # TODO is this the right field to index
    dom = mor.dom
    cod = mor.cod
    dom_id = check_endpoint!(diagram, dom)
    cod_id = check_endpoint!(diagram, cod)
    # get the name of the Op1 and add it to the model
    op1 = nameof(payload.model, mor)
    add_part!(diagram.pode, :Op1, src=dom_id, tgt=cod_id, op1=op1)
    if op1 == :∂ₜ
        add_part!(diagram.pode, :TVar, incl=cod_id)
    end
    if mor.morType.content isa JSON3.Object
        scalar = payload.model.mor_generators[mor.over.content]
        push!(diagram.scalars, scalar.label => mor.over.content)
    end
    diagram
end

function DecapodeDiagram(payload::DiagramPayload)
    diagram = DecapodeDiagram()
    for ob in payload.diagram.ob_generators
        push!(diagram, payload, ob)
    end
    for mor in payload.diagram.mor_generators
        push!(diagram, payload, mor)
    end
    return diagram
end

# endpoint being `dom` or `codom`
function check_endpoint!(diagram::DecapodeDiagram, endpoint::DiagramObGenerator)
    if haskey(diagram.vars, endpoint.id)
        diagram.vars[endpoint.id]
    else
        if endpoint.id ∉ values(diagram.nc)
            id = isempty(keys(diagram.nc)) ? 1 : length(keys(diagram.nc)) + 1
            name = Symbol("•$id")
            acset_id = add_part!(diagram.pode, :Var, name=name, type=:infer)
            push!(diagram.nc, acset_id => endpoint.label)
            acset_id
        else
            out = filter(x -> x[2] == endpoint, pairs(diagram.nc))
            first(keys(out))
        end
    end
end

# =======================================================================================

function uuid_to_symb(decapode::SummationDecapode, vars::Dict{String, Int})
    Dict([key => (subpart(decapode, vars[key], :name)) for key ∈ keys(vars)])
end
