# TODO change to Analysis

@kwdef mutable struct DecapodeDiagram
    pode::SummationDecapode = SummationDecapode(parse_decapode(quote end))
    scalars::Dict{Symbol, String} = Dict{Symbol, String}()
    vars::Dict{String, Int} = Dict{String, Int}()
    nc::Dict{Int, String} = Dict{Int, String}()
end

function Base.push!(diagram::DecapodeDiagram, analysis::Analysis, ob::DiagramObGenerator)
    model_elem = only(filter(x->x.id==ob.over.content, analysis.model.obGenerators))
    name = if isempty(ob.label)
        id = isempty(keys(diagram.nc)) ? 1 : maximum(keys(diagram.mc)) + 1
        push!(diagram.nc, id => "")
        Symbol("•$id")
    else
        Symbol(join(string.(ob.label),"."))
    end
    id = add_part!(diagram.pode, :Var, name=name, type=nameof(model_elem))
    push!(diagram.vars, ob.id => id)
    diagram
end

# TODO remove only when we have multiple source/targets
function mor_dom(diagram::Diagram, mor::DiagramMorGenerator)
    filter(ob -> ob.id == mor.dom.content, diagram.obGenerators) |> only
end

function mor_cod(diagram::Diagram, mor::DiagramMorGenerator)
    filter(ob -> ob.id == mor.dom.content, diagram.obGenerators) |> only
end

function Base.nameof(model::Model, mor::DiagramMorGenerator)
    model_mor = filter(m -> m.id == mor.over.content, model.morGenerators) |> only
    join(model_mor.label, ".") # TODO
end

function Base.push!(diagram::DecapodeDiagram, analysis::Analysis, mor::DiagramMorGenerator)
    dom = mor_dom(analysis.diagram, mor) # get ObGenerator
    cod = mor_cod(analysis.diagram, mor)
    dom_id = check_endpoint!(diagram, dom)
    cod_id = check_endpoint!(diagram, cod)
    # get the name of the Op1 and add it to the model
    op1 = nameof(analysis.model, mor)
    add_part!(diagram.pode, :Op1, src=dom_id, tgt=cod_id, op1=op1)
    if op1 == :∂ₜ
        add_part!(diagram.pode, :TVar, incl=cod_id)
    end
    if mor.morType.content isa JSON3.Object
        scalar = analysis.model.mor_generators[mor.over.content]
        push!(diagram.scalars, scalar.label => mor.over.content)
    end
    diagram
end

function DecapodeDiagram(analysis::Analysis)
    diagram = DecapodeDiagram()
    for ob in analysis.diagram.obGenerators
        push!(diagram, analysis, ob)
    end
    for mor in analysis.diagram.morGenerators
        push!(diagram, analysis, mor)
    end
    return diagram
end

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

function uuid_to_symb(decapode::SummationDecapode, vars::Dict{String, Int})
    Dict([key => (subpart(decapode, vars[key], :name)) for key ∈ keys(vars)])
end
