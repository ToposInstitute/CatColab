#!/usr/bin/env bash

USAGE=$(cat <<-END
    \033[1mUsage:\033[0m
	
    -k|--kernel: specify the kernel. Defaults to the value of julia-\$(VERSION.major).\$(VERSION.minor). 
    
    -m|--mode: a keyword which specifies the domain/port the Jupyter server is accessible. Valid arguments are 'dev', 'staging', and 'production' (default).
	END
)

KERNEL=$(julia -e 'print("julia-$(VERSION.major).$(VERSION.minor)")')
ORIGIN="https://catcolab.org"

while [[ $# -gt 0 ]]; do
  case $1 in
    -k|--kernel)
	  KERNEL=$2
  	  shift
	  shift
  	  ;;
    -m|--mode)
	  case "$2" in
		production)
		  ;;
		staging)
		  ORIGIN="https://next.catcolab.org"
		  ;;
		dev)
		  ORIGIN="http://localhost:5173"
		  ;;
		*)
		  echo "$2 is not an eligible mode. Please provide 'production', 'staging', or 'dev'"
		  exit 1
	  esac
	  shift
	  shift
  	  ;;
	-h|--help)
	  echo -e "$USAGE" 
	  ;;
    *)
  	  echo "    Unknown option: $1
	  "
	  echo -e "$USAGE"
  	  exit 1
  	  ;;
  esac
done

jupyter server \
    --IdentityProvider.token="" \
    --ServerApp.disable_check_xsrf=True \
    --ServerApp.allow_origin="$ORIGIN" \
    --ServerApp.allow_credentials=True \
    --ServerApp.iopub_data_rate_limit=1000000000 \
    --MultiKernelManager.default_kernel_name="$KERNEL"
