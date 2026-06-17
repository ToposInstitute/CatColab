module CatColabInterop

export endpoint 

using Reexport

""" Extend this method with endpoint(::Val{my_analysis_name}). """
function endpoint end 

include("Types.jl")
@reexport using .Types

include("CatlabInterop.jl")
# Add more interops here...

using Oxygen, HTTP

function endpoint(::Val{:Test})
  @post "/decapodes" function(req::HTTP.Request)
    @info req.response
  end
end

end # module
