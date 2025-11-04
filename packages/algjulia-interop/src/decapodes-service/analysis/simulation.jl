struct DecapodeSimulation <: AbstractAnalysis{ThDecapode}
    diagram::ModelDiagramPresentation{ThDecapode}
    model::Model{ThDecapode}
    data::AbstractDict
end
export DecapodeSimulation

function DecapodeSimulation(path::String; hodge=GeometricHodge())
    payload = Payload(ThDecapode(), path)
    DecapodeSimulation(payload)
end

#=
Simulation: Payload => Analysis 
=#
function DecapodeSimulation(payload::Payload; hodge=GeometricHodge())
    pode = DecapodeDiagram(payload)
    plotVars = @match payload.data[:plotVariables] begin
        vars::AbstractArray => Dict{String, Bool}(key => key ∈ vars for key ∈ keys(pode.vars))
        vars => Dict{String, Bool}( "$key" => var for (key, var) in vars)
    end
    dot_rename!(pode.pode)
    uuid2symb = uuid_to_symb(pode.pode, pode.vars)
    geometry = Geometry(payload) # TODO
    ♭♯_m = ♭♯_mat(geometry.dualmesh)
    wedge_dp10 = dec_wedge_product_dp(Tuple{1,0}, geometry.dualmesh)
    dual_d1_m = dec_dual_derivative(1, geometry.dualmesh)
    star0_inv_m = dec_inv_hodge_star(0, geometry.dualmesh, hodge)
    Δ0 = Δ(0,geometry.dualmesh)
    #fΔ0 = factorize(Δ0);
    function sys_generate(s, my_symbol)
        op = @match my_symbol begin
            sym && if haskey(pode.scalars, sym) end => x -> begin
                k = scalars[pode.scalars[sym]]
                k * x
            end
            :♭♯ => x -> ♭♯_m * x
            # TODO are we indexing right?
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
    u0 = initial_conditions(payload.data[:initialConditions], geometry, uuid2symb)

    # reversing `uuid2symb` into `symbol => uuid.` we need this to reassociate the var to its UUID 
    symb2uuid = Dict([v => k for (k,v) in pairs(uuid2symb)])

    anons = Dict{Symbol, Any}()
    data = Dict(
        :pode => pode.pode,
        :plotVars => plotVars,
        :scalars => anons,
        :geometry => geometry,
        :init => u0,
        :generate => sys_generate,
        :uuiddict => symb2uuid,
        :duration => payload.data[:duration])
    return DecapodeSimulation(payload.diagram, payload.model, data)
end

Base.show(io::IO, system::DecapodeSimulation) = println(io, system.data[:pode])

points(system::DecapodeSimulation) = collect(values(system.data[:geometry].dualmesh.subparts.point.m))
indexing_bounds(system::DecapodeSimulation) = indexing_bounds(system.data[:geometry].domain)

function Base.run(fm, u0, t0, constparam)
    prob = ODEProblem(fm, u0, (0, t0), constparam)
    solve(prob, Tsit5(), saveat=0.01)
end
export run

struct SimResult
    time::Vector{Float64}
    state::Dict{String, Vector{AbstractArray{SVector{3, Float64}}}}
    x::Vector{Float64} # axis
    y::Vector{Float64}
end
export SimResult

function SimResult(soln::ODESolution, system::DecapodeSimulation)
    idx_bounds = indexing_bounds(system)
    state_val_dict = variables_state(soln, system) # Dict("UUID1" => VectorMatrixSVectr...)
    SimResult(soln.t, state_val_dict, 0:idx_bounds.x, 0:idx_bounds.y)
end
# TODO generalize to HasDeltaSet

""" for the variables in a system, associate them to their state values over the duration of the simulation """
function variables_state(soln::ODESolution, system::DecapodeSimulation)
    plottedVars = [ k for (k, v) in system.data[:plotVars] if v == true ]
    uuid2symb = Dict([ v => k for (k, v) in system.data[:uuiddict]]) # TODO why reverse again?
    Dict([ String(uuid2symb[var]) => state_entire_sim(soln, system, uuid2symb[var]) for var ∈ plottedVars ])
end

""" given a simulation, a domain, and a variable, gets the state values over the duration of a simulation. 
Called by `variables_state`[@ref] """
function state_entire_sim(soln::ODESolution, system::DecapodeSimulation, var::Symbol)
    map(1:length(soln.t)) do i
        state_at_time(soln, system, var, i)
    end
end

# TODO type `points`
function state_at_time(soln::ODESolution, system::DecapodeSimulation, plotvar::Symbol, t::Int)
    @match system.data[:geometry].domain begin
        # TODO check time indexing here
        domain::Rectangle => state_at_time(soln, domain, plotvar, t) 
        domain::Sphere => state_at_time(soln, domain, plotvar, t, points(system)) 
        _ => throw(ImplError("state_at_time function for domain $domain"))
    end
end

function state_at_time(soln::ODESolution, domain::Rectangle, var::Symbol, t::Int)
    (x, y) = indexing_bounds(domain)
    [SVector(i, j, getproperty(soln.u[t], var)[(x+1)*(i-1) + j]) for i in 1:x+1, j in 1:y+1]
end

# TODO just separated this from the SimResult function and added type parameters, but need to generalize
function grid(pt3::Point3, grid_size::Vector{Int})
    pt2 = [(pt3[1]+1)/2, (pt3[2]+1)/2]
    [round(Int, pt2[1]*grid_size[1]), round(Int, pt2[2]*grid_size[2])]
end

function state_at_time(soln::ODESolution, domain::Sphere, var::Symbol, t::Int, points)
    l , _ = indexing_bounds(domain) # TODO this is hardcoded to return 100, 100
    northern_indices = filter(i -> points[i][3] > 0, keys(points)) 
    map(northern_indices) do n
        i, j = grid(points[n], [l, l]) # TODO
        SVector(i, j, getproperty(soln.u[t], var)[n])
    end
end

