# AlgebraicJulia Service

This small package makes functionality from
[AlgebraicJulia](https://www.algebraicjulia.org/) available to CatColab. At this 
time, only a [Catlab.jl](https://github.com/AlgebraicJulia/Catlab.jl) service is
provided. Other packages (e.g. Decapodes.jl) will be added in the future.

## Usage

First, install [Julia](https://julialang.org/), say by using
[`juliaup`](https://github.com/JuliaLang/juliaup).

We then need a Julia environment that has all the requisite packages installed.
The `test` folder of this repo is a perfectly good candidate for this, although 
in principal one might want to use their own environment (if they don't want to 
load all dependencies for all possible analyses, or if they have a locally 
modified version of the code that is running the analysis). To make sure this 
environment is ready to use, navigate to this directory and run 
`julia --project=test` and then press `]` and enter the commands `instantiate` 
and `precompile`.
   
Having done that, to start the server, from this directory run:

```sh
julia --project=test scripts/endpoint.jl
```

This starts an instance that is listening on localhost port 8080. When you run 
CatColab, you should be able to use analyses that communicate with Julia via 
this address.

## For developers

If one is interested in using a version of CatColabInterop.jl that doesn't match
the latest tagged release, then one must first open the Julia environment from the 
test directory (`julia --project=test`) and declare one wants to use the local 
version of the package (press `]` and then `dev .`)
