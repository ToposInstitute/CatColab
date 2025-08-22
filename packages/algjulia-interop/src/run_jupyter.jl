using IJulia
using ArgParse
import PackageCompiler: create_sysimage
using Preferences

import REPL
using REPL.TerminalMenus

struct KernelNotFoundException <: Exception
    dir::String
end

function Base.showerror(io, e::KernelNotFoundException)
    print(io, """IJulia cannot find any kernels in
    $(e.dir)
    To install a kernel, you may run `CatColabInterop.install_ccl_kernel()`. Refer to the [IJulia documentation](https://julialang.github.io/IJulia.jl/stable/library/public/#IJulia.installkernel) for more information about managing Jupyter kernels in IJulia.""")
end

const MODES = Dict("dev" => "http://localhost:5173",
             "staging" => "https://next.catcolab.org",
             "production" => "https://catcolab.org")

@kwdef mutable struct ServerConfig
    sysimg_path::Union{String, Nothing} = nothing
    kernels::Vector{String} = readdir(IJulia.kerneldir(), join=true)
    kernel::Union{String, Nothing} = @load_preference("kernel", nothing)
    modes::Dict{String, String} = MODES 
    mode::String = @load_preference("mode", "production")
    limit::Int = 1e9
    server::Union{Base.Process, Nothing} = nothing
end

const CONFIG::ServerConfig = ServerConfig()
export CONFIG

function origin(s::ServerConfig)
    s.modes[s.mode]
end

function Base.show(io::IO, config::ServerConfig)
    kernel = !isnothing(config.kernel) ? config.kernel : "No kernel selected"
    status = !isnothing(config.server) ? "Running" : "Not running."
    s = """
    Current kernel: $kernel
    Server: $status
    Origin: $(origin(config))
    """
    print(io, s)
end

function set_mode!(config::ServerConfig, mode::String)
    if mode ∈ collect(keys(config.modes))
        config.mode = mode
        @info """"$mode" set!"""
    else
        error("""Your selection "$mode" is not a valid mode. Please choose from $(join(config.modes, ", ", " or "))""")
    end
end

function change_mode!(prefer::Bool=true; config::ServerConfig=CONFIG)
    modes = collect(keys(config.modes))
    menu = RadioMenu(modes, pagesize=3)
    cursor = something(findfirst(==(config.mode), modes), 0)
    choice = request("Select a mode: ", menu; cursor = cursor)
    if choice != -1
        config.mode = modes[choice]
        if prefer
            @set_preferences!("mode" => modes[choice])
        end
        println("""Mode "$(config.mode)" chosen.""")
    else
        println("Mode selection canceled")
    end
end
export change_mode!

function change_kernel!(prefer::Bool=true; config::ServerConfig=CONFIG)
    menu = RadioMenu(config.kernels, pagesize=4)
    cursor = something(findfirst(==(config.kernel), config.kernels), 0)
    choice = request("Select a kernel: ", menu; cursor=cursor)
    if choice != -1
        # Assumes kernel name is a path
        config.kernel = basename(config.kernels[choice])
        if prefer
            @set_preferences!("kernel" => config.kernel)
        end
        println("Kernel $(basename(config.kernel)) chosen.")
    else
        println("Kernel selection canceled")
    end
end
export change_kernel!

"""    load_kernels()

Loads kernels visible to IJulia's [kernel_dir](@ref IJulia.kerneldir) function.
"""
function load_kernels!(;config::ServerConfig=CONFIG)
    dir = IJulia.kerneldir()
    kernels = readdir(dir, join=true)
    isempty(kernels) && throw(KernelNotFoundException(dir))
    config.kernels = basename.(kernels)
end

function install_ccl_kernel!(;config::ServerConfig=CONFIG, kwargs...)
    kernel = installkernel("CatColabInteropKernel", "--project=@.", kwargs...)
    load_kernels!(config)
end

function build_jupyter_server_cmd(args::Dict{String, Any})
    return `
    jupyter server \
        --IdentityProvider.token="" \
        --ServerApp.disable_check_xsrf=True \
        --ServerApp.allow_origin="$(args["mode"])" \
        --ServerApp.allow_credentials=True \
        --ServerApp.iopub_data_rate_limit=$(args["limit"]) \
        --MultiKernelManager.default_kernel_name="$(args["kernel"])"
    `
end

function build_jupyter_server_cmd(config::ServerConfig)
    build_jupyter_server_cmd(Dict{String, Any}("limit" => config.limit, "kernel" => config.kernel, "mode" => origin(config)))
end

"""    start_server(;config::ServerConfig=CONFIG, mode::Union{String, Nothing}=nothing)

This starts a Jupyter server with an optional kernel and mode.

The **mode** is the origin for the Jupyter server. Eligible values are "dev", "staging", and "production".

The available kernels can be checked by running `jupyter-server kernelspec list` from the command line or `;jupyter-server kernelspec list` from the REPL.

## Usage:

```julia
start_server!()
# do stuff
stop_server!()
```
"""
function start_server!(;config::ServerConfig=CONFIG, mode::Union{String, Nothing}=nothing)
    if isnothing(config.kernel)
        change_kernel!(;config=config)
    end
    if !isnothing(mode)
        set_mode!(config, mode)
    end
    cmd = build_jupyter_server_cmd(config)
    @info "Starting server:
        kernel: $(config.kernel)
        mode: $(origin(config))
    "
    config.server = open(pipeline(cmd))
end
export start_server!

function stop_server!(;config::ServerConfig=CONFIG)
    if !isnothing(config.server)
        kill(config.server, Base.SIGTERM)
    end
end
export stop_server!

# SYS IMAGE

function build_sysimage(;config::ServerConfig=CONFIG, sysimg = "CatColabInteropSysImage.so")
    @info "Creating the sys image. This may take a while..."
    create_sysimage(["CatColabInterop"], sysimage_path=sysimg,
                    precompile_execution_file="sysimage_precompile.jl")

    @info "Adding $sysimg to IJulia kernel"
    installkernel("CatColabInteropSysImage", "--project=@.", "--sysimage=$sysimg")

    load_kernels!()
    @info "Done!"
end
export build_sysimage
