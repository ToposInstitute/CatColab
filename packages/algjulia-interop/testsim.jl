begin
    #= /home/you/.julia/packages/Decapodes/RRL4F/src/simulation.jl:687 =#
    (mesh, operators, hodge = GeometricHodge())->begin
            #= /home/you/.julia/packages/Decapodes/RRL4F/src/simulation.jl:687 =#
            #= /home/you/.julia/packages/Decapodes/RRL4F/src/simulation.jl:688 =#
            begin
                #= /home/you/.julia/packages/Decapodes/RRL4F/src/simulation.jl:217 =#
                any_scalar = operators(mesh, :any_scalar)
                (var"GenSim-M_⋆₁", ⋆₁) = default_dec_matrix_generate(mesh, :⋆₁, hodge)
                (var"GenSim-M_⋆₀⁻¹", ⋆₀⁻¹) = default_dec_matrix_generate(mesh, :⋆₀⁻¹, hodge)
                (var"GenSim-M_dual_d₁", dual_d₁) = default_dec_matrix_generate(mesh, :dual_d₁, hodge)
                (var"GenSim-M_d₀", d₀) = default_dec_matrix_generate(mesh, :d₀, hodge)
            end
            #= /home/you/.julia/packages/Decapodes/RRL4F/src/simulation.jl:689 =#
            begin
                #= /home/you/.julia/packages/Decapodes/RRL4F/src/simulation.jl:547 =#
                var"GenSim-M_GenSim-ConMat_0" = var"GenSim-M_dual_d₁" * var"GenSim-M_⋆₁" * var"GenSim-M_d₀" * var"GenSim-M_⋆₀⁻¹"
                var"GenSim-ConMat_0" = (x->begin
                            #= /home/you/.julia/packages/Decapodes/RRL4F/src/simulation.jl:564 =#
                            var"GenSim-M_GenSim-ConMat_0" * x
                        end)
            end
            #= /home/you/.julia/packages/Decapodes/RRL4F/src/simulation.jl:690 =#
            begin
                #= /home/you/.julia/packages/Decapodes/RRL4F/src/simulation.jl:683 =#
            end
            #= /home/you/.julia/packages/Decapodes/RRL4F/src/simulation.jl:691 =#
            begin
                #= /home/you/.julia/packages/Decapodes/RRL4F/src/simulation.jl:681 =#
                var"__•4" = Decapodes.FixedSizeDiffCache(Vector{Float64}(undef, nparts(mesh, :V)))
            end
            #= /home/you/.julia/packages/Decapodes/RRL4F/src/simulation.jl:692 =#
            f(__du__, __u__, __p__, __t__) = begin
                    #= /home/you/.julia/packages/Decapodes/RRL4F/src/simulation.jl:692 =#
                    #= /home/you/.julia/packages/Decapodes/RRL4F/src/simulation.jl:693 =#
                    begin
                        #= /home/you/.julia/packages/Decapodes/RRL4F/src/simulation.jl:261 =#
                        v = __u__.v
                    end
                    #= /home/you/.julia/packages/Decapodes/RRL4F/src/simulation.jl:694 =#
                    begin
                        #= /home/you/.julia/packages/Decapodes/RRL4F/src/simulation.jl:498 =#
                        var"•4" = Decapodes.get_tmp(var"__•4", __u__)
                    end
                    #= /home/you/.julia/packages/Decapodes/RRL4F/src/simulation.jl:695 =#
                    mul!(var"•4", var"GenSim-M_GenSim-ConMat_0", v)
                    v̇ = any_scalar(var"•4")
                    #= /home/you/.julia/packages/Decapodes/RRL4F/src/simulation.jl:696 =#
                    begin
                        #= /home/you/.julia/packages/Decapodes/RRL4F/src/simulation.jl:302 =#
                        setproperty!(__du__, :v, v̇)
                    end
                    #= /home/you/.julia/packages/Decapodes/RRL4F/src/simulation.jl:697 =#
                    return nothing
                end
        end
end