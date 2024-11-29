begin
    #= /home/you/.julia/packages/Decapodes/MGJA6/src/simulation.jl:758 =#
    (mesh, operators, hodge = GeometricHodge())->begin
            #= /home/you/.julia/packages/Decapodes/MGJA6/src/simulation.jl:758 =#
            #= /home/you/.julia/packages/Decapodes/MGJA6/src/simulation.jl:759 =#
            begin
                #= /home/you/.julia/packages/Decapodes/MGJA6/src/simulation.jl:235 =#
                (var"GenSim-M_⋆₀⁻¹", ⋆₀⁻¹) = default_dec_matrix_generate(mesh, :⋆₀⁻¹, hodge)
                (var"GenSim-M_d₀", d₀) = default_dec_matrix_generate(mesh, :d₀, hodge)
                (var"GenSim-M_⋆₁", ⋆₁) = default_dec_matrix_generate(mesh, :⋆₁, hodge)
                (var"GenSim-M_dual_d₁", dual_d₁) = default_dec_matrix_generate(mesh, :dual_d₁, hodge)
            end
            #= /home/you/.julia/packages/Decapodes/MGJA6/src/simulation.jl:760 =#
            begin
                #= /home/you/.julia/packages/Decapodes/MGJA6/src/simulation.jl:619 =#
                var"GenSim-M_GenSim-ConMat_1" = var"GenSim-M_⋆₀⁻¹" * var"GenSim-M_dual_d₁" * var"GenSim-M_⋆₁" * var"GenSim-M_d₀"
                var"GenSim-ConMat_1" = (x->var"GenSim-M_GenSim-ConMat_1" * x)
            end
            #= /home/you/.julia/packages/Decapodes/MGJA6/src/simulation.jl:761 =#
            begin
                #= /home/you/.julia/packages/Decapodes/MGJA6/src/simulation.jl:140 =#
                var"__•1" = Decapodes.FixedSizeDiffCache(Vector{Float64}(undef, nparts(mesh, :V)))
            end
            #= /home/you/.julia/packages/Decapodes/MGJA6/src/simulation.jl:762 =#
            f(du, u, p, t) = begin
                    #= /home/you/.julia/packages/Decapodes/MGJA6/src/simulation.jl:762 =#
                    #= /home/you/.julia/packages/Decapodes/MGJA6/src/simulation.jl:763 =#
                    begin
                        #= /home/you/.julia/packages/Decapodes/MGJA6/src/simulation.jl:297 =#
                        C = u.C
                    end
                    #= /home/you/.julia/packages/Decapodes/MGJA6/src/simulation.jl:764 =#
                    begin
                        #= /home/you/.julia/packages/Decapodes/MGJA6/src/simulation.jl:534 =#
                        var"•1" = Decapodes.get_tmp(var"__•1", u)
                    end
                    #= /home/you/.julia/packages/Decapodes/MGJA6/src/simulation.jl:765 =#
                    mul!(var"•1", var"GenSim-M_GenSim-ConMat_1", C)
                    #= /home/you/.julia/packages/Decapodes/MGJA6/src/simulation.jl:766 =#
                    begin
                        #= /home/you/.julia/packages/Decapodes/MGJA6/src/simulation.jl:338 =#
                        setproperty!(du, :C, var"dC/dt")
                    end
                    #= /home/you/.julia/packages/Decapodes/MGJA6/src/simulation.jl:767 =#
                    return nothing
                end
        end
end