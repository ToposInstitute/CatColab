import JSON3

using TranscodingStreams, CodecZlib
import Base64

using StaticArrays

import .DecapodesService: SimResult

export JsonValue

""" Container for an arbitrary JSON value. """
struct JsonValue
  value::Any
end

function Base.show(io::IO, ::MIME"text/plain", json::JsonValue)
  print(io, "JsonValue(")
  show(IOContext(io, :compact => true), json.value)
  print(io, ")")
end

function Base.show(io::IO, ::MIME"application/json", json::JsonValue) 
    JSON3.write(io, json.value)
end

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
    compressed = transcode(GzipCompressor, Vector{UInt8}(json_str))
    # print(io, compressed)
    print(io, Base64.base64encode(compressed))
end


function Base.show(io::IO, ::MIME"application/gzip", json::JsonValue)
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
