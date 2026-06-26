module Defaults
    export default_values, @default

    function default_values end
    
    using MLStyle: @λ
    macro default(body)
        params = Any[]
        abstract_type = nothing
        defaults = Dict{Symbol, Any}()
        struct_type = nothing
        runner = @λ begin
            Expr(:struct, bool, Expr(:(<:), name::Symbol, parent), block) => begin
                struct_type = Expr(:curly, :Type, name)
                abstract_type = parent
                Expr(:macrocall, GlobalRef(Base, Symbol("@kwdef")), nothing,
                    Expr(:struct, bool, Expr(:(<:), name, parent), runner(block)))
            end
            Expr(:struct, bool, Expr(:(<:), Expr(:curly, name, type_params...), parent), block) => begin
                struct_type = Expr(:curly, :Type, Expr(:curly, name, type_params...))
                append!(params, type_params)
                abstract_type = parent
                Expr(:macrocall, GlobalRef(Base, Symbol("@kwdef")), nothing,
                    Expr(:struct, bool, Expr(:(<:), Expr(:curly, name, type_params...), parent), runner(block)))
            end
            Expr(:struct, bool, Expr(:curly, name, type_params...), block) => begin
                struct_type = Expr(:curly, :Type, Expr(:curly, name, type_params...))
                append!(params, type_params)
                Expr(:macrocall, GlobalRef(Base, Symbol("@kwdef")), nothing,
                    Expr(:struct, bool, Expr(:curly, name, type_params...), runner(block)))
            end
            Expr(:struct, bool, name, block) => begin
                struct_type = Expr(:curly, :Type, name)
                Expr(:macrocall, GlobalRef(Base, Symbol("@kwdef")), nothing,
                    Expr(:struct, bool, name, runner(block)))
            end
            Expr(:block, args...) => Expr(:block, runner.(args)...)
            Expr(:(=), Expr(:(::), field, type), val) => begin
                defaults[field] = val
                Expr(:(=), Expr(:(::), field, type), val)
            end
            s => s
        end

        # kwdef
        kwdef_body = runner(body)
        pairs = [Expr(:call, :(=>), QuoteNode(k), v) for (k, v) in defaults]
        body_expr = Expr(:call, :(Dict{Symbol,Any}), pairs...)        
        kwdef_body_expr = quote
            $kwdef_body
        end

        # default_values
        call = :( default_values(::$struct_type) )
        wheres = copy(params)
        sig = isempty(wheres) ? call : Expr(:where, call, wheres...)
        func = Expr(:function, sig, body_expr)

        # result
        out = quote
            $kwdef_body_expr
        end
        push!(out.args, func)
        esc(out)
    end
end
