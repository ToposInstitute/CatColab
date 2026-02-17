#= Build the model

A model for the Decapodes integration is the same as the default Model method. 
A dictionary mapping UUID strings with ModelElements is instantiated. 
=#
function ObGenerator(::ThDecapode, obgen::AbstractDict)
    ObGenerator(obgen[:id], ob_name(ThDecapode(), obgen[:label]), obgen[:obType])
end
export ObGenerator

""" Helper function to convert CatColab values (Obs) in Decapodes """
function ob_name(model::ThDecapode, name::String)
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
export ob_name

ob_name(model::ThDecapode, name::AbstractVector) = ob_name(model, join(String.(name), ""))

# XXX the use of an `only` here means we're being hostile to multiarrows
function MorGenerator(::ThDecapode, ob_generators::Vector{ObGenerator}, morgen::AbstractDict)
    dom = only(filter(ob -> ob.id == morgen[:dom][:content], ob_generators))
    cod = only(filter(ob -> ob.id == morgen[:cod][:content], ob_generators))
    MorGenerator(morgen[:id], mor_name(ThDecapode(), morgen[:label]), morgen[:morType], dom, cod)
end
export MorGenerator

""" Helper function to convert CatColab values (Homs) in Decapodes """
function mor_name(model::ThDecapode, name::String)
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
export mor_name

mor_name(model::ThDecapode, name::AbstractVector) = mor_name(model, join(String.(name), ""))

function Model(::ThDecapode, path::String)
    json = JSON3.read(read(path, String))
    Model(ThDecapode(), json)
end

# for each cell, if it is...
#   ...an object, we convert its type to a symbol and add it to the modeldict
#   ...a morphism, we add it to the modeldict with a field for the ids of its
#       domain and codomain to its
function Model(::ThDecapode, json_model::JSON3.Object) # AbstractDict is the JSON
    ob_generators = ObGenerator.(Ref(ThDecapode()), json_model[:obGenerators])
    mor_generators = MorGenerator.(Ref(ThDecapode()), Ref(ob_generators), json_model[:morGenerators])
    Model(ThDecapode(), ob_generators, mor_generators)
end
export Model
