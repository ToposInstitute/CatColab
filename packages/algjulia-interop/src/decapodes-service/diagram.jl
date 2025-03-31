## DIAGRAM BUILDING

function add_to_pode! end
export add_to_pode!

function add_to_pode!(d::SummationDecapode, 
        vars::Dict{String, Int}, # mapping between UUID and ACSet ID
        model::Any, 
        content::AbstractDict,
        nc::Dict{Int, String},
        ::ObTag)

    # indexes the model by UUID
    model_element = model.data[content[:over][:content]] 
    
    # checks if the cell is an anonymous (intermediate) variable.
    # if so, we increment the intermediate variable counter and make an intermediate variable name. 
    # otherwise we use the existing name of the given content.
    name = if isempty(content[:name])
        id = isempty(keys(nc)) ? 1 : maximum(keys(nc)) + 1
        push!(nc, id => "")
        Symbol("•$id")
    else
        Symbol(content[:name])
    end 
    id = add_part!(d, :Var, name=name, type=nameof(model_element))
    push!(vars, content[:id] => id)
    return d
end

function Base.nameof(model::Model, content::AbstractDict)
    Symbol(model.data[content[:over][:content]].name)
end

# TODO we are restricted to Op1
function add_to_pode!(d::SummationDecapode,
        vars::Dict{String, Int}, # mapping between UUID and ACSet ID
        model::Model{ThDecapode},
        content::AbstractDict,
        scalars::Any,
        anons::Dict{Symbol, Any},
        nc::Dict{Int, String},
        ::HomTag)

    dom = content[:dom][:content]
    cod = content[:cod][:content]

    # TODO Simpler to extend the Decapodes Var table by a UUID attribute
    dom_id = if haskey(vars, dom)
        vars[dom]
    else
        if dom ∉ values(nc)
            id = isempty(keys(nc)) ? 1 : length(keys(nc)) + 1
            name = Symbol("•$id")
            acset_id = add_part!(d, :Var, name=name)
            push!(nc, acset_id => dom)
            acset_id
        else
            out = filter(x -> x[2] == dom, pairs(nc))
            first(keys(out))
        end
    end
    cod_id = if haskey(vars, cod)
        vars[cod]
    else
        if cod ∉ values(nc)
            id = isempty(keys(nc)) ? 1 : length(keys(nc)) + 1
            name = Symbol("•$id")
            acset_id = add_part!(d, :Var, name=name)
            push!(nc, acset_id => cod)
            acset_id
        else
            out = first(keys(filter(x -> x[2] == cod, pairs(nc))))
            out
        end
    end

    # get the name of the Op1 and add it to the model
    op1 = nameof(model, content)

    add_part!(d, :Op1, src=dom_id, tgt=cod_id, op1=op1)
    # we need to add an inclusion to the TVar table
    if op1 == :∂ₜ
        add_part!(d, :TVar, incl=cod_id)
    end
    # if the dom is anonymous, we treat it as a something which will receive x -> k * x.
    # we store its value in another array
    if !isempty(scalars) && haskey(scalars, Symbol(content[:over][:content]))
        scalar = scalars[Symbol(content[:over][:content])]
        push!(anons, op1 => x -> scalar * x)
    end
    d
end

struct DecapodeDiagram <: AbstractDiagram{ThDecapode}
    pode::SummationDecapode
    anons::Dict{Symbol, Any}
    vars::Dict{String, Int}
end


"""  Diagram(diagram::AbstractVector{<:AbstractDict}, model::Model{ThDecapode}) => (::SummationDecapode, ::Dict{Symbol, Any}, ::Dict{String, Int}) 

This returns
    1. a Decapode 
    2. a dictionary of symbols mapped to anonymous functions
    3. a dictionary of JSON UUIDs mapped to symbols
"""
function Diagram(json_diagram::JSON3.Object, model::Model{ThDecapode}; scalars=[])
    # initiatize decapode and its mapping between UUIDs and ACSet IDs
    pode = SummationDecapode(parse_decapode(quote end))
    vars = Dict{String, Int}() # UUID => ACSetID
    nc = Dict{Int, String}() # array is a mutable container
    anons = Dict{Symbol, Any}()
    # for each cell in the notebook, add it to the diagram
    foreach(json_diagram[:cells]) do cell
        @match cell begin
            # TODO merge nameless_count into vars
            IsObject(content) => add_to_pode!(pode, vars, model, content, nc, ObTag())
            IsMorphism(content) => add_to_pode!(pode, vars, model, content, scalars, anons, nc, HomTag())
            _ => throw(ImplError(cell[:content][:tag]))
        end
    end
    return DecapodeDiagram(pode, anons, vars)
end
export Diagram
# TODO rename to Diagram

function uuid_to_symb(decapode::SummationDecapode, vars::Dict{String, Int})
    Dict([key => (subpart(decapode, vars[key], :name)) for key ∈ keys(vars)])
end
