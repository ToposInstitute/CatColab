using CairoMakie

struct HeatEquation end

struct VorticityFc end

function plot(::Type{VorticityFc}, sr::D.SolutionResult, var::Symbol)
    fig = Figure(size=(2000,2000), fontsize=64)
    Label(fig[1, 1, Top()], "Vorticity at $(last(sr.soln.t))", padding = (0, 0, 5, 0))
    ax = LScene(fig[1,1], scenekw=(lights=[],), show_axis=false)
    update_cam!(ax.scene, Vec3f(0,0,0.8), Vec3f(0,0,0), Vec3f(0, 1, 1))
    clrrng = (-5.0,15.0)
    s0inv = sr.system.generate.operators[:s0inv]
    msh = CairoMakie.mesh!(ax, sr.system.geometry.mesh,
      # Observe that s0inv converts d𝐮 from a dual 2-form to a primal 0-form.
      color=s0inv*getproperty(sr.soln(last(sr.soln.t)), var),
      colorrange=clrrng,
      colormap=Reverse(:redsblues))
    Colorbar(fig[1,2], msh, size=32)
    fig
end

"""    function save_vort_gif(file_name)

Given a solution wih vorticity as a dual 2-form, make a GIF with vorticity as a primal 0-form.
"""
function record_gif(::Type{VorticityFc}, file_name, sr::D.SolutionResult, var::Symbol)
  time = Observable(0.0)
  fig = Figure()
  Label(fig[1, 1, Top()], @lift("Vorticity at $($time)"), padding = (0, 0, 5, 0))
  ax = LScene(fig[1,1])
  clrrng = (-5.0,17)
  s0inv = sr.system.generate.operators[:s0inv]
  msh = CairoMakie.mesh!(ax, sr.system.geometry.mesh,
    # Observe that s0inv converts d𝐮 from a dual 2-form to a primal 0-form.
    color=@lift(s0inv*getproperty(sr.soln($time), var)),
    colorrange=clrrng,
    colormap=Reverse(:redsblues))
  Colorbar(fig[1,2], msh)
  times = range(first(sr.soln.t), last(sr.soln.t), length=100)
  record(fig, file_name, times; framerate = 30) do t
      time[] = t
  end
end

function record_gif(::Type{HeatEquation}, file_name, sr::D.SolutionResult, var::Symbol)
    time = Observable(0.0)
    n = floor(Int64, sqrt(length(getproperty(sr.soln(first(sr.soln.t)), var))))
    fig = Figure()
    Label(fig[1, 1, Top()], @lift("Diffusion at $($time)"))
    ax = CairoMakie.Axis(fig[1,1])
    data = Observable(reshape(getproperty(sr.soln(first(sr.soln.t)), var), (n, n)))
    heatmap!(ax, data)
    Colorbar(fig[1,2], ax.scene.plots[end])
    times = range(first(sr.soln.t), last(sr.soln.t), length=100)
    record(fig, file_name, times; framerate=30) do t
        time[] = t
        data[] = reshape(getproperty(sr.soln(t), var), (n, n))
    end
end


# fig, ax, ob = mesh(sr.system.geometry.mesh)
# times = range(0.0, sr.system.duration, length=150)
# record(fig, "diffusion.gif", times; framerate = 30) do t
#   ob.color = getproperty(soln(t), var)
# end


