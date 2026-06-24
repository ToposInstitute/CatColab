abstract type AbstractIC end

struct A1 <: AbstractIC end
struct A2 <: AbstractIC end

abstract type Domain end

struct B1 <: Domain end
struct B2 <: Domain end

struct Geometry{B<:Domain} end

# get all abstract conditions for a given domain

function f(::A1, ::Geometry{B1}) end
function f(::A2, ::Geometry{B1}) end
function f(::A2, ::Geometry{B2}) end

ms = methods(f)

map(subtypes(Domain)) do mesh
    ics = map(intersect(methodswith(Geometry{mesh}), ms)) do m
        ic = m.sig.parameters[2]
        string(nameof(ic))
    end
    mesh = string(nameof(mesh))
    mesh => ics
end

# map(subtypes(AbstractIC)) do ic
#     domains = map(intersect(methodswith(ic), ms)) do m
#         domain = m.sig.parameters[3].parameters[1]
#         string(nameof(domain))
#     end
#     ic = string(nameof(ic))
#     ic => domains
# end
