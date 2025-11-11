module CatColabInterop

export endpoint 

using Reexport

""" 
Extend this method with endpoint(::Val{my_analysis_name}) in extension packages.
"""
function endpoint end 

include("Types.jl")
@reexport using .Types

end # module
