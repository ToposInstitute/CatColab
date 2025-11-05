struct QualifiedName
    segments::Vector{String}
    QualifiedName() = new([])
    QualifiedName(str::String) = new([str])
end

Base.isempty(name::QualifiedName) = isempty(name.segments)
Base.join(name::QualifiedName) = join(name.segments, ".")
Base.convert(::Type{QualifiedName}, str::String) = QualifiedName(str)

Core.Symbol(name::QualifiedName) = Symbol("$(String(name))")

struct QualifiedLabel
    segments::Vector{String}
    QualifiedLabel() = new([])
    QualifiedLabel(str::String) = new([str])
    QualifiedLabel(segments::Vector{String}) = new(segments)
end

# I want to promote the qualified label to Maybe
Core.String(name::QualifiedLabel) = join(name)
Core.Symbol(name::QualifiedLabel) = Symbol("$(String(name))")

Base.isempty(name::QualifiedLabel) = isempty(name.segments)
Base.join(name::QualifiedLabel) = join(name.segments, ".")

Base.convert(::Type{String}, name::QualifiedLabel) = join(name)

function Base.convert(::Type{QualifiedLabel}, data::T) where T<:AbstractVector
    QualifiedLabel([x isa Int ? "•$x" : String(x) for x in data])
end
