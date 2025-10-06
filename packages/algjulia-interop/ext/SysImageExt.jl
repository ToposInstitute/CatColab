module SysImageExt 

import CatColabInterop: ServerConfig, load_kernels!, install_ccl_kernel!, CONFIG
import PackageCompiler: create_sysimage
import IJulia: installkernel

function install_ccl_kernel!(::Val{:sysimg}; config::ServerConfig=CONFIG, sysimg = "CatColabInteropSysImage.so")
    @info "Creating the sys image. This may take a while..."
    mktemp() do path, io
        write(io, """import CatColabInterop
              include(joinpath(pkgdir(CatColabInterop), "test", "runtests.jl"))
              """)
        flush(io)
        create_sysimage(["CatColabInterop"], sysimage_path=sysimg, precompile_execution_file=path)
    end

    @info "Adding $sysimg to IJulia kernel"
    installkernel("CatColabInteropSysImage", "--project=@.", "--sysimage=$sysimg")

    load_kernels!()
    @info "Done!"
end

end
