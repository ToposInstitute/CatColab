module TestDecapodes

using CatColabInterop
using DiagrammaticEquations, Decapodes, ACSets
using HTTP, Test, Oxygen, JSON3

const DecapodesExt = Base.get_extension(CatColabInterop, :DecapodesExt)

# Example JSON
#-------------
body = read((@__DIR__)*"/data/diagrams/ns_vort/analysis.json", String)

# Parse the JSON
#---------------
p = JSON3.read(body, Analysis)

# Optinally test the endpoint if running endpoint.jl
resp = HTTP.post("http://127.0.0.1:8080/decapodes"; body)
# @test resp.status == 200

end
