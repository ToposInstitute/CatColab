using IJulia
using Preferences
import REPL
using REPL.TerminalMenus
using MLStyle

struct KernelNotFoundException <: Exception
    dir::String
end

KernelNotFoundException() = KernelNotFoundException(IJulia.kerneldir())

function Base.showerror(err::KernelNotFoundException)
    """
    IJulia cannot find any kernels in the directory $(err.dir). To install a kernel, you may run `CatColabInterop.install_ccl_kernel()`. Refer to the [IJulia documentation](https://julialang.github.io/IJulia.jl/stable/library/public/#IJulia.installkernel) for more information about managing Jupyter kernels in IJulia.

    If you wish to install a sysimage instead, run
    ```julia
    using PackageCompiler
    install_ccl_kernel(Val(:sysimge))
    ```
    """
end

function Base.showerror(io::IO, err::KernelNotFoundException)
    print(io, showerror(err))
end

const YESNO = ["Yes", "No"]

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
            @info "Preferred mode set to $(modes[choice])"
        end
        Ok("""Mode "$(config.mode)" chosen.""")
    else
        Err("Mode selection canceled")
    end
end
export change_mode!

function change_kernel!(prefer::Bool=true; config::ServerConfig=CONFIG)
    menu = RadioMenu(config.kernels, pagesize=4)
    cursor = something(findfirst(==(config.kernel), config.kernels), 0)
    choice = request("Select a kernel: ", menu; cursor=cursor)
    if choice != -1
        config.kernel = config.kernels[choice]
        if prefer
            @set_preferences!("kernel" => config.kernel)
            @info "Preferred kernel set to $(config.kernels[choice])"
        end
        Ok("Kernel $(config.kernel) chosen.")
    else
        Err("Kernel selection canceled")
    end
end
export change_kernel!

"""    load_kernels()

Loads kernels visible to IJulia's [kernel_dir](@ref IJulia.kerneldir) function.
"""
function load_kernels!(;config::ServerConfig=CONFIG, warn=false)
    dir = IJulia.kerneldir()
    kernels = readdir(dir, join=true)
    if !isempty(kernels)
        config.kernels = kernels
        return Ok("Kernels reloaded!")
    end
    # otherwise, throw a warning or an error
    warn ? @warn(showerror(KernelNotFoundException(dir))) : throw(KernelNotFoundException(dir))
end

"""    uninstall_kernel!(;config::ServerConfig=CONFIG)::Union{Nothing, Bool}

Wraps `Base.rm` in a terminal menu interface to uninstall Julia kernels. Using `Base.rm` is recommended by IJulia.

Usage:
```
uninstall_kernel!()
```
"""
function uninstall_kernel!(;config::ServerConfig=CONFIG)
    isempty(config.kernels) && throw(KernelNotFoundException()) 
    menu = MultiSelectMenu(config.kernels, pagesize=4)
    cursor = something(findfirst(==(config.kernel), config.kernels), 0)
    choices = request("Select a kernel to be uninstalled: ", menu; cursor=cursor)
    if !isempty(choices)
        selections = getindex(config.kernels, collect(choices))
        confirm = RadioMenu(YESNO, pagesize=2)
        permission = request("Kernel(s) will be uninstalled from your machine. Continue?", confirm)
        if YESNO[permission] == "Yes"
            for selection in selections
                isdir(selection) && rm(selection; recursive=true)
                @info selection isdir(selection) "Removed!"
            end
            preferred = @load_preference("kernel", nothing)
            if preferred ∈ selections
                @delete_preferences!("kernel")
                @info "Preferred kernel $preferred was removed."
            end
            load_kernels!(;config=config, warn=true)
            Ok()
        else
            Err("Kernel uninstallation cancelled.")
        end
        Ok("Kernel deletion successful.")
    else
        Err("Kernel uninstallation cancelled")
    end
end
export uninstall_kernel!


"""    install_ccl_kernel!()

This calls IJulia to install a kernel `CatColabInteropKernel` in the current project directory.

To build a sysimage, load the `SysImageExt` package extension by loading `PackageCompiler.jl`. This adds an additional method to `install_ccl_kernel!` which builds the sysimg.

You can see installed kernels visible to IJulia by running `change_kernel!()`.

Usage:

For building an IJulia kernel
```
using CatColabInterop
install_ccl_kernel!()
```
For building the sysimg:
```
using CatColabInterop
using PackageCompiler # loads Julia extension for building the sysimage
install_ccl_kernel!(Val(:sysimg))
```
"""
function install_ccl_kernel!(;config::ServerConfig=CONFIG, kwargs...)
    kernel = installkernel("CatColabInteropKernel", "--project=@.", kwargs...)
    load_kernels!(config=config)
    preferred = @load_preference("kernel", nothing)
    if isnothing(preferred) || length(config.kernels) == 1
        @set_preferences!("kernel" => kernel)
        @info "Preferred kernel set to $(kernel)"
    end
end
export install_ccl_kernel!

function build_jupyter_server_cmd(args::Dict{String, Any})
    return `
    jupyter server \
        --IdentityProvider.token="" \
        --ServerApp.disable_check_xsrf=True \
        --ServerApp.allow_origin="$(args["mode"])" \
        --ServerApp.allow_credentials=True \
        --ServerApp.iopub_data_rate_limit=$(args["limit"]) \
        --MultiKernelManager.default_kernel_name="$(basename(args["kernel"]))"
    `
end

function build_jupyter_server_cmd(config::ServerConfig)
    build_jupyter_server_cmd(Dict{String, Any}("limit" => config.limit, "kernel" => config.kernel, "mode" => origin(config)))
end

"""    start_server(;config::ServerConfig=CONFIG, mode::Union{String, Nothing}=nothing, manual=false)

This starts a Jupyter server with an optional kernel and mode.

The **mode** is the origin for the Jupyter server. Eligible values are "dev", "staging", and "production".

The available kernels can be checked by running `jupyter-server kernelspec list` from the command line or `;jupyter-server kernelspec list` from the REPL.

## Usage:

```julia
start_server!()
# do stuff
stop_server!()
```
To select the kernel and mode in a wizard-like interface,
```julia
start_server!(;manual=true)
```
"""
function start_server!(;config::ServerConfig=CONFIG, mode::Union{String, Nothing}=nothing, manual=false)
    if manual
        change_kernel!(;config=config) | Err("Start server process aborted because kernel selection was cancelled.")
        change_mode!(;config=config) | Err("Start server process aborted because mode selection was cancelled.")
    end
    if isnothing(config.kernel)
        change_kernel!(;config=config)
    end
    if !isnothing(mode)
        set_mode!(config, mode)
    end
    cmd = build_jupyter_server_cmd(config)
    @info "Starting server:
        kernel: $(config.kernel)
        mode: $(origin(config))"
    config.server = open(pipeline(cmd))
end
export start_server!

function stop_server!(;config::ServerConfig=CONFIG)
    if !isnothing(config.server)
        kill(config.server, Base.SIGTERM)
    end
end
export stop_server!
