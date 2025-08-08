using ArgParse

SERVER = nothing 

LOG = tempname()

KERNELS = []

# TODO get default kernel
function load_kernels()
    # check if defined
    buf = open(`jupyter kernelspec list`, "r")
    for line in eachline(buf)
        kernel, path = filter(!isempty, split(strip(line), " "))
        isdir(path) && push!(KERNELS, kernel)
    end
end

function build_ijulia()
    if !isinstalled("IJulia")
        Pkg.add("IJulia")
    end
    installkernel("CatColabInteropKernel", "--project=@.")
end

load_kernels()

# check if there is a kernel
DEFAULT = Dict(:kernel => KERNELS[1], 
               :mode => "production")

MODES = Dict("dev" => "http://localhost:5173", 
             "staging" => "https://next.catcolab.org",
             "production" => "https://catcolab.org")

function parse_commandline()
    s = ArgParseSettings()
    @add_arg_table s begin
        "-k", "--k"
            help = "pass the kernel"
            default = DEFAULT[:kernel]
        "-m", "--mode"
            help = "Provide 'production', 'staging', or 'dev'"
            type = String
            default = DEFAULT[:mode]
    end
    return parse_args(s)
end


function build_command(args::Dict{String, Any})
    origin = MODES[args["mode"]]
    return `
    jupyter server \
        --IdentityProvider.token="" \
        --ServerApp.disable_check_xsrf=True \
        --ServerApp.allow_origin="$origin" \
        --ServerApp.allow_credentials=True \
        --MultiKernelManager.default_kernel_name="$(args["kernel"])"
    `
end

"""    start_server(;kernel=DEFAULT[:kernel], mode=DEFAULT[:mode])

This starts a Jupyter server with an optional kernel and mode.

The **mode** is the origin for the Jupyter server. Eligible values are "dev", "staging", and "production".

The available kernels can be checked by running `jupyter-server kernelspec list` from the command line or `;jupyter-server kernelspec list` from the REPL.

Usage:

```julia
stream = start_server()
# closes the process
kill(stream)
```
"""
function start_server(;kernel::AbstractString=DEFAULT[:kernel],  mode::AbstractString=DEFAULT[:mode])
    cmd = build_command(Dict{String,Any}("kernel"=>kernel, "mode"=>mode))
    open(pipeline(cmd, stdout=LOG, stderr=LOG))
end
export start_server

function start_server_cli()
    args = parse_commandline()
    cmd = build_command(args)
    open(cmd) 
end

read
