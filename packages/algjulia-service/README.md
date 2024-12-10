# AlgebraicJulia Service

This small package makes functionality from
[AlgebraicJulia](https://www.algebraicjulia.org/) available to CatColab,
intermediated by a Julia kernel running in the [Jupyter](https://jupyter.org/)
server. At this time, only a
[Decapodes.jl](https://github.com/AlgebraicJulia/Decapodes.jl) service is
provided. Other packages may be added in the future.

## Setup

1. Install [Julia](https://julialang.org/), say by using
[`juliaup`](https://github.com/JuliaLang/juliaup)
2. Install [Jupyter](https://jupyter.org/), say by using `pip` or `conda`
3. Install [IJulia](https://github.com/JuliaLang/IJulia.jl), which provides the
   Julia kernel to Jupyter
   
At this stage, you should be able to launch a Julia kernel inside a JupyterLab.

Having done that, navigate to this directory and run:

```sh
julia --project -e 'import Pkg; Pkg.instantiate()'
```

## Usage

Navigate to this directory and run:

```sh
jupyter server --IdentityProvider.token="" --ServerApp.disable_check_xsrf=True --ServerApp.allow_origin="http://localhost:5173"
```

While the Jupyter server is running, the AlgebraicJulia service will be usable
by CatColab served locally.

## Compiling a Sysimage

Julia precompilation for packages like `CairoMakie.jl` and `OrdinaryDiffEq.jl`
can be time-consuming. A **sysimage** is a file which stores precompilation
statements, making future invocations of `AlgebraicJuliaService` and its
dependencies immediate.

In order to build a sysimage, navigate to `packages/sysimages` and run
`~/.init-sysimg.jl` as a script. This process may take upwards of six minutes or
longer, depending on your machine.
