## PLOTTING CODE

abstract type AbstractPlotType end

struct Heatmap <: AbstractPlotType end

# TODO make length a conditional value so we can pass it in if we want
function Base.reshape(::Heatmap, data)
    l = floor(Int64, sqrt(length(data)))
    reshape(data, l, l)
end

# TODO size fixed
# function at_time(sr::SimResult, t::Int)
#     [sr.state[t][i,j][3] for i in 1:51 for j in 1:51]
# end

# function show_heatmap(sr::SimResult, t::Int)
#     data = at_time(result, t)
#     ℓ = floor(Int64, sqrt(length(data)));
#     reshaped = reshape(data, ℓ, ℓ)
#     Plots.heatmap(1:51, 1:51, reshaped, clims=(minimum(data), maximum(data)); palette=:redsblues)
# end

# @gif for t ∈ 1:length(result.time)
#     show_heatmap(result, t)
# end every 5

