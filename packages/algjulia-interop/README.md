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

## For developers

If one is interested in using a version of AlgJuliaInterop.jl that doesn't match
the latest tagged release, then one must first open the Julia environment from the 
test directory (`julia --project=test`) and declare one wants to use the local 
version of the package (press `]` and then `dev .`)
