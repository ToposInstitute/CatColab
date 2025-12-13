
# Example usage:

# julia --project=my_alg_julia_env --threads 4 endpoint.jl Catlab AlgebraicPetri

# Where my_alg_julia_env is a Julia environment with CatColabInterop, Oxygen, 
# HTTP, and any AlgJulia dependencies.

using CatColabInterop
using Oxygen
using HTTP

using TOML
using ArgParse

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

s = ArgParseSettings()
@add_arg_table s begin
    "--toml", "-t"
        arg_type = String
        default = "Project.toml"
    "--pkg", "-p"
        arg_type = String
        default = "CatlabExt"
end
parsed_args = parse_args(ARGS, s)

# TODO
@ext DecapodesExt("../Project.toml")

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
