# =======================================================================

"""    DecapodeSimulation

This analysis contains the data necessary to execute a simulation.
"""
struct DecapodeSimulation
    pode::SummationDecapode
    plotVariables::Dict{String, Bool}
    scalars::Dict{Symbol, Any} # closures
    geometry::Geometry
    init::ComponentArray
    generate::Any
    uuiddict::Dict{Symbol, String}
    duration::Int
end
export DecapodeSimulation

function DecapodeSimulation(path::String; kwargs...)
    payload = JSON3.read(path, Analysis)
    DecapodeSimulation(payload; kwargs...)
end

# TODO we need to amend this so other parameters are provided
function DecapodeSimulation(analysis::Analysis; hodge=GeometricHodge())
    wrapped = DecapodeDiagram(analysis)
    plotVars = @match analysis.analysis[:plotVariables] begin
        vars::AbstractArray => Dict{String, Bool}(key => key ∈ vars for key ∈ keys(wrapped.vars))
        vars => Dict{String, Bool}( "$key" => var for (key, var) in vars) # TODO
    end
    dot_rename!(wrapped.pode)
    uuid2symb = uuid_to_symb(wrapped.pode, wrapped.vars)
    geometry = Geometry(analysis)
    ♭♯_m = ♭♯_mat(geometry.dualmesh)
    wedge_dp10 = dec_wedge_product_dp(Tuple{1,0}, geometry.dualmesh)
    dual_d1_m = dec_dual_derivative(1, geometry.dualmesh)
    star0_inv_m = dec_inv_hodge_star(0, geometry.dualmesh, hodge)
    Δ0 = Δ(0,geometry.dualmesh)
    #fΔ0 = factorize(Δ0);
    function sys_generate(s, my_symbol)
        op = @match my_symbol begin
            sym && if haskey(wrapped.scalars, sym) end => x -> begin
                k = scalars[wrapped.scalars[sym]]
                k * x
            end
            :♭♯ => x -> ♭♯_m * x
            :dpsw => x -> wedge_dp10(x, star0_inv_m*(dual_d1_m*x))
            :Δ⁻¹ => x -> begin
                y = Δ0 \ x
                y .- minimum(y)
            end
            _ => default_dec_matrix_generate(s, my_symbol, hodge)
        end
        return (args...) -> op(args...)
    end
    #
    @info analysis.analysis[:initialConditions] 
    u0 = initial_conditions(analysis.analysis[:initialConditions], geometry, uuid2symb)

    # reversing `uuid2symb` into `symbol => uuid.` we need this to reassociate the var to its UUID 
    symb2uuid = Dict([v => k for (k,v) in pairs(uuid2symb)])

    # TODO what is anons doing here?
    anons = Dict{Symbol, Any}()
    DecapodeSimulation(wrapped.pode, plotVars, wrapped.scalars, geometry, u0, sys_generate, symb2uuid, analysis.analysis[:duration])
end

Base.show(io::IO, system::DecapodeSimulation) = println(io, system.pode)


