# Build the model

export Model

""" 
A model for the Decapodes integration is the same as the default Model method. 
A dictionary mapping UUID strings with ModelElements is instantiated. 
"""
Model(::ThDecapode) = Model{ThDecapode}(Dict{String, ModelElement}())

""" Helper function to convert CatColab values (Obs) in Decapodes """
function to_model(model::ThDecapode, type::ObTag, name::String)
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
function to_model(model::ThDecapode, type::HomTag, name::String)
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

# add_to_model!

@active IsMorphismNonScalar(x) begin
    x[:morType][:content] == "Nonscalar" ? Some(x) : nothing
end

function add_to_model! end
export add_to_model!

function add_to_model!(model::Model{ThDecapode}, content::AbstractDict, type::ObTag)
    push!(model.data, content[:id] => ModelElement(;name=to_model(ThDecapode(), type, content[:name])))
end

function add_to_model!(model::Model{ThDecapode}, content::AbstractDict, type::HomTag)
    @match content begin
        IsMorphismNonScalar(x) => push!(model.data, content[:id] => 
          ModelElement(;name=to_model(ThDecapode(), type, content[:name]),
                        val=HomValue(content[:dom][:content], 
                                     content[:cod][:content])))
        _ => push!(model.data, content[:id] =>
                   ModelElement(;name=Symbol(content[:name]),
                                val=HomValue(content[:dom][:content],
                                             content[:cod][:content])))
    end
end

function Model(::ThDecapode, path::String)
    json = JSON3.read(read(path, String))
    Model(ThDecapode(), json[:contents][:path])
end

# for each cell, if it is...
#   ...an object, we convert its type to a symbol and add it to the modeldict
#   ...a morphism, we add it to the modeldict with a field for the ids of its
#       domain and codomain to its
function Model(::ThDecapode, model::AbstractVector{<:AbstractDict}) # AbstractDict is the JSON
    newmodel = Model(ThDecapode())
    foreach(model) do cell
        @match cell begin
            IsObject(content) => add_to_model!(newmodel, content, ObTag())
            IsMorphism(content) => add_to_model!(newmodel, content, HomTag())
            _ => throw(ImplError(cell))
        end
    end
    return newmodel
end
export Model
