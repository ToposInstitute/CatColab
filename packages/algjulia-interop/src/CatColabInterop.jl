module CatColabInterop

export endpoint 

using Reexport

""" Extend this method with endpoint(::Val{my_analysis_name}). """
function endpoint end 

include("Types.jl")
@reexport using .Types

include("CatlabInterop.jl")
include("DecapodesInterop/DecapodesInterop.jl")
# Add more interops here...


end # module
