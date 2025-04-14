begin
    #= /Users/cuffaro.m/.julia/packages/Decapodes/uxntx/src/simulation.jl:692 =#
    (mesh, operators, hodge = GeometricHodge())->begin
            #= /Users/cuffaro.m/.julia/packages/Decapodes/uxntx/src/simulation.jl:692 =#
            #= /Users/cuffaro.m/.julia/packages/Decapodes/uxntx/src/simulation.jl:693 =#
            begin
                #= /Users/cuffaro.m/.julia/packages/Decapodes/uxntx/src/simulation.jl:217 =#
                any_scalar = operators(mesh, :any_scalar)
                (var"GenSim-M_⋆₁", ⋆₁) = default_dec_matrix_generate(mesh, :⋆₁, hodge)
                (var"GenSim-M_⋆₀⁻¹", ⋆₀⁻¹) = default_dec_matrix_generate(mesh, :⋆₀⁻¹, hodge)
                (var"GenSim-M_dual_d₁", dual_d₁) = default_dec_matrix_generate(mesh, :dual_d₁, hodge)
                (var"GenSim-M_d₀", d₀) = default_dec_matrix_generate(mesh, :d₀, hodge)
            end
            #= /Users/cuffaro.m/.julia/packages/Decapodes/uxntx/src/simulation.jl:694 =#
            begin
                #= /Users/cuffaro.m/.julia/packages/Decapodes/uxntx/src/simulation.jl:552 =#
                var"GenSim-M_GenSim-ConMat_0" = var"GenSim-M_dual_d₁" * var"GenSim-M_⋆₁" * var"GenSim-M_d₀" * var"GenSim-M_⋆₀⁻¹"
                var"GenSim-ConMat_0" = (x->begin
                            #= /Users/cuffaro.m/.julia/packages/Decapodes/uxntx/src/simulation.jl:569 =#
                            var"GenSim-M_GenSim-ConMat_0" * x
                        end)
            end
            #= /Users/cuffaro.m/.julia/packages/Decapodes/uxntx/src/simulation.jl:695 =#
            begin
                #= /Users/cuffaro.m/.julia/packages/Decapodes/uxntx/src/simulation.jl:688 =#
            end
            #= /Users/cuffaro.m/.julia/packages/Decapodes/uxntx/src/simulation.jl:696 =#
            begin
                #= /Users/cuffaro.m/.julia/packages/Decapodes/uxntx/src/simulation.jl:686 =#
                var"__•4" = Decapodes.FixedSizeDiffCache(Vector{Float64}(undef, nparts(mesh, :V)))
            end
            #= /Users/cuffaro.m/.julia/packages/Decapodes/uxntx/src/simulation.jl:697 =#
            f(__du__, __u__, __p__, __t__) = begin
                    #= /Users/cuffaro.m/.julia/packages/Decapodes/uxntx/src/simulation.jl:697 =#
                    #= /Users/cuffaro.m/.julia/packages/Decapodes/uxntx/src/simulation.jl:698 =#
                    begin
                        #= /Users/cuffaro.m/.julia/packages/Decapodes/uxntx/src/simulation.jl:261 =#
                        v = __u__.v
                    end
                    #= /Users/cuffaro.m/.julia/packages/Decapodes/uxntx/src/simulation.jl:699 =#
                    begin
                        #= /Users/cuffaro.m/.julia/packages/Decapodes/uxntx/src/simulation.jl:498 =#
                        var"•4" = Decapodes.get_tmp(var"__•4", __u__)
                    end
                    #= /Users/cuffaro.m/.julia/packages/Decapodes/uxntx/src/simulation.jl:700 =#
                    mul!(var"•4", var"GenSim-M_GenSim-ConMat_0", v)
                    v̇ = any_scalar(var"•4")
                    #= /Users/cuffaro.m/.julia/packages/Decapodes/uxntx/src/simulation.jl:701 =#
                    begin
                        #= /Users/cuffaro.m/.julia/packages/Decapodes/uxntx/src/simulation.jl:302 =#
                        setproperty!(__du__, :v, v̇)
                    end
                    #= /Users/cuffaro.m/.julia/packages/Decapodes/uxntx/src/simulation.jl:702 =#
                    return nothing
                end
        end
end