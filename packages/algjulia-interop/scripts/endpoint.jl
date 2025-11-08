
# Example usage:

# julia --project=my_alg_julia_env --threads 4 endpoint.jl Catlab AlgebraicPetri

# Where my_alg_julia_env is a Julia environment with CatColabInterop, Oxygen, 
# HTTP, and any AlgJulia dependencies.

using CatColabInterop
using Oxygen
using HTTP

defaults = [:Catlab,:ACSets] # all extensions to date

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

serve()
