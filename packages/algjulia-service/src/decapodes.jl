import JSON3

export simulate_decapode

function simulate_decapode(json_string::String)
  data = JSON3.read(json_string)

  # TODO: Do stuff

  result = rand(Float32, 10)
  JsonValue(result)
end
