struct ResultException <: Exception
    msg::String
end

Base.showerror(io::IO, err::ResultException) = print(io, err.msg)

@data Result begin
    Ok(msg::String)
    Err(msg::String)
end

Ok() = Ok("")

Base.show(io::IO, ok::Ok) = !isempty(ok.msg) ? print(io, ok.msg) : nothing
Base.show(io::IO, err::Err) = !isempty(err.msg) ? print(io, err.msg) : nothing

import Base: |

(|)(left::Ok, right) = handle(left)
(|)(left::Err, right) = handle(right)

handle(ok::Ok) = ok
handle(err::Err) = throw(ResultException(err.msg))
