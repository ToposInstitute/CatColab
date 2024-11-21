import JSON3

export simulate_decapode

# Text => Pode

struct ImplError <: Exception
    name::String
end

Base.showerror(io::IO, e::ImplError) = print("$x not implemented")

""" Helper function to convert CatColab values in Decapodes """
function to_pode(::Val{:Ob}, name::String)
    @match name begin
        "0-form" => :Form0
        "1-form" => :Form1
        "2-form" => :Form2
        # TODO how do we handle Julia errors in CatColab?
        x => throw(ImplError(x))
    end
end

function to_pode(::Val{:Hom}, name::String)
    @match name begin
        "∂ₜ" => :∂ₜ
        "Δ" => :Δ
        x => throw(ImplError(x))
    end
end

# Build the theory

@active IsObject(x) begin
    x["content"]["tag"] == "object" ? Some(x["content"]) : nothing
end

@active IsMorphism(x) begin
    x["content"]["tag"] == "morphism" ? Some(x["content"]) : nothing
end

function add_to_theory!(theory::Dict{String, Any}, content::Any, type::Val{:Ob})
    push!(theory, content["id"] => (name=to_pode(type, content["name"])))
end

function add_to_theory!(theory::Dict{String, ANy}, content::Any, type::Val{:Hom})
    push!(theory, content["id"] => (name=to_pode(type, content["name"]),
                                    val=(dom=content["dom"]["content"], 
                                         cod=content["cod"]["content"])))
end

# for each cell, if it is...
#   ...an object, we convert its type to a symbol and add it to the theorydict
#   ...a morphism, we add it to the theorydict with a field for the ids of its
#       domain and codomain to its
function to_theory(json::JSON)
    theory = Dict{String, Any}();
    foreach(json["notebook"]["cells"]) do cell
        @match cell begin
            IsObject(content) => add_to_theory!(theory, content, Val(:Ob))
            IsMorphism(content) => add_to_theory!(theory, content, Val(:Hom))
            x => throw(ImplError(x))
        end
    end
end

function to_pode(json::JSON, theory::Dict{String, Any})
    d = SummationDecapode(parse_decapode(quote end));
    vars = Dict{String, Int}();
    foreach(json["notebook"]["cells"]) do cell
        @match cell begin
            IsObject(content) => begin
                type = theory[content["over"]["content"]]
                id = add_part!(d, :Var, name=Symbol(content["name"]), type=type)
                push!(vars, content["id"] => id)
            end
            IsMorphism(content) => begin
                dom = content["dom"]["content"]; cod = content["cod"]["content"]
                if haskey(vars, dom) && haskey(vars, cod)
                    op1 = Symbol(theory[content["over"]["content"]].name)
                    add_part!(d, :Op1, src=vars[dom], tgt=vars[cod], op1=op1)

                    if op1 == :∂ₜ
                        add_part!(d, :TVar, incl=vars[cod])
                    end
                end

            end
            _ => throw(ImplError(cell["content"]["tag"]))
        end
    end
    return (d, vars)
end

function create_mesh()
  s = triangulated_grid(100,100,2,2,Point2{Float64})
  sd = EmbeddedDeltaDualComplex2D{Bool, Float64, Point2{Float64}}(s)
  subdivide_duals!(sd, Circumcenter())

  C = map(sd[:point]) do (x, _); return x end;
  u0 = ComponentArray(C=C)

  return (sd, u0, ())
end

function run_sim(fm, u0, t0, constparam)
    prob = ODEProblem(fm, u0, (0, t0), constparam)
    soln = solve(prob, Tsit5(), saveat=0.1)
end

function simulate_decapode(json_string::String)
  data = JSON3.read(json_string)

  theory_fragment = data["content"]["model"]
  diagram = data["content"]["diagram"]

  # fragment = JSON3.read(theory_fragment_string)

  # theory of the DEC
  theory = to_theory(theory_fragment);

  # pode and its variables
  d, vars = to_pode(diagram, theory);

  # mesh mesh
  sd, u0, _ = create_mesh();

  # build simulation
  simulator = eval(gensim(d));
  f = simulator(sd, default_dec_generate, DiagonalHodge());

  # time
  t0 = 10.0;

  result = run_sim(fm, u0, t0, ComponentArray(k=0.5,))
  JsonValue(result)
end
