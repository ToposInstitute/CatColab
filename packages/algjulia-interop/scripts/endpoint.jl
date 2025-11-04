
# Example usage:

# julia --project=my_alg_julia_env --threads 4 endpoint.jl Catlab AlgebraicPetri

# Where my_alg_julia_env is a Julia environment with CatColabInterop, Oxygen, 
# HTTP, and any AlgJulia dependencies.

using CatColabInterop
using Oxygen
using HTTP

const CORS_HEADERS = [
    "Access-Control-Allow-Origin" => "*",
    "Access-Control-Allow-Headers" => "*",
    "Access-Control-Allow-Methods" => "POST, GET, OPTIONS"
]

function CorsHandler(handle)
    return function (req::HTTP.Request)
        # return headers on OPTIONS request
        if HTTP.method(req) == "OPTIONS"
            return HTTP.Response(200, CORS_HEADERS)
        else
            r = handle(req)
            append!(r.headers, ["Access-Control-Allow-Origin" => "*"])
            r

        end
    end
end

defaults = [:Catlab,:ACSets] # all extensions to date

# Dynamically load packages in command lin eargs
for pkg in (isempty(ARGS) ? defaults : ARGS )
  @info "using $pkg"
  @eval using $pkg
end

for m in methods(CatColabInterop.endpoint)
  sig = m.sig.parameters
  (length(sig)==2 && sig[2].instance isa Val) || error("Unexpected signature $sig")
  name = only(sig[2].parameters)
  @info "Loading endpoint $name"
  name isa Symbol || error("Unexpected endpoint name $name")
  fntype, argtypes... = m.sig.types
  invoke(fntype.instance, Tuple{argtypes...}, Val(name))
end

serve(middleware=[CorsHandler])
