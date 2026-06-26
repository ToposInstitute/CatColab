module CatColabInterop

export endpoint 

using Reexport

include("util.jl")

""" Extend this method with endpoint(::Val{my_analysis_name}). """
function endpoint end 

include("Types.jl")
@reexport using .Types

# include("CatlabInterop.jl")
include("DecapodesInterop/DecapodesInterop.jl")
# Add more interops here...

using Oxygen, HTTP

end # module
