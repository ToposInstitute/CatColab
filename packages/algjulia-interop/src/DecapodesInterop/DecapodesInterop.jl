"""
    This module is for interfacing with Decapodes.jl, a multiphysics package in the AlgebraicJulia ecosystem. 
"""
module DecapodesInterop

# Julia packages
using ComponentArrays
using Distributions
using MLStyle
using StaticArrays
using LinearAlgebra
using OrdinaryDiffEq
using CoordRefSystems
using DiffEqCallbacks
using StructEquality

# Communication packages
using Oxygen, HTTP, JSON3, URIs

# AlgebraicJulia packages
using ACSets
using CombinatorialSpaces
using DiagrammaticEquations
import DiagrammaticEquations: SummationDecapode
using Decapodes

# CatColabInterop
using CatColabInterop
import CatColabInterop: endpoint

struct ImplError <: Exception
    name::String
end
export ImplError
Base.showerror(io::IO, e::ImplError) = print(io, "$(e.name) not implemented")

# Specifying meshes
include("geometry.jl")
export Geometry

# code specific to NS equations
include("ns_helper.jl")

# Specifying the initial conditions
include("initial_conditions.jl")
using .InitialConditions
export default_values

# Interpret the ModelDiagram struct into a Decapode
include("model_diagram.jl")

# Build the analysis
include("simulation.jl")

# for formatting the data into the correct return type
include("formatting.jl")

# DecapodesInterop-specific reflection utilities
include("util.jl")

"""
    This parses an incoming Analysis JSON, interprets it into a Decapode simulation object, and executes it. 
"""
function endpoint(::Val{:Decapodes})
    @post "/decapodes" function (req::HTTP.Request)
        analysis = json(req, Analysis)
        system = DecapodesSystem(analysis)
        result = run(system)
    end
end

function make_progress_callback(stream::HTTP.Stream, tspan)
    t0, tf = tspan
    last_write = Ref(time())
    DiscreteCallback(
        (u, t, integrator) -> true,
        (integrator) -> begin
            now = time()
            if last_write[] == 0.0
                write(stream, JSON3.write(Dict("status" => "running")) * "\n")
            end
            if now - last_write[] > 0.1
                frac = clamp((integrator.t - t0) / (tf - t0), 0.0, 1.0)
                @info "Writing progress" frac
                write(stream, JSON3.write(Dict("progress" => frac)) * "\n")
                if frac == 1.0
                    write(stream, JSON3.write(Dict("status" => "finalizing")) * "\n")
                end  
                flush(stream)
                last_write[] = now
            end
        end;
        save_positions = (false, false)
    )
end

function endpoint(::Val{:DecapodesString})
    @post "/decapodes-string" function(stream::HTTP.Stream)
        payload = HTTP.payload(stream.message)
        analysis = JSON3.read(payload, Analysis)
        system = DecapodesSystem(analysis)

        @info "Starting"
        HTTP.setheader(stream, "Content-Type" => "application/x-ndjson")
        HTTP.setheader(stream, "Access-Control-Allow-Origin" => "*")
        startwrite(stream)

        write(stream, JSON3.write(Dict("status" => "initializing")) * "\n")
        flush(stream)

        callback = make_progress_callback(stream, (0, system.duration))
        result = run(system; callback=callback)
        formatted = format(system.geometry.dualmesh, result)
        write(stream, JSON3.write(Dict("progress" => 1.0, "data" => formatted)) * "\n")
        closewrite(stream)
    end
end

"""
    This returns a dictionary of
        - supported meshes
        - dictionary of meshes with their information
        - dictionary of initial conditions
"""
function endpoint(::Val{:DecapodesOptions})
    @get "/decapodes-options" function (req::HTTP.Request)
        supported_options()
    end
end

end # module
