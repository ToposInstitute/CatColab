include("ns_helper.jl")
include("initial_conditions.jl")

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

function Base.push!(diagram::DecapodeDiagram, payload::Payload{ThDecapode}, ob::DiagramObGenerator)
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

function Base.push!(diagram::DecapodeDiagram, payload::Payload{ThDecapode}, mor::DiagramMorGenerator)
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

function DecapodeDiagram(payload::Payload)
    pode = DecapodeDiagram()
    for ob in payload.diagram.ob_generators
        push!(pode, payload, ob)
    end
    for mor in payload.diagram.mor_generators
        push!(pode, payload, mor)
    end
    return pode
end

# TODO move to diagram
function Base.nameof(model::Model, ob::DiagramObGenerator)
    if isnothing(ob.over)
        :no_name
    else
        nameof(model.ob_generators[ob.over.content])
    end
end

function Base.nameof(model::Model, mor::DiagramMorGenerator)
    if isnothing(mor.over)
        :no_name
    else
        nameof(model.mor_generators[mor.over.content])
    end
end

function Base.nameof(model::Model, content::AbstractDict)
    if isnothing(content[:over])
        :no_name
    else
        Symbol(model.data[content[:over][:content]].name)
    end
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

include("simulation.jl")
