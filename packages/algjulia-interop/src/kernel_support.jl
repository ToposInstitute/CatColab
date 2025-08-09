import JSON3

using Serialization, TranscodingStreams, CodecZlib
import Base64

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

function Base.show(io::IO, ::MIME"application/gzip", json::JsonValue)
    buf = IOBuffer()
    binary = Vector{UInt8}(reinterpret(UInt8, vec(json.value)))
    compressed = transcode(GzipCompressor, binary)
    print(io, Base64.base64encode(compressed))
end

function decode_bytes(bytes, shape)
    decompressed = transcode(GzipDecompressor, Base64.base64decode(bytes))
    floats = reinterpret(Float64, decompressed)
    matrix = reshape(floats, shape...)
end
