local system = require "pandoc.system"

local rootdir = os.getenv "QUARTO_PROJECT_DIR"
local cachedir = rootdir .. "/.svg-cache"

local thisfile = io.open(rootdir .. "/filters.lua")
local thiscontent = thisfile:read "*all"
thisfile:close()
os.execute("mkdir -p " .. cachedir)

function make_templates(template_paths)
  local templates = {}

  for name, path in pairs(template_paths) do
    local fullpath = rootdir .. "/" .. path
    local file = io.open(fullpath, "r")
    local content = file:read "*all"
    file:close()

    local before_marker, after_marker = content:match "^(.*)@CONTENT(.*)$"
    if before_marker and after_marker then templates[name] = { before_marker, after_marker } end
  end

  return templates
end

local tikz_template_paths = {
  tikz = "_templates/tikz.tex",
}

local tikz_templates = make_templates(tikz_template_paths)

function trim(s) return (s:gsub("^%s*(.-)%s*$", "%1")) end

local function tikz2image(template)
  return function(src, outfile)
    system.with_temporary_directory("tikz2image", function(tmpdir)
      system.with_working_directory(tmpdir, function()
        local f = io.open("tikz.tex", "w")
        f:write(template[1] .. trim(src) .. template[2])
        f:close()
        print()
        print "processing:"
        print(src)
        local texres = os.execute "lualatex -halt-on-error --output-format=dvi tikz.tex > texlog"
        if not texres then
          print "latex errored: log is"
          os.execute "cat texlog"
        else
          os.execute "dvisvgm --clipjoin --scale=1.7 --bbox=papersize --font-format=woff2,autohint tikz.dvi > /dev/null"
          print("output to: " .. outfile)
          os.execute("mv tikz.svg " .. outfile)
        end
      end)
    end)
  end
end

local function file_exists(name)
  local f = io.open(name, "r")
  if f ~= nil then
    io.close(f)
    return true
  else
    return false
  end
end

local function memoize_svg(input, builder, key)
  local svgdir = system.get_working_directory() .. "/_svgs"
  os.execute("mkdir -p " .. svgdir)
  local fbasename = pandoc.sha1(input .. key .. thiscontent) .. ".svg"
  local fname = svgdir .. "/" .. fbasename
  if not file_exists(fname) then builder(input, fname) end
  return pandoc.Image({}, "_svgs/" .. fbasename)
end

function CodeBlock(el)
  local tikz_template = tikz_templates[el.classes[1]]
  if tikz_template ~= nil then
    return pandoc.Div(
      memoize_svg(el.text, tikz2image(tikz_template), tikz_template[1] .. tikz_template[2]),
      { class = "tikz" }
    )
  else
    return el
  end
end
