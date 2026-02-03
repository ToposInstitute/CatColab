module DecapodesExt

using MLStyle

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

""" Helper function to convert CatColab values (Obs) in Decapodes """
function ob_type(name::String)
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
function mor_name(name::String)
    @match replace(name," " => "") begin
        "∂t" || "∂ₜ" => :∂ₜ
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
        "lamb" => :dpsw # dual-primal self-wedge
        "-" => :neg
        x => throw(ImplError(x))
    end
end

function model_to_pode(m::Types.Model)
    obs, mors = [], []
    names = Dict{String, String}()
    for stmt in m.obGenerators
        names[stmt.id] = only(stmt.label)
        if stmt.obType.content == "Object"
            push!(obs, names[stmt.id])
        end
    end
    for stmt in m.morGenerators
        h = (only(stmt.label), names[stmt.dom.content], names[stmt.cod.content])
        names[stmt.id] = h[1]
        if stmt.morType.content == "Nonscalar"
            push!(mors, h)
        end
    end
    (names, obs, mors)
end
export model_to_pode

function diagram_to_pode(md::Types.ModelDiagram)
    # TODO would be nice to just index the model
    names, obs, mors = model_to_pode(md.model) 

    pode = SummationDecapode(parse_decapode(quote end))
    diagram_names = Dict{String, Symbol}()
    for stmt in md.diagram.obGenerators
        if stmt.obType.content == "Object"
            # TODO label can be a vector
            name = only(stmt.label) # TODO may be integer
            type = ob_type(names[stmt.over.content])
            diagram_names[stmt.id] = Symbol(name)
            id = add_part!(pode, :Var, name=Symbol(name), type=type)
        end
    end
    for stmt in md.diagram.morGenerators
        if stmt.morType.content == "Nonscalar"
            dom = incident(pode, diagram_names[stmt.dom.content], :name)
            cod = incident(pode, diagram_names[stmt.cod.content], :name)
            name = names[stmt.over.content]
            id = add_part!(pode, :Op1, src=only(dom), tgt=only(cod), op1=name)
            if name == :∂ₜ
                add_part!(pode, :TVar, incl=cod)
            end
        end
    end
    infer_types!(pode)
    return pode 
end
export diagram_to_pode

"""
"""

function endpoint(::Val{:Decapodes})
    @post "/decapodes" function (req::HTTP.Request)
        payload = json(req, ModelDiagram)
        pode = diagram_to_pode(payload)
    end
end

end # module
