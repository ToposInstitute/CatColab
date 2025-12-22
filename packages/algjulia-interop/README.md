# AlgebraicJulia Service

This small package makes functionality from
[AlgebraicJulia](https://www.algebraicjulia.org/) available to CatColab.At this 
time, only a [Catlab.jl](https://github.com/AlgebraicJulia/Catlab.jl) service is
provided. Other packages (e.g. Decapodes.jl) will be added in the future.

## Usage

First, install [Julia](https://julialang.org/), say by using
[`juliaup`](https://github.com/JuliaLang/juliaup)
   
Having done that, to start the server, navigate to this directory and run:

```sh
julia --project=test scripts/endpoint.jl
```