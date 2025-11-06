module KernelUtility

using MLStyle
import JSON3

export JsonValue

# NOTE: JsonValue should not be used for returning large amounts of data (Anything over 1kb?
# Whatever the size is for "trivially readable by humans"), there is a catastrophic performance
# dropoff as payload size increases. Performance of JsonValue vs
# display(MIME"application/json"(), JSON3.write()) has not been studied in detail, both have bad
# performance, but one might be worse than the other. Whether or not the performance is different might
# help inform a future investigation.
#
# NOTE: the use of the `show` methods is the only way I was able to get the contents of the message
# (`content["data"]?.["application/json"]`) to be interpreted as JSON in the browser. using something
# like `display(MIME"application/json"(), JSON3.write(...))` caused the
# content to be the JSON in string form, even though the mime type was "application/json"
#
# NOTE: It looks like IJulia is delivering payloads for each mime type available according to this
# docstring https://github.com/JuliaLang/IJulia.jl/blob/master/src/display.jl
#
# NOTE: Jason is not 100% confident that these show methods do what it looks like they're doing.
#
# NOTE: Sometime the Jupyter server needs to be restarted. Do not trust performance tests are run twice
# back to back right after server startup.

""" Container for an arbitrary JSON value. """
struct JsonValue
  value::Any
end

function Base.show(io::IO, ::MIME"application/json", json::JsonValue)
  JSON3.write(io, json.value)
end

include("result.jl")
include("kernel_management.jl")

end
