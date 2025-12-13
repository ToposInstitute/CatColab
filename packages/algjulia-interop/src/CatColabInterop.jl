module CatColabInterop

using TOML

export endpoint 

using MLStyle: @match
using Reexport

""" 
Extend this method with endpoint(::Val{my_analysis_name}) in extension packages.
"""
function endpoint end 

include("Types.jl")
@reexport using .Types

"""
Loads an extension

Usage:

```
    const DecapodesExt = @ext DecapodesExt(relative_path_of_Project.toml)
```
"""
macro ext(body)
    (extension, toml) = @match body begin
        Expr(:call, ex, toml) => (ex, toml)
        ::Symbol => (body, "Project.toml")
        _ => error("!: $body")
    end
    parsed_toml = TOML.parsefile(toml)
    pkgs = Symbol.(parsed_toml["extensions"][String(extension)])
    l = length(pkgs)
    result = Expr(:block)
    for (i, pkg) in enumerate(pkgs)
        push!(result.args, Expr(:macrocall, Symbol("@info"), LineNumberNode(i), "using $pkg ($i/$l)"))
        push!(result.args, Expr(:using, Expr(Symbol("."), pkg)))
    end
    push!(result.args, Expr(:call, Expr(Symbol("."), :Base, QuoteNode(:get_extension)),
        :CatColabInterop, QuoteNode(extension)))
    esc(result)
end
export @ext

end # module
