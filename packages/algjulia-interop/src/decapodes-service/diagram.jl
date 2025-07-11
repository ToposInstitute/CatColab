## DIAGRAM BUILDING


@kwdef mutable struct DecapodeDiagram <: AbstractDiagram{ThDecapode}
    pode::SummationDecapode = SummationDecapode(parse_decapode(quote end))
    scalars::Dict{Symbol, String} = Dict{Symbol, String}()
    vars::Dict{String, Int} = Dict{String, Int}()
    nc::Dict{Int, String} = Dict{Int, String}()
end

function Base.nameof(model::Model, content::AbstractDict)
    if isnothing(content[:over])
        :no_name
    else
        Symbol(model.data[content[:over][:content]].name)
    end
end

# endpoint being `dom` or `codom`
function check_endpoint!(diagram::DecapodeDiagram, endpoint)
    if haskey(diagram.vars, endpoint)
        diagram.vars[endpoint]
    else
        if endpoint ∉ values(diagram.nc)
            id = isempty(keys(diagram.nc)) ? 1 : length(keys(diagram.nc)) + 1
            name = Symbol("•$id")
            acset_id = add_part!(diagram.pode, :Var, name=name, type=:infer)
            push!(diagram.nc, acset_id => endpoint)
            acset_id
        else
            out = filter(x -> x[2] == endpoint, pairs(diagram.nc))
            first(keys(out))
        end
    end
end

function add_to_pode!(diagram::DecapodeDiagram,
        model::Any, 
        content::AbstractDict,
        ::ObTag)
    # indexes the model by UUID
    model_element = model.data[content[:over][:content]] 
    # checks if the cell is an anonymous (intermediate) variable.
    # if so, we increment the intermediate variable counter and make an intermediate variable name. 
    # otherwise we use the existing name of the given content.
    name = if isempty(content[:name])
        id = isempty(keys(diagram.nc)) ? 1 : maximum(keys(diagram.nc)) + 1
        push!(diagram.nc, id => "")
        Symbol("•$id")
    else
        Symbol(content[:name])
    end 
    id = add_part!(diagram.pode, :Var, name=name, type=nameof(model_element))
    push!(diagram.vars, content[:id] => id)
    return diagram
end
export add_to_pode!

# TODO we are restricted to Op1
function add_to_pode!(diagram::DecapodeDiagram,
        model::Model{ThDecapode},
        content::AbstractDict,
        ::HomTag)
    dom = content[:dom][:content]
    cod = content[:cod][:content]

    # TODO Simpler to extend the Decapodes Var table by a UUID attribute
    dom_id = check_endpoint!(diagram, dom)
    cod_id = check_endpoint!(diagram, cod)

    # get the name of the Op1 and add it to the model
    op1 = nameof(model, content)

    add_part!(diagram.pode, :Op1, src=dom_id, tgt=cod_id, op1=op1)
    # we need to add an inclusion to the TVar table
    if op1 == :∂ₜ
        add_part!(diagram.pode, :TVar, incl=cod_id)
    end
    if content[:morType][:content] isa JSON3.Object
        scalar = model.data[content[:over][:content]].name
        push!(diagram.scalars, scalar => content[:over][:content])
    end
    diagram
end

"""  Diagram(diagram::AbstractVector{<:AbstractDict}, model::Model{ThDecapode}) => (::SummationDecapode, ::Dict{Symbol, Any}, ::Dict{String, Int}) 

This returns
    1. a Decapode 
    2. a dictionary of symbols mapped to anonymous functions
    3. a dictionary of JSON UUIDs mapped to symbols
"""
function Diagram(json_array::JSON3.Array{T}, model::Model{ThDecapode}; scalars=[]) where T
    diagram = DecapodeDiagram()
    for cell in json_array
        cell = haskey(cell, :content) ? cell[:content] : cell
        @match cell begin
            content && if haskey(content, :obType) end => add_to_pode!(diagram, model, content, ObTag())
            content && if haskey(content, :morType) end => add_to_pode!(diagram, model, content, HomTag())
            _ => throw(ImplError(cell))
        end
    end
    return diagram
end
export Diagram

function Diagram(json_diagram::JSON3.Object, model::Model{ThDecapode}; scalars=[])
    Diagram(json_diagram[:cells], model; scalars)
end

function uuid_to_symb(decapode::SummationDecapode, vars::Dict{String, Int})
    Dict([key => (subpart(decapode, vars[key], :name)) for key ∈ keys(vars)])
end
