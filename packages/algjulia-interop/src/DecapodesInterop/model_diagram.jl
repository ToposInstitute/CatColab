""" Helper function to convert CatColab values (Obs) in Decapodes """
function ob_type(name::String)
    @match lowercase(name) begin
        "form0" || "0-form" => :Form0
        "form1" || "1-form" => :Form1
        "form2" || "2-form" => :Form2
        "dualform0" || "dual 0-form" => :DualForm0
        "dualform1" || "dual 1-form" => :DualForm1
        "dualform2" || "dual 2-form" => :DualForm2
        x => throw(ImplError(x))
    end
end

""" Helper function to convert CatColab values (Homs) in Decapodes """
function mor_name(name::String)
    @match replace(name," " => "") begin
        "multiplication" || "*" => :*
        "partial" || "∂t" || "∂ₜ" => :∂ₜ
        "Δ" || "delta" || "laplace" => :Δ
        "Δ⁻¹" || "inv-laplace" => :Δ⁻¹
        "d*" || "d̃₁" || "dual1-d" => :dual_d₁
        "⋆" || "⋆₁" || "★₁" || "★1" || "1-star" => :⋆₁
        "⋆⁻¹" || "⋆₀⁻¹" || "0-inv-star" => :⋆₀⁻¹
        "★" || "★⁻¹" => :⋆₁
        "d" || "d₀" || "d01" || "0-d" => :d₀
        "d12" => :d₁
        "⋆2" => :⋆₂
        "♭♯" || "sharp-flat" => :♭♯
        "-" => :neg
        "wedge00" => :∧₀₀
        "dp-wedge-10" => :∧ᵈᵖ₁₀
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
    nanons = 0
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
            if stmt.cod.content ∉ keys(diagram_names)
                nanons += 1
                id = add_part!(pode, :Var, name=Symbol(nanons), type=:infer)
                push!(vars, stmt.cod.content => id)
                diagram_names[stmt.cod.content] = Symbol(nanons)
            end
            cod = incident(pode, diagram_names[stmt.cod.content], :name)
            name = names[stmt.over.content] |> mor_name
            if length(dom) == 1
                # TODO cursed because I don't like only∘only
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
