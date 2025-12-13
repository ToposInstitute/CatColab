using Test

# @testset "Catlab" begin
#    include("TestCatlab.jl")
# end

@testset "Decapodes" begin
   include("test_decapodes/model_verification.jl")
   include("test_decapodes/simulation.jl")
end
