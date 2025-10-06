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

To start the server, run the following in a Julia REPL
```julia
using CatColabInterop
start_server!()
```
This will run the Jupyter kernel in the REPL. You may stop the server by
running `stop_server!()`. While the Jupyter server is running, the AlgebraicJulia service will be usable by CatColab when served locally.

## Compiling a Sysimage

Precompiling dependencies like `CairoMakie.jl` and `OrdinaryDiffEq.jl` can be
time-consuming. A **sysimage** is a file that stores precompilation statements,
making future invocations of `AlgebraicJuliaService` and its dependencies
immediate.

To build a sysimage, run `build_sysimage()` in a REPL where `CatColabInterop`
module is in scope. This process may take upwards of five minutes or longer, depending on your machine.

Building a sysimage installs an additional kernel which points to the sysimage. You may change the kernel to your sysimage by running `change_kernel!()`, which will populate a menu of kernels in your IJulia kernel directory.

