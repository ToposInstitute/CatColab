@testset "Text-to-Pode" begin
    @test ob_name(ThDecapode(), "0-form")      == :Form0
    @test ob_name(ThDecapode(), "1-form")      == :Form1
    @test ob_name(ThDecapode(), "2-form")      == :Form2
    @test ob_name(ThDecapode(), "dual 0-form") == :DualForm0
    @test ob_name(ThDecapode(), "dual 1-form") == :DualForm1
    @test ob_name(ThDecapode(), "dual 2-form") == :DualForm2
    @test_throws CatColabInterop.ImplError ob_name(ThDecapode(), "Form3")
    @test mor_name(ThDecapode(), "∂t") == :∂ₜ
    @test mor_name(ThDecapode(), "Δ") == :Δ
    @test_throws CatColabInterop.ImplError mor_name(ThDecapode(), "∧") 
end

@testset "Validate model" begin
    # caveat: \star and \bigstar are different, but indistinguishable in some fonts
    @test Set(nameof.(values(model_dec))) == Set([:DualForm1, :⋆₀⁻¹, :dual_d₁, :dpsw, :Form1, :neg, :⋆₁, :DualForm2, :Form0, :Δ⁻¹, :♭♯, :∂ₜ, :d₀])
end

@testset "Analysis - Inverse Laplacian" begin
    handcrafted_pode = SummationDecapode(parse_decapode(quote end))
    add_part!(handcrafted_pode, :Var, name=:u, type=:Form0)
    add_part!(handcrafted_pode, :Var, name=Symbol("du/dt"), type=:Form0)
    add_part!(handcrafted_pode, :Op1, src=1, tgt=2, op1=:Δ⁻¹)
    simulation = DecapodeSimulation("test/test_jsons/_payload.json")
    @test simulation[:pode] == handcrafted_pode
end
 
@testset "Analysis - Inverse Laplacian, Long trip" begin
    handcrafted_pode = SummationDecapode(parse_decapode(quote end))
    add_part!(handcrafted_pode, :Var, name=:u, type=:DualForm2)
    add_part!(handcrafted_pode, :Var, name=Symbol("du/dt"), type=:DualForm2)
    add_part!(handcrafted_pode, :Var, name=Symbol("•1"), type=:Form0)
    add_part!(handcrafted_pode, :Var, name=Symbol("•2"), type=:Form1)
    add_part!(handcrafted_pode, :Var, name=Symbol("•3"), type=:DualForm1)
    add_part!(handcrafted_pode, :TVar, incl=2)
    add_part!(handcrafted_pode, :Op1, src=1, tgt=3, op1=:⋆₀⁻¹)
    add_part!(handcrafted_pode, :Op1, src=3, tgt=4, op1=:d₀)
    add_part!(handcrafted_pode, :Op1, src=4, tgt=5, op1=:⋆₁)
    add_part!(handcrafted_pode, :Op1, src=5, tgt=2, op1=:dual_d₁)
    add_part!(handcrafted_pode, :Op1, src=1, tgt=2, op1=:∂ₜ)

    simulation = DecapodeSimulation("test/test_jsons/_payload_longtrip.json")
    @test simulation[:pode] == handcrafted_pode
end

@testset "Model Verification - Laplacian, Scalar" begin
end

#= Vorticity =#
@testset "Model Verification - NS Vorticity" begin
   
    handcrafted_pode = SummationDecapode(parse_decapode(quote end))
    add_part!(handcrafted_pode, :Var, name=:v, type=:DualForm1)
    add_part!(handcrafted_pode, :Var, name=:dv, type=:DualForm2)
    add_part!(handcrafted_pode, :Var, name=:ψ, type=:Form0)
    # infer
    add_part!(handcrafted_pode, :Var, name=Symbol("•1"), type=:Form0)
    add_part!(handcrafted_pode, :Var, name=Symbol("•2"), type=:Form1)
    add_part!(handcrafted_pode, :Var, name=Symbol("•3"), type=:infer)
    add_part!(handcrafted_pode, :Var, name=Symbol("•4"), type=:infer)
    add_part!(handcrafted_pode, :Var, name=Symbol("•5"), type=:infer)
    add_part!(handcrafted_pode, :Var, name=Symbol("•6"), type=:infer)
    add_part!(handcrafted_pode, :Var, name=Symbol("•7"), type=:infer)
    # tvar
    add_part!(handcrafted_pode, :TVar, incl=9)
    # op1
    add_part!(handcrafted_pode, :Op1, src=2, tgt=4, op1=:⋆₀⁻¹)
    add_part!(handcrafted_pode, :Op1, src=3, tgt=5, op1=:d₀) # simulation has this wrong
    add_part!(handcrafted_pode, :Op1, src=5, tgt=1, op1=:⋆₁)
    add_part!(handcrafted_pode, :Op1, src=1, tgt=6, op1=:dpsw) # TODO breaks infer_types
    add_part!(handcrafted_pode, :Op1, src=6, tgt=7, op1=:♭♯)
    add_part!(handcrafted_pode, :Op1, src=7, tgt=8, op1=:⋆₁)
    add_part!(handcrafted_pode, :Op1, src=2, tgt=9, op1=:∂ₜ)
    add_part!(handcrafted_pode, :Op1, src=8, tgt=10, op1=:dual_d₁)
    add_part!(handcrafted_pode, :Op1, src=10, tgt=9, op1=:neg)
    infer_types!(handcrafted_pode)
    
    simulation = DecapodeSimulation("test/test_jsons/_navier_stokes_vorticity.json")
    @test simulation[:pode] == handcrafted_pode

end
