#!/usr/bin/env bash

default_kernel=$(julia -e 'print("julia-$(VERSION.major).$(VERSION.minor)")')

KERNEL=$default_kernel
MODE="https://catcolab.org"

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
		  MODE="https://next.catcolab.org"
		  ;;
		dev)
		  MODE="http://localhost:5173"
		  ;;
		*)
		  echo "$2 is not an eligible mode. Please provide 'production', 'staging', or 'dev'"
		  exit 1
	  esac
	  shift
	  shift
  	  ;;
    *)
  	  echo "unknown option: $1"
  	  exit 1
  	  ;;
  esac
done

jupyter server \
    --IdentityProvider.token="" \
    --ServerApp.disable_check_xsrf=True \
    --ServerApp.allow_origin="$ORIGIN" \
    --ServerApp.allow_credentials=True \
    --MultiKernelManager.default_kernel_name="$KERNEL"
