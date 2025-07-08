## DIAGRAM BUILDING

function add_to_pode! end
export add_to_pode!

function add_to_pode!(d::SummationDecapode, 
        vars::Dict{String, Int}, # mapping between UUID and ACSet ID
        model::Any, 
        content::AbstractDict,
        nc::Vector{Int},
        ::ObTag)

    # indexes the model by UUID
    model_element = model.data[content[:over][:content]] 
    
    # checks if the cell is an anonymous (intermediate) variable.
    # if so, we increment the intermediate variable counter and make an intermediate variable name. 
    # otherwise we use the existing name of the given content.
    name = if isempty(content[:name])
        nc[1] += 1
        Symbol("•$(nc[1])")
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
        ::HomTag)

    dom = content[:dom][:content]
    cod = content[:cod][:content]
    # TODO we need a safe way to fail this
    if haskey(vars, dom) && haskey(vars, cod)
        # get the name of the Op1 and add it to the model
        op1 = nameof(model, content)
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
    end
    d
end

"""  Decapode(diagram::AbstractVector{<:AbstractDict}, model::Model) => (::SummationDecapode, ::Dict{Symbol, Any}, ::Dict{String, Int}) 

This returns
    1. a Decapode 
    2. a dictionary of symbols mapped to anonymous functions
    3. a dictionary of JSON UUIDs mapped to symbols
"""
function Decapode(diagram::AbstractVector{<:AbstractDict}, model::Model; scalars=[])
    # initiatize decapode and its mapping between UUIDs and ACSet IDs
    pode = SummationDecapode(parse_decapode(quote end))
    vars = Dict{String, Int}() # UUID => ACSetID
    nc = [0] # array is a mutable container
    anons = Dict{Symbol, Any}()
    # for each cell in the notebook, add it to the diagram 
    foreach(diagram) do cell
        @match cell begin
            # TODO merge nameless_count into vars
            IsObject(content) => add_to_pode!(pode, vars, model, content, nc, ObTag())
            IsMorphism(content) => add_to_pode!(pode, vars, model, content, scalars, anons, HomTag())
            _ => throw(ImplError(cell[:content][:tag]))
        end
    end
    return pode, anons, vars
end
export Decapode
# TODO rename to Diagram

function uuid_to_symb(decapode::SummationDecapode, vars::Dict{String, Int})
    Dict([key => (subpart(decapode, vars[key], :name)) for key ∈ keys(vars)])
end
