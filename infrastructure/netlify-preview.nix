# Wraps site-staging with Netlify-specific _redirects for PR preview deploys.
{
  pkgs,
  self,
}:
let
  site = self.packages.${pkgs.system}.site-staging;
in
pkgs.runCommand "catcolab-netlify-preview" { } ''
  cp -rL ${site} $out
  chmod -R u+w $out

  cat > $out/_redirects << 'EOF'
/dev/rust /dev/rust/catlog
/dev/core /dev/rust/catlog
/dev/catcolab_backend /dev/rust/backend
/math /math/index.xml
/maths /math/index.xml
/* /index.html 200
EOF
''
