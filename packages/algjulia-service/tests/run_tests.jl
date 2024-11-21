using Test

@testset "Text-to-Pode" begin

    @test to_pode(Val(:Ob), "0-form") == :Form0
    @test to_pode(Val(:Ob), "1-form") == :Form1
    @test to_pode(Val(:Ob), "2-form") == :Form2
    @test_throws ImplError to_pode(Val(:Ob), "Constant")

    @test to_pode(Val(:Hom), "∂t") == :∂ₜ
    @test to_pode(Val(:Hom), "Δ") == :Δ
    @test_throws ImplError to_pode(Val(:Hom), "∧") 

end

# TODO bikeshedding: is "theoryobj" the proper term, or should the data loaded be named theoryobj and diagram, and the bound variables here be "thoeryobj" and "podeobj"
theoryobj = JSON3.read(fragment); # TODO import fragment
diagram = JSON3.read(pode);

@testset "Parsing the Theory JSON Object" begin

    @test Set(keys(theoryobj)) == Set([:name, :notebook, :theory, :type])

    @test @match theoryobj[:notebook][:cells][1] begin
        IsObject(_) => true
        _ => false
    end
    
    @test @match theoryobj[:notebook][:cells][4] begin
        IsMorphism(_) => true
        _ => false
    end

    theory = Theory();
    @match theoryobj[:notebook][:cells][1] begin
        IsObject(content) => add_to_theory!(theory, content, Val(:Ob))
        _ => nothing
    end

    
end

@testset "Making the Decapode" begin
   
    theory = Theory(theoryobj);
    @test Set(nameof.(values(theory))) == Set([:Form0, :Form1, :Form2, :Δ, :∂ₜ])

    handcrafted_pode = SummationDecapode(parse_decapode(quote end));
    add_part!(handcrafted_pode, :Var, name=:C, type=:Form0);
    add_part!(handcrafted_pode, :Var, name=Symbol("dC/dt"), type=:Form0);
    add_part!(handcrafted_pode, :TVar, incl=2);
    add_part!(handcrafted_pode, :Op1, src=1, tgt=2, op1=:∂ₜ);
    add_part!(handcrafted_pode, :Op1, src=1, tgt=2, op1=:Δ);

    decapode = Decapode(diagram, theory);

    @test decapode == handcrafted_pode 

end
