#!/usr/bin/env julia

@info "Verifying PackageCompiler is installed globally"
using Pkg; Pkg.activate(); Pkg.add("PackageCompiler")
using PackageCompiler

@info "Activating sysimage environment"
Pkg.activate(@__DIR__)

@info "Creating the sysimage. This may take a while..."
sysimg="AlgebraicJuliaService.so"
create_sysimage(["AlgebraicJuliaService"], sysimage_path=sysimg,
                precompile_execution_file="sysimage_precompile.jl")
sysimg_path=joinpath(@__DIR__, sysimg);

@info "Adding $sysimg_path to IJulia kernel"
Pkg.activate(); Pkg.add("IJulia")
using IJulia

installkernel("Julia AJaaS", "--project=@.", "--sysimage=$sysimg_path")

@info "Done!"
exit()
