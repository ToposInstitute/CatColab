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
names, res = colimit_representables(data, y)

S = acset_schema(res)

# This is what we expect
#------------------------
expected = acset_type
add_part!.(Ref(expected), [:X,:Y,:Z])
expected[1, :f] = 1
expected[1, :g] = AttrVar(1)

@test is_isomorphic(res, expected)

# Test final JSON output
#-----------------------
expected_json = Dict(:Z => ["z"],:f => ["y"],:X => ["x"],:Y => ["y"],:g => ["z"])
@test expected_json == CatlabExt.acset_to_json(res, schema, CatlabExt.make_names(res, names))

# Optionally test the endpoint if running endpoint.jl:
# resp = HTTP.post("http://127.0.0.1:8080/acsetcolim"; body)
# @test resp.status == 200

# Test make_names on a more complicated example
#----------------------------------------------
@present SchThree(FreeSchema) begin (A,B,C)::Ob; f::Hom(A,B); g::Hom(B,C) end
@acset_type T(SchThree)
exT = @acset T begin A=2; B=3; C=3; f=[2,3]; g=[2,3,2] end
names = (z=(:C, 1), y= (:B, 1), x = (:A, 1), x2 = (:A, 2))
@test CatlabExt.make_names(exT, names) == Dict(:A=>["x","x2"], :B=>["y","f(x)","f(x2)"], :C=>["z","g(y)","g(f(x))"])

end # module
