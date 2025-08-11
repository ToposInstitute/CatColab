import JSON3

using TranscodingStreams, CodecZlib
import Base64

using StaticArrays

import .DecapodesService: SimResult

export JsonValue

""" Container for an arbitrary JSON value. """
struct JsonValue{T}
  value::T
end

function Base.show(io::IO, ::MIME"text/plain", json::JsonValue{T}) where T
  print(io, "JsonValue(")
  show(IOContext(io, :compact => true), json.value)
  print(io, ")")
end

function Base.show(io::IO, ::MIME"application/json", json::JsonValue{T}) where T 
    JSON3.write(io, json.value)
end

# function Base.show(io::IO, ::MIME"application/json", json::JsonValue{SimResult})
#     JSON3.write(io, [])
# end

function compress(data::Vector{Float64})
    binary = Vector{UInt8}(reinterpret(UInt8, vec(data)))
    compressed = transcode(GzipCompressor, binary)
    Base64.base64encode(compressed)
end

function compress(data::Vector{AbstractArray{SVector{3, Float64}}})
    binary = Vector{UInt8}(reinterpret(UInt8, vcat([vec(arr) for arr in data]...)))
    compressed = transcode(GzipCompressor, binary)
    Base64.base64encode(compressed)
    # compressed
end   

function Base.show(io::IO, ::MIME"application/gzip", value)
    print(io, "")
end

function Base.show(io::IO, ::MIME"application/gzip", sim::SimResult)
    # data = Dict(
    #     "time" => compress(sim.time),
    #     "x" => compress(sim.x), 
    #     "y" => compress(sim.y),
    #     "state" => Dict(k => compress(v) for (k, v) in sim.state)
    # )
    json_str = JSON3.write(sim)
    compressed = transcode(GzipCompressor, json_str)
    # print(io, compressed)
    print(io, Base64.base64encode(compressed))
end


function Base.show(io::IO, ::MIME"application/gzip", json::JsonValue{SimResult})
    show(io, MIME("application/gzip"), json.value)
    # binary = Vector{UInt8}(reinterpret(UInt8, vec(json.value)))
    # compressed = transcode(GzipCompressor, binary)
    # print(io, Base64.base64encode(compressed))
end

function decode_bytes(bytes, shape)
    decompressed = transcode(GzipDecompressor, Base64.base64decode(bytes))
    floats = reinterpret(Float64, decompressed)
    matrix = reshape(floats, shape...)
end

# function compress_state_z(state::Dict{String, Vector{Matrix{SVector{3, Float64}}}})
#     [el[3] for el in state]
#     data = Float64[]
#     for (key, arrays) in state
#         for array in arrays
#             M = Matrix{Float64}
#             M([

# [last.(matrix) for matrix in jv.value.state["v"]]

export state_compress
function state_compress(state)
    state = Dict(k => [last.(matrix) for matrix in v]
                 for (k, v) in state)
    buf = IOBuffer()
    write(buf, length(state))
    for (k, v) in state
        write(buf, length(k))
        write(buf, k)
        write(buf, length(v))
        for m in v
            dims = size(m)
            write(buf, length(dims))
            for d in dims
                write(buf, d)
            end
            for sv in m
                for component in sv
                    write(buf, component)
                end
            end
        end
    end
    binary = take!(buf)
    c = transcode(GzipCompressor, binary)
    return Base64.base64encode(c)
end
