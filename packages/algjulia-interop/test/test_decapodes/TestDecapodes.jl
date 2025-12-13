module TestDecapodes

using CatColabInterop
using Test

const DecapodesExt = @ext DecapodesExt("../Project.toml")

include("simulation.jl")

end
