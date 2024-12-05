""" Helper function to convert CatColab values (Obs) in Decapodes """
function to_theory(theory::ThDecapode, type::ObType, name::String)
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
function to_theory(theory::ThDecapode, type::HomType, name::String)
    @match replace(name," " => "") begin
        "∂t" || "∂ₜ" => :∂ₜ
        # "∂ₜ" => :∂ₜ
        "Δ" => :Δ
        "Δ⁻¹" => :Δ⁻¹
        "d*" || "d̃₁" => :dual_d₁
        # \star on LHS
        "⋆" => :⋆₁
        "⋆⁻¹" || "⋆₀⁻¹" => :⋆₀⁻¹
         # => :⋆₀⁻¹
        # \bigstar on LHS
        "★" || "★⁻¹" => :⋆₁
         # => :⋆₀⁻¹
        "diffusivity" => :diffusivity
        # new
        "d" || "d₀" || "d01" => :d₀
        "d12" => :d₁
        "⋆1" => :⋆₁
        "⋆2" => :⋆₂
        "♭♯" => :♭♯
        "lamb" => :dpsw # dual-primal self-wedge
        "-" => :neg
        x => throw(ImplError(x))
    end
end

# Build the theory

#=
@active patterns are MLStyle-implementations of F# active patterns that forces us to work in the Maybe/Option pattern. 
Practically, yet while a matter of opinion, they make @match statements cleaner; a statement amounts to a helpful pattern
name and the variables we intend to capture.
=# 
@active IsObject(x) begin
    x[:tag] == "object" ? Some(x) : nothing
end

@active IsMorphism(x) begin
    x[:tag] == "morphism" ? Some(x) : nothing
end

export IsObject, IsMorphism

""" Obs, Homs """
abstract type ElementData end

""" 
Struct capturing the name of the object and its relevant information. 
ElementData may be objects or homs, each of which has different data. 
"""
struct TheoryElement
    name::Union{Symbol, Nothing}
    val::Union{ElementData, Nothing}
    function TheoryElement(;name::Symbol=nothing,val::Any=nothing)
        new(name, val)
    end
end
export TheoryElement

Base.nameof(t::TheoryElement) = t.name

struct ObData <: ElementData end
# TODO not being used right now but added for completeness.

struct HomData <: ElementData
    dom::Any
    cod::Any
    function HomData(;dom::Any,cod::Any)
        new(dom,cod)
    end
end
export HomData
# TODO type dom/cod

""" Struct wrapping a dictionary """
struct Theory{T<:ThDecapode}
    data::Dict{String, TheoryElement}
    function Theory(::T) where T
        new{T}(Dict{String, TheoryElement}())
    end
end
export Theory

# TODO engooden
Base.show(io::IO, theory::Theory) = show(io, theory.data)

Base.values(theory::Theory) = values(theory.data)

function add_to_theory! end; export add_to_theory!

function add_to_theory!(theory::Theory{T}, content::Any, type::ObType) where T
    push!(theory.data, 
          content[:id] => TheoryElement(;name=to_theory(T(), type, content[:name])))
end

function add_to_theory!(theory::Theory{T}, content::Any, type::HomType) where T
    push!(theory.data, content[:id] => 
          TheoryElement(;name=to_theory(T(), type, content[:name]),
                        val=HomData(dom=content[:dom][:content], 
                                    cod=content[:cod][:content])))
end

# for each cell, if it is...
#   ...an object, we convert its type to a symbol and add it to the theorydict
#   ...a morphism, we add it to the theorydict with a field for the ids of its
#       domain and codomain to its
function Theory(model::AbstractVector{JSON3.Object})
    theory = Theory(ThDecapode());
    foreach(model) do cell
        @match cell begin
            IsObject(content) => add_to_theory!(theory, content, ObType())
            IsMorphism(content) => add_to_theory!(theory, content, HomType())
            x => throw(ImplError(x))
        end
    end
    return theory
end
export Theory
# TODO parameterize by theory

