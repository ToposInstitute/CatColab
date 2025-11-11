module TestCatlab 

using CatColabInterop, Catlab
using Catlab.CategoricalAlgebra.Pointwise.FunctorialDataMigrations.Yoneda: 
  colimit_representables
using HTTP, Test, Oxygen, JSON3
const CatlabExt = Base.get_extension(CatColabInterop, :CatlabExt)

# Example JSON
#-------------
body = read((@__DIR__)*"/data/diagrams/acset.json", String)

# Parse the JSON
#---------------
p = JSON3.read(body, ModelDiagram)

# Convert to ACSet 
#-----------------
schema, names = CatlabExt.model_to_schema(p.model)
acset_type = AnonACSet(
  schema; type_assignment=Dict(a=>Nothing for a in schema.attrtypes))
y = yoneda(constructor(acset_type))
data = CatlabExt.diagram_to_data(p.diagram, names)
res = colimit_representables(data, y)

# This is what we expect
#------------------------
expected = acset_type
add_part!.(Ref(expected), [:X,:Y,:Z])
expected[1, :f] = 1
expected[1, :g] = AttrVar(1)

@test is_isomorphic(res, expected)

# Test final JSON output
#-----------------------
expected_json = Dict(:Z => 1,:f => [1],:X => 1,:Y => 1,:g => [1])
@test expected_json == acset_to_json(res, schema)

# Optionally test the endpoint if running endpoint.jl:
# resp = HTTP.post("http://127.0.0.1:8080/acsetcolim"; body)
# @test resp.status == 200

end # module
